/* The original text format of the DCT compressor, kept byte-compatible:
 *
 *   width height
 *   DC run value run value ... [run]      (one line per 8x8 block, blocks in raster order)
 *
 * Each block is the luma channel minus 128, transformed, divided by a fixed table, rounded, clamped
 * to [-128, 127] and read diagonal by diagonal. After the DC term, every run of zeros is written as its
 * length, followed by the nonzero value that ends it (a trailing run has no value after it).
 */
#include "pixelsmith.h"

#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const int classic_table[64] = {
    16, 10, 10, 16, 25,  41,  50,  61,  12, 13, 14, 19, 26,  58,  60,  54,
    14, 12, 16, 24, 41,  56,  68,  57,  14, 16, 22, 29, 51,  87,  81,  63,
    18, 23, 37, 56, 69,  108, 102, 76,  24, 34, 55, 64, 80,  105, 113, 92,
    49, 65, 78, 87, 103, 120, 120, 100, 72, 93, 95, 98, 113, 100, 103, 98};

/* The original reads each anti-diagonal from the top row down, always in the same direction (the
   JPEG zigzag alternates). diagonal[i] = row * 8 + column of the i-th coefficient. */
static void diagonal_order(int diagonal[64])
{
    int index = 0;
    for (int sum = 0; sum <= 14; sum++) {
        int first = sum > 7 ? sum - 7 : 0, last = sum > 7 ? 7 : sum;
        for (int row = first; row <= last; row++)
            diagonal[index++] = row * 8 + sum - row;
    }
}

static int clamp_signed(double value)
{
    if (value < -128)
        return -128;
    if (value > 127)
        return 127;
    return (int)value;
}

/* Gray level as stb_image computes it when asked for one channel, so that color inputs give the same
   numbers as the original program. Alpha is ignored. */
static int gray_at(const ps_image *image, size_t index)
{
    const uint8_t *p = image->data + index * image->channels;
    if (image->channels >= 3)
        return (p[0] * 77 + p[1] * 150 + 29 * p[2]) >> 8;
    return p[0];
}

typedef struct {
    char *data;
    size_t size, capacity;
} text_buffer;

static int append(text_buffer *t, const char *s, size_t n)
{
    if (t->size + n + 1 > t->capacity) {
        size_t capacity = t->capacity ? t->capacity * 2 : 65536;
        while (capacity < t->size + n + 1)
            capacity *= 2;
        char *grown = realloc(t->data, capacity);
        if (!grown)
            return 0;
        t->data = grown;
        t->capacity = capacity;
    }
    memcpy(t->data + t->size, s, n);
    t->size += n;
    t->data[t->size] = 0;
    return 1;
}

static int append_int(text_buffer *t, const char *prefix, int value)
{
    char number[24];
    int n = snprintf(number, sizeof number, "%s%d", prefix, value);
    return append(t, number, (size_t)n);
}

ps_status ps_classic_encode(const ps_image *image, char **text, size_t *size)
{
    if (!image || !image->data || !text || !size)
        return PS_ERR_ARG;
    *text = NULL;
    *size = 0;
    int width = image->width - image->width % 8;
    int height = image->height - image->height % 8;
    text_buffer t = {0};
    char header[48];
    int n = snprintf(header, sizeof header, "%d %d\n", width, height);
    if (!append(&t, header, (size_t)n))
        return PS_ERR_NOMEM;
    double basis[8][8];
    int diagonal[64];
    ps_dct_basis(basis);
    diagonal_order(diagonal);
    for (int by = 0; by < height; by += 8)
        for (int bx = 0; bx < width; bx += 8) {
            double block[8][8], coefficients[8][8];
            for (int r = 0; r < 8; r++)
                for (int c = 0; c < 8; c++)
                    block[r][c] = gray_at(image, (size_t)(by + r) * image->width + bx + c) - 128;
            ps_dct8(basis, block, coefficients);
            int sequence[64];
            for (int i = 0; i < 64; i++) {
                int z = diagonal[i];
                sequence[i] = clamp_signed(round(coefficients[z / 8][z % 8] / classic_table[z]));
            }
            int ok = append_int(&t, "", sequence[0]);
            int position = 1;
            while (ok && position < 64) {
                int zeros = 0;
                while (position < 64 && sequence[position] == 0) {
                    zeros++;
                    position++;
                }
                ok = append_int(&t, " ", zeros);
                if (ok && position < 64)
                    ok = append_int(&t, " ", sequence[position++]);
            }
            if (!ok || !append(&t, "\n", 1)) {
                free(t.data);
                return PS_ERR_NOMEM;
            }
        }
    *text = t.data;
    *size = t.size;
    return PS_OK;
}

typedef struct {
    const char *p, *end;
} reader;

static int read_int(reader *r, long *value)
{
    while (r->p < r->end && isspace((unsigned char)*r->p))
        r->p++;
    if (r->p >= r->end)
        return 0;
    int negative = 0;
    if (*r->p == '-' || *r->p == '+') {
        negative = *r->p == '-';
        r->p++;
    }
    if (r->p >= r->end || !isdigit((unsigned char)*r->p))
        return 0;
    long v = 0;
    while (r->p < r->end && isdigit((unsigned char)*r->p)) {
        if (v < 100000000)
            v = v * 10 + (*r->p - '0');
        r->p++;
    }
    *value = negative ? -v : v;
    return 1;
}

ps_status ps_classic_decode(const char *text, size_t size, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!text)
        return PS_ERR_ARG;
    reader r = {text, text + size};
    long width, height;
    if (!read_int(&r, &width) || !read_int(&r, &height) || width <= 0 || height <= 0 || width % 8 ||
        height % 8 || width > 65536 || height > 65536)
        return PS_ERR_FORMAT;
    ps_status status = ps_image_new((int)width, (int)height, 1, out);
    if (status != PS_OK)
        return status;
    double basis[8][8];
    int diagonal[64];
    ps_dct_basis(basis);
    diagonal_order(diagonal);
    for (long by = 0; by < height; by += 8)
        for (long bx = 0; bx < width; bx += 8) {
            int sequence[64] = {0};
            long value, zeros;
            if (!read_int(&r, &value))
                goto corrupt;
            sequence[0] = (int)value;
            int position = 1;
            while (position < 64) {
                if (!read_int(&r, &zeros) || zeros < 0 || zeros > 64 - position)
                    goto corrupt;
                position += (int)zeros;
                if (position < 64) {
                    if (!read_int(&r, &value))
                        goto corrupt;
                    sequence[position++] = (int)value;
                }
            }
            double coefficients[8][8], block[8][8];
            for (int i = 0; i < 64; i++) {
                int z = diagonal[i];
                coefficients[z / 8][z % 8] = (double)sequence[i] * classic_table[z];
            }
            ps_idct8(basis, coefficients, block);
            for (int y = 0; y < 8; y++)
                for (int x = 0; x < 8; x++)
                    out->data[(by + y) * width + bx + x] = (uint8_t)(clamp_signed(round(block[y][x])) + 128);
        }
    return PS_OK;
corrupt:
    ps_image_free(out);
    return PS_ERR_FORMAT;
}
