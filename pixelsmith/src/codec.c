/* PXS: Pixelsmith's lossy codec.
 *
 * The image goes to YCbCr (chroma optionally halved in both directions, 4:2:0), every channel is cut
 * into 8x8 blocks, each block is transformed with the DCT, divided by a quantization table scaled by
 * the quality, read in zigzag order and entropy coded with Huffman tables built for this image.
 *
 * File layout (integers little-endian):
 *
 *   "PXS1"            magic
 *   u8  version       1
 *   u8  flags         bit 0: chroma subsampled 4:2:0
 *   u8  components    1 (gray) or 3 (YCbCr)
 *   u8  quality       1..100
 *   u32 width, u32 height
 *   quantization tables, luma then chroma (if 3 components): 64 u8 each, zigzag order
 *   Huffman tables, luma DC, luma AC, then chroma DC, chroma AC: 16 u8 counts of codes of length
 *       1..16, followed by the symbols in code order (canonical codes, as in JPEG)
 *   u32 payload size, then the payload: Y blocks, then Cb blocks, then Cr blocks, raster order,
 *       bits packed most significant first and padded with ones
 *
 * Each block is coded as in baseline JPEG: the DC difference from the previous block of the same
 * channel as a size category (Huffman) plus that many raw bits, then for the AC terms one Huffman
 * symbol per nonzero value, (zero run << 4 | size), with 0xF0 for 16 zeros and 0x00 for end of block.
 */
#include "pixelsmith.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

/* Luma table of the original compressor (quality 50), and the JPEG Annex K chroma table. */
static const int base_luma[64] = {
    16, 10, 10, 16, 25,  41,  50,  61,  12, 13, 14, 19, 26,  58,  60,  54,
    14, 12, 16, 24, 41,  56,  68,  57,  14, 16, 22, 29, 51,  87,  81,  63,
    18, 23, 37, 56, 69,  108, 102, 76,  24, 34, 55, 64, 80,  105, 113, 92,
    49, 65, 78, 87, 103, 120, 120, 100, 72, 93, 95, 98, 113, 100, 103, 98};
static const int base_chroma[64] = {
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99,
    99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99};

#define MAX_COEFFICIENT 2047 /* size category 11 */

ps_pxs_options ps_pxs_defaults(void)
{
    ps_pxs_options options = {75, PS_SUBSAMPLE_420, 0};
    return options;
}

static int clamp_quality(int quality)
{
    return quality < 1 ? 1 : quality > 100 ? 100 : quality;
}

/* The Independent JPEG Group's scaling: quality 50 is the base table. */
void ps_quant_table(int quality, int chroma, int table[64])
{
    quality = clamp_quality(quality);
    int scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
    const int *base = chroma ? base_chroma : base_luma;
    for (int i = 0; i < 64; i++) {
        int q = (base[i] * scale + 50) / 100;
        table[i] = q < 1 ? 1 : q > 255 ? 255 : q;
    }
}

static int size_category(int value)
{
    int magnitude = value < 0 ? -value : value, size = 0;
    while (magnitude) {
        size++;
        magnitude >>= 1;
    }
    return size;
}

static int quantize(double coefficient, int q)
{
    double v = round(coefficient / q);
    if (v > MAX_COEFFICIENT)
        return MAX_COEFFICIENT;
    if (v < -MAX_COEFFICIENT)
        return -MAX_COEFFICIENT;
    return (int)v;
}

/* ------------------------------------------------------------------------- planes */

typedef struct {
    int width, height;        /* samples that belong to the image */
    int blocks_x, blocks_y;   /* 8x8 blocks covering it */
    float *samples;           /* width * height */
    int16_t *coefficients;    /* blocks * 64, zigzag order */
} plane;

static void plane_free(plane *p)
{
    free(p->samples);
    free(p->coefficients);
    memset(p, 0, sizeof *p);
}

static int plane_alloc(plane *p, int width, int height)
{
    p->width = width;
    p->height = height;
    p->blocks_x = (width + 7) / 8;
    p->blocks_y = (height + 7) / 8;
    p->samples = malloc(sizeof(float) * (size_t)width * height);
    p->coefficients = malloc(sizeof(int16_t) * 64 * (size_t)p->blocks_x * p->blocks_y);
    return p->samples && p->coefficients;
}

static void forward_plane(plane *p, const int table[64], double basis[8][8])
{
    for (int by = 0; by < p->blocks_y; by++)
        for (int bx = 0; bx < p->blocks_x; bx++) {
            double block[8][8], coefficients[8][8];
            for (int r = 0; r < 8; r++) {
                int y = by * 8 + r;
                if (y >= p->height)
                    y = p->height - 1; /* edges are replicated into the padding */
                for (int c = 0; c < 8; c++) {
                    int x = bx * 8 + c;
                    if (x >= p->width)
                        x = p->width - 1;
                    block[r][c] = p->samples[(size_t)y * p->width + x] - 128.0;
                }
            }
            ps_dct8(basis, block, coefficients);
            int16_t *out = p->coefficients + ((size_t)by * p->blocks_x + bx) * 64;
            for (int i = 0; i < 64; i++) {
                int z = ps_zigzag[i];
                out[i] = (int16_t)quantize(coefficients[z / 8][z % 8], table[z]);
            }
        }
}

static void inverse_plane(plane *p, const int table[64], double basis[8][8])
{
    for (int by = 0; by < p->blocks_y; by++)
        for (int bx = 0; bx < p->blocks_x; bx++) {
            double coefficients[8][8], block[8][8];
            const int16_t *in = p->coefficients + ((size_t)by * p->blocks_x + bx) * 64;
            for (int i = 0; i < 64; i++) {
                int z = ps_zigzag[i];
                coefficients[z / 8][z % 8] = (double)in[i] * table[z];
            }
            ps_idct8(basis, coefficients, block);
            for (int r = 0; r < 8; r++) {
                int y = by * 8 + r;
                if (y >= p->height)
                    break;
                for (int c = 0; c < 8; c++) {
                    int x = bx * 8 + c;
                    if (x >= p->width)
                        break;
                    double v = block[r][c] + 128.0;
                    p->samples[(size_t)y * p->width + x] = (float)(v < 0 ? 0 : v > 255 ? 255 : v);
                }
            }
        }
}

/* ------------------------------------------------------------------------- Huffman */

typedef struct {
    uint8_t counts[17];     /* counts[l] = number of codes of length l */
    uint8_t symbols[256];   /* in code order */
    int symbol_count;
    uint16_t code[256];     /* encoder: code and length per symbol */
    uint8_t length[256];
    /* decoder */
    int32_t max_code[18];
    int32_t offset[17];
    uint16_t fast[1 << 9];  /* (length << 8) | symbol for codes up to 9 bits, 0 if longer */
} huffman;

/* Builds length-limited (16 bit) code lengths from frequencies, as in JPEG Annex K.2. */
static void huffman_build(huffman *h, const uint32_t frequencies[256])
{
    uint64_t freq[257];
    int code_size[257], others[257];
    int used = 0;
    for (int i = 0; i < 256; i++) {
        freq[i] = frequencies[i];
        used += frequencies[i] != 0;
    }
    if (used == 0) {
        freq[0] = 1; /* an empty table still needs a valid code */
    }
    freq[256] = 1; /* reserved, so no real code is all ones */
    for (int i = 0; i < 257; i++) {
        code_size[i] = 0;
        others[i] = -1;
    }
    for (;;) {
        int c1 = -1, c2 = -1;
        for (int i = 0; i < 257; i++)
            if (freq[i] && (c1 < 0 || freq[i] <= freq[c1]))
                c1 = i;
        for (int i = 0; i < 257; i++)
            if (freq[i] && i != c1 && (c2 < 0 || freq[i] <= freq[c2]))
                c2 = i;
        if (c2 < 0)
            break;
        freq[c1] += freq[c2];
        freq[c2] = 0;
        code_size[c1]++;
        while (others[c1] >= 0) {
            c1 = others[c1];
            code_size[c1]++;
        }
        others[c1] = c2;
        code_size[c2]++;
        while (others[c2] >= 0) {
            c2 = others[c2];
            code_size[c2]++;
        }
    }
    int bits[33] = {0};
    for (int i = 0; i < 257; i++)
        if (code_size[i])
            bits[code_size[i] > 32 ? 32 : code_size[i]]++;
    for (int i = 32; i > 16; i--)
        while (bits[i] > 0) {
            int j = i - 2;
            while (bits[j] == 0)
                j--;
            bits[i] -= 2;
            bits[i - 1]++;
            bits[j + 1] += 2;
            bits[j]--;
        }
    int last = 16;
    while (bits[last] == 0)
        last--;
    bits[last]--; /* drop the reserved symbol */

    memset(h, 0, sizeof *h);
    for (int l = 1; l <= 16; l++)
        h->counts[l] = (uint8_t)bits[l];
    /* Symbols sorted by code size, then by value. */
    int n = 0;
    for (int size = 1; size <= 32; size++)
        for (int i = 0; i < 256; i++)
            if (code_size[i] == size)
                h->symbols[n++] = (uint8_t)i;
    h->symbol_count = n < 256 ? n : 256;
}

/* Assigns canonical codes from counts and symbols, and fills the decoding tables.
   Returns 0 if the table is invalid. */
static int huffman_prepare(huffman *h)
{
    int code = 0, k = 0;
    memset(h->length, 0, sizeof h->length);
    memset(h->fast, 0, sizeof h->fast);
    for (int l = 1; l <= 16; l++) {
        h->offset[l] = k - code;
        for (int i = 0; i < h->counts[l]; i++) {
            if (k >= h->symbol_count || code >= (1 << l))
                return 0; /* more codes than this length can hold: corrupt table */
            int s = h->symbols[k++];
            h->code[s] = (uint16_t)code;
            h->length[s] = (uint8_t)l;
            if (l <= 9) {
                int shift = 9 - l;
                for (int f = 0; f < (1 << shift); f++)
                    h->fast[(code << shift) | f] = (uint16_t)((l << 8) | s);
            }
            code++;
        }
        h->max_code[l] = h->counts[l] ? code - 1 : -1;
        code <<= 1;
    }
    h->max_code[17] = 0x7fffffff;
    return k == h->symbol_count;
}

/* ------------------------------------------------------------------------- bits */

typedef struct {
    uint8_t *data;
    size_t size, capacity;
    uint32_t accumulator;
    int count;
    int failed;
} bit_writer;

static void put_byte(bit_writer *w, uint8_t byte)
{
    if (w->size == w->capacity) {
        size_t capacity = w->capacity ? w->capacity * 2 : 65536;
        uint8_t *grown = realloc(w->data, capacity);
        if (!grown) {
            w->failed = 1;
            return;
        }
        w->data = grown;
        w->capacity = capacity;
    }
    w->data[w->size++] = byte;
}

static void put_bits(bit_writer *w, uint32_t bits, int count)
{
    if (count == 0 || w->failed)
        return;
    w->accumulator = (w->accumulator << count) | (bits & ((1u << count) - 1));
    w->count += count;
    while (w->count >= 8) {
        w->count -= 8;
        put_byte(w, (uint8_t)(w->accumulator >> w->count));
    }
}

static void flush_bits(bit_writer *w)
{
    if (w->count > 0)
        put_bits(w, 0x7f, 8 - w->count);
}

typedef struct {
    const uint8_t *data;
    size_t size, position;
    uint64_t accumulator;
    int count;
} bit_reader;

static void refill(bit_reader *r)
{
    while (r->count <= 56) {
        uint8_t byte = r->position < r->size ? r->data[r->position] : 0xFF;
        r->position++;
        r->accumulator |= (uint64_t)byte << (56 - r->count);
        r->count += 8;
    }
}

static uint32_t get_bits(bit_reader *r, int count)
{
    if (count == 0)
        return 0;
    if (r->count < count)
        refill(r);
    uint32_t value = (uint32_t)(r->accumulator >> (64 - count));
    r->accumulator <<= count;
    r->count -= count;
    return value;
}

/* Returns the symbol, or -1 for an invalid code. */
static int decode_symbol(bit_reader *r, const huffman *h)
{
    if (r->count < 16)
        refill(r);
    uint16_t entry = h->fast[r->accumulator >> (64 - 9)];
    if (entry) {
        int length = entry >> 8;
        r->accumulator <<= length;
        r->count -= length;
        return entry & 0xFF;
    }
    int code = 0;
    for (int l = 1; l <= 16; l++) {
        code = (code << 1) | (int)get_bits(r, 1);
        if (code <= h->max_code[l])
            return h->symbols[h->offset[l] + code];
    }
    return -1;
}

static int extend(uint32_t bits, int size)
{
    if (size == 0)
        return 0;
    return bits < (1u << (size - 1)) ? (int)bits - (1 << size) + 1 : (int)bits;
}

static uint32_t value_bits(int value, int size)
{
    return (uint32_t)(value < 0 ? value + (1 << size) - 1 : value);
}

/* ------------------------------------------------------------------------- symbols */

static void count_plane(const plane *p, uint32_t dc[256], uint32_t ac[256])
{
    size_t blocks = (size_t)p->blocks_x * p->blocks_y;
    int previous = 0;
    for (size_t b = 0; b < blocks; b++) {
        const int16_t *z = p->coefficients + b * 64;
        dc[size_category(z[0] - previous)]++;
        previous = z[0];
        int run = 0;
        for (int i = 1; i < 64; i++) {
            if (z[i] == 0) {
                run++;
                continue;
            }
            while (run > 15) {
                ac[0xF0]++;
                run -= 16;
            }
            ac[(run << 4) | size_category(z[i])]++;
            run = 0;
        }
        if (run > 0)
            ac[0x00]++;
    }
}

static void write_plane(bit_writer *w, const plane *p, const huffman *dc, const huffman *ac)
{
    size_t blocks = (size_t)p->blocks_x * p->blocks_y;
    int previous = 0;
    for (size_t b = 0; b < blocks && !w->failed; b++) {
        const int16_t *z = p->coefficients + b * 64;
        int diff = z[0] - previous, size = size_category(diff);
        previous = z[0];
        put_bits(w, dc->code[size], dc->length[size]);
        put_bits(w, value_bits(diff, size), size);
        int run = 0;
        for (int i = 1; i < 64; i++) {
            if (z[i] == 0) {
                run++;
                continue;
            }
            while (run > 15) {
                put_bits(w, ac->code[0xF0], ac->length[0xF0]);
                run -= 16;
            }
            int s = size_category(z[i]), symbol = (run << 4) | s;
            put_bits(w, ac->code[symbol], ac->length[symbol]);
            put_bits(w, value_bits(z[i], s), s);
            run = 0;
        }
        if (run > 0)
            put_bits(w, ac->code[0x00], ac->length[0x00]);
    }
}

static int read_plane(bit_reader *r, plane *p, const huffman *dc, const huffman *ac)
{
    size_t blocks = (size_t)p->blocks_x * p->blocks_y;
    int previous = 0;
    for (size_t b = 0; b < blocks; b++) {
        int16_t *z = p->coefficients + b * 64;
        memset(z, 0, 64 * sizeof *z);
        int size = decode_symbol(r, dc);
        if (size < 0 || size > 12)
            return 0;
        int value = previous + extend(get_bits(r, size), size);
        if (value > 32767 || value < -32768)
            return 0;
        z[0] = (int16_t)value;
        previous = value;
        for (int i = 1; i < 64;) {
            int symbol = decode_symbol(r, ac);
            if (symbol < 0)
                return 0;
            int run = symbol >> 4, s = symbol & 15;
            if (s == 0) {
                if (run == 15) {
                    i += 16;
                    continue;
                }
                break; /* end of block */
            }
            i += run;
            if (i > 63)
                return 0;
            z[i++] = (int16_t)extend(get_bits(r, s), s);
        }
        if (r->position > r->size + 8)
            return 0; /* ran far past the end: corrupt */
    }
    return 1;
}

/* ------------------------------------------------------------------------- encoder */

static void put_u32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)v;
    p[1] = (uint8_t)(v >> 8);
    p[2] = (uint8_t)(v >> 16);
    p[3] = (uint8_t)(v >> 24);
}

static uint32_t get_u32(const uint8_t *p)
{
    return p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}

static float rgb_to(const uint8_t *p, int which)
{
    double r = p[0], g = p[1], b = p[2];
    if (which == 0)
        return (float)(0.299 * r + 0.587 * g + 0.114 * b);
    if (which == 1)
        return (float)(-0.168735892 * r - 0.331264108 * g + 0.5 * b + 128);
    return (float)(0.5 * r - 0.418687589 * g - 0.081312411 * b + 128);
}

ps_status ps_pxs_encode(const ps_image *image, const ps_pxs_options *options, uint8_t **data, size_t *size)
{
    if (!image || !image->data || !data || !size)
        return PS_ERR_ARG;
    *data = NULL;
    *size = 0;
    ps_pxs_options o = options ? *options : ps_pxs_defaults();
    o.quality = clamp_quality(o.quality);
    int components = (o.grayscale || image->channels < 3) ? 1 : 3;
    int subsample = components == 3 && o.subsampling == PS_SUBSAMPLE_420;
    int w = image->width, h = image->height;

    ps_image flat = {0};
    ps_status status = ps_image_convert(image, components, &flat); /* gray or RGB over white */
    if (status != PS_OK)
        return status;

    plane planes[3] = {{0}};
    int cw = subsample ? (w + 1) / 2 : w, ch = subsample ? (h + 1) / 2 : h;
    int ok = plane_alloc(&planes[0], w, h);
    for (int c = 1; c < components; c++)
        ok = ok && plane_alloc(&planes[c], cw, ch);
    if (!ok) {
        status = PS_ERR_NOMEM;
        goto done;
    }
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            const uint8_t *p = flat.data + ((size_t)y * w + x) * components;
            planes[0].samples[(size_t)y * w + x] = components == 1 ? p[0] : rgb_to(p, 0);
        }
    for (int c = 1; c < components; c++)
        for (int y = 0; y < ch; y++)
            for (int x = 0; x < cw; x++) {
                if (!subsample) {
                    planes[c].samples[(size_t)y * cw + x] = rgb_to(flat.data + ((size_t)y * w + x) * 3, c);
                    continue;
                }
                float sum = 0; /* average of the 2x2 pixels, edges replicated */
                for (int dy = 0; dy < 2; dy++)
                    for (int dx = 0; dx < 2; dx++) {
                        int sx = 2 * x + dx < w ? 2 * x + dx : w - 1;
                        int sy = 2 * y + dy < h ? 2 * y + dy : h - 1;
                        sum += rgb_to(flat.data + ((size_t)sy * w + sx) * 3, c);
                    }
                planes[c].samples[(size_t)y * cw + x] = sum / 4;
            }

    double basis[8][8];
    ps_dct_basis(basis);
    int tables[2][64];
    ps_quant_table(o.quality, 0, tables[0]);
    ps_quant_table(o.quality, 1, tables[1]);
    for (int c = 0; c < components; c++)
        forward_plane(&planes[c], tables[c > 0], basis);

    int classes = components == 3 ? 2 : 1;
    huffman *codes = calloc(4, sizeof(huffman)); /* luma DC, luma AC, chroma DC, chroma AC */
    if (!codes) {
        status = PS_ERR_NOMEM;
        goto done;
    }
    for (int k = 0; k < classes; k++) {
        uint32_t dc[256] = {0}, ac[256] = {0};
        for (int c = 0; c < components; c++)
            if ((c > 0) == k)
                count_plane(&planes[c], dc, ac);
        huffman_build(&codes[2 * k], dc);
        huffman_build(&codes[2 * k + 1], ac);
        huffman_prepare(&codes[2 * k]);
        huffman_prepare(&codes[2 * k + 1]);
    }

    bit_writer w_bits = {0};
    for (int c = 0; c < components; c++)
        write_plane(&w_bits, &planes[c], &codes[2 * (c > 0)], &codes[2 * (c > 0) + 1]);
    flush_bits(&w_bits);
    if (w_bits.failed) {
        free(w_bits.data);
        free(codes);
        status = PS_ERR_NOMEM;
        goto done;
    }

    size_t header = 16 + 64 * (size_t)classes + 4;
    for (int t = 0; t < 2 * classes; t++)
        header += 16 + (size_t)codes[t].symbol_count;
    uint8_t *out = malloc(header + w_bits.size);
    if (!out) {
        free(w_bits.data);
        free(codes);
        status = PS_ERR_NOMEM;
        goto done;
    }
    uint8_t *p = out;
    memcpy(p, "PXS1", 4);
    p[4] = 1;
    p[5] = (uint8_t)subsample;
    p[6] = (uint8_t)components;
    p[7] = (uint8_t)o.quality;
    put_u32(p + 8, (uint32_t)w);
    put_u32(p + 12, (uint32_t)h);
    p += 16;
    for (int k = 0; k < classes; k++)
        for (int i = 0; i < 64; i++)
            *p++ = (uint8_t)tables[k][ps_zigzag[i]];
    for (int t = 0; t < 2 * classes; t++) {
        memcpy(p, codes[t].counts + 1, 16);
        p += 16;
        memcpy(p, codes[t].symbols, (size_t)codes[t].symbol_count);
        p += codes[t].symbol_count;
    }
    put_u32(p, (uint32_t)w_bits.size);
    p += 4;
    if (w_bits.size)
        memcpy(p, w_bits.data, w_bits.size);
    free(w_bits.data);
    free(codes);
    *data = out;
    *size = header + w_bits.size;

done:
    for (int c = 0; c < 3; c++)
        plane_free(&planes[c]);
    ps_image_free(&flat);
    return status;
}

/* ------------------------------------------------------------------------- decoder */

typedef struct {
    int width, height, components, quality, subsample, classes;
    int tables[2][64]; /* row-major */
    huffman *codes;    /* 4 tables */
    const uint8_t *payload;
    size_t payload_size, header_size;
} pxs_header;

static ps_status parse_header(const uint8_t *data, size_t size, pxs_header *hd, huffman *codes)
{
    memset(hd, 0, sizeof *hd);
    hd->codes = codes;
    if (!data || size < 16 || memcmp(data, "PXS1", 4) || data[4] != 1)
        return PS_ERR_FORMAT;
    hd->subsample = data[5] & 1;
    hd->components = data[6];
    hd->quality = data[7];
    hd->width = (int)get_u32(data + 8);
    hd->height = (int)get_u32(data + 12);
    if ((hd->components != 1 && hd->components != 3) || hd->width <= 0 || hd->height <= 0 ||
        hd->width > 65536 || hd->height > 65536 || (double)hd->width * hd->height > (1 << 28))
        return PS_ERR_FORMAT;
    hd->classes = hd->components == 3 ? 2 : 1;
    size_t p = 16;
    for (int k = 0; k < hd->classes; k++) {
        if (p + 64 > size)
            return PS_ERR_FORMAT;
        for (int i = 0; i < 64; i++) {
            if (data[p + i] == 0)
                return PS_ERR_FORMAT;
            hd->tables[k][ps_zigzag[i]] = data[p + i];
        }
        p += 64;
    }
    for (int t = 0; t < 2 * hd->classes; t++) {
        huffman *h = &codes[t];
        memset(h, 0, sizeof *h);
        if (p + 16 > size)
            return PS_ERR_FORMAT;
        int total = 0;
        for (int l = 1; l <= 16; l++)
            total += h->counts[l] = data[p + l - 1];
        p += 16;
        if (total > 256 || total == 0 || p + (size_t)total > size)
            return PS_ERR_FORMAT;
        memcpy(h->symbols, data + p, (size_t)total);
        h->symbol_count = total;
        p += (size_t)total;
        if (!huffman_prepare(h))
            return PS_ERR_FORMAT;
    }
    if (p + 4 > size)
        return PS_ERR_FORMAT;
    hd->payload_size = get_u32(data + p);
    p += 4;
    if (hd->payload_size > size - p)
        return PS_ERR_FORMAT;
    hd->payload = data + p;
    hd->header_size = p;
    return PS_OK;
}

ps_status ps_pxs_inspect(const uint8_t *data, size_t size, ps_pxs_info *info)
{
    if (!info)
        return PS_ERR_ARG;
    memset(info, 0, sizeof *info);
    huffman *codes = calloc(4, sizeof(huffman));
    if (!codes)
        return PS_ERR_NOMEM;
    pxs_header hd;
    ps_status status = parse_header(data, size, &hd, codes);
    if (status == PS_OK) {
        info->width = hd.width;
        info->height = hd.height;
        info->channels = hd.components;
        info->quality = hd.quality;
        info->subsampling = hd.subsample;
        info->header_bytes = hd.header_size;
        info->payload_bytes = hd.payload_size;
        for (int t = 0; t < 2 * hd.classes; t++)
            memcpy(info->code_lengths[t], codes[t].length, 256);
    }
    free(codes);
    return status;
}

static float sample_bilinear(const plane *p, double x, double y)
{
    if (x < 0)
        x = 0;
    if (y < 0)
        y = 0;
    int x0 = (int)x, y0 = (int)y;
    if (x0 > p->width - 1)
        x0 = p->width - 1;
    if (y0 > p->height - 1)
        y0 = p->height - 1;
    int x1 = x0 + 1 < p->width ? x0 + 1 : x0, y1 = y0 + 1 < p->height ? y0 + 1 : y0;
    double fx = x - x0, fy = y - y0;
    if (fx > 1)
        fx = 1;
    if (fy > 1)
        fy = 1;
    const float *s = p->samples;
    double top = s[(size_t)y0 * p->width + x0] * (1 - fx) + s[(size_t)y0 * p->width + x1] * fx;
    double bottom = s[(size_t)y1 * p->width + x0] * (1 - fx) + s[(size_t)y1 * p->width + x1] * fx;
    return (float)(top * (1 - fy) + bottom * fy);
}

ps_status ps_pxs_decode(const uint8_t *data, size_t size, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    huffman *codes = calloc(4, sizeof(huffman));
    if (!codes)
        return PS_ERR_NOMEM;
    pxs_header hd;
    plane planes[3] = {{0}};
    ps_status status = parse_header(data, size, &hd, codes);
    if (status != PS_OK)
        goto done;
    int w = hd.width, h = hd.height;
    int cw = hd.subsample ? (w + 1) / 2 : w, ch = hd.subsample ? (h + 1) / 2 : h;
    int ok = plane_alloc(&planes[0], w, h);
    for (int c = 1; c < hd.components; c++)
        ok = ok && plane_alloc(&planes[c], cw, ch);
    if (!ok) {
        status = PS_ERR_NOMEM;
        goto done;
    }
    bit_reader r = {hd.payload, hd.payload_size, 0, 0, 0};
    double basis[8][8];
    ps_dct_basis(basis);
    for (int c = 0; c < hd.components; c++) {
        if (!read_plane(&r, &planes[c], &codes[2 * (c > 0)], &codes[2 * (c > 0) + 1])) {
            status = PS_ERR_FORMAT;
            goto done;
        }
        inverse_plane(&planes[c], hd.tables[c > 0], basis);
    }
    status = ps_image_new(w, h, hd.components, out);
    if (status != PS_OK)
        goto done;
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            size_t i = (size_t)y * w + x;
            double luma = planes[0].samples[i];
            if (hd.components == 1) {
                out->data[i] = ps_clamp_u8(luma);
                continue;
            }
            double cb, cr;
            if (hd.subsample) { /* chroma sample k sits between luma pixels 2k and 2k + 1 */
                cb = sample_bilinear(&planes[1], (x - 0.5) / 2, (y - 0.5) / 2);
                cr = sample_bilinear(&planes[2], (x - 0.5) / 2, (y - 0.5) / 2);
            } else {
                cb = planes[1].samples[i];
                cr = planes[2].samples[i];
            }
            cb -= 128;
            cr -= 128;
            uint8_t *q = out->data + i * 3;
            q[0] = ps_clamp_u8(luma + 1.402 * cr);
            q[1] = ps_clamp_u8(luma - 0.344136286 * cb - 0.714136286 * cr);
            q[2] = ps_clamp_u8(luma + 1.772 * cb);
        }
done:
    for (int c = 0; c < 3; c++)
        plane_free(&planes[c]);
    free(codes);
    return status;
}

/* ------------------------------------------------------------------------- teaching helpers */

void ps_block_analyze(const uint8_t pixels[64], int quality, int chroma, ps_block_trace *t)
{
    memset(t, 0, sizeof *t);
    double basis[8][8], block[8][8], coefficients[8][8], dequantized[8][8], back[8][8];
    ps_dct_basis(basis);
    ps_quant_table(quality, chroma, t->quant);
    for (int i = 0; i < 64; i++)
        block[i / 8][i % 8] = t->pixels[i] = pixels[i] - 128.0;
    ps_dct8(basis, block, coefficients);
    for (int i = 0; i < 64; i++) {
        t->coefficients[i] = coefficients[i / 8][i % 8];
        t->quantized[i] = quantize(t->coefficients[i], t->quant[i]);
        dequantized[i / 8][i % 8] = (double)t->quantized[i] * t->quant[i];
    }
    for (int i = 0; i < 64; i++)
        t->zigzag[i] = t->quantized[ps_zigzag[i]];
    ps_idct8(basis, dequantized, back);
    for (int i = 0; i < 64; i++) {
        double v = back[i / 8][i % 8] + 128;
        t->reconstructed[i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    int run = 0;
    for (int i = 1; i < 64; i++) {
        if (t->zigzag[i] == 0) {
            run++;
            continue;
        }
        while (run > 15) {
            t->symbols[t->symbol_count][0] = 15;
            t->symbols[t->symbol_count][1] = 0;
            t->symbols[t->symbol_count++][2] = 0;
            run -= 16;
        }
        t->symbols[t->symbol_count][0] = run;
        t->symbols[t->symbol_count][1] = size_category(t->zigzag[i]);
        t->symbols[t->symbol_count++][2] = t->zigzag[i];
        run = 0;
    }
    if (run > 0)
        t->symbol_count++; /* end of block: an all-zero entry */
}

ps_status ps_dct_mask(const ps_image *in, const uint8_t mask[64], ps_image *out)
{
    if (!in || !in->data || !mask)
        return PS_ERR_ARG;
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK)
        return status;
    double basis[8][8];
    ps_dct_basis(basis);
    int w = in->width, h = in->height, n = in->channels, colors = ps_color_channels(in);
    for (int c = 0; c < colors; c++)
        for (int by = 0; by < h; by += 8)
            for (int bx = 0; bx < w; bx += 8) {
                double block[8][8], coefficients[8][8];
                for (int r = 0; r < 8; r++)
                    for (int k = 0; k < 8; k++) {
                        int y = by + r < h ? by + r : h - 1, x = bx + k < w ? bx + k : w - 1;
                        block[r][k] = in->data[((size_t)y * w + x) * n + c] - 128.0;
                    }
                ps_dct8(basis, block, coefficients);
                for (int i = 0; i < 64; i++)
                    if (!mask[i])
                        coefficients[i / 8][i % 8] = 0;
                ps_idct8(basis, coefficients, block);
                for (int r = 0; r < 8 && by + r < h; r++)
                    for (int k = 0; k < 8 && bx + k < w; k++)
                        out->data[((size_t)(by + r) * w + bx + k) * n + c] = ps_clamp_u8(block[r][k] + 128);
            }
    return PS_OK;
}
