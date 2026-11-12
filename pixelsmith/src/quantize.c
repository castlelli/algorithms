/* Color reduction: a median-cut palette, mapped with or without dithering. */
#include "pixelsmith.h"

#include <stdlib.h>
#include <string.h>

static const char *const dither_names[] = {"none", "floyd-steinberg", "bayer"};

const char *ps_dither_name(ps_dither dither)
{
    return dither >= PS_DITHER_NONE && dither <= PS_DITHER_BAYER ? dither_names[dither] : "?";
}

int ps_dither_from_name(const char *name, ps_dither *dither)
{
    for (int i = 0; i < 3; i++)
        if (!strcmp(name, dither_names[i])) {
            *dither = (ps_dither)i;
            return 1;
        }
    if (!strcmp(name, "floyd") || !strcmp(name, "fs")) {
        *dither = PS_DITHER_FLOYD_STEINBERG;
        return 1;
    }
    if (!strcmp(name, "ordered")) {
        *dither = PS_DITHER_BAYER;
        return 1;
    }
    return 0;
}

/* Colors reduced to a 5-bit-per-channel histogram (32768 cells) to keep median cut fast. */
typedef struct {
    uint16_t cell;
    uint32_t count;
} entry;

typedef struct {
    int begin, end;           /* range of entries */
    int lo[3], hi[3];
    uint64_t weight;
} box;

/* Stable counting sort of entries[begin, end) by one 5-bit channel. */
static void sort_by_axis(entry *e, int begin, int end, int axis, entry *scratch)
{
    int shift = 10 - 5 * axis, start[33] = {0};
    for (int i = begin; i < end; i++)
        start[((e[i].cell >> shift) & 31) + 1]++;
    for (int v = 0; v < 32; v++)
        start[v + 1] += start[v];
    for (int i = begin; i < end; i++)
        scratch[start[(e[i].cell >> shift) & 31]++] = e[i];
    memcpy(e + begin, scratch, sizeof(entry) * (size_t)(end - begin));
}

static void shrink(box *b, const entry *e)
{
    for (int c = 0; c < 3; c++) {
        b->lo[c] = 31;
        b->hi[c] = 0;
    }
    b->weight = 0;
    for (int i = b->begin; i < b->end; i++) {
        for (int c = 0; c < 3; c++) {
            int v = (e[i].cell >> (10 - 5 * c)) & 31;
            if (v < b->lo[c])
                b->lo[c] = v;
            if (v > b->hi[c])
                b->hi[c] = v;
        }
        b->weight += e[i].count;
    }
}

ps_status ps_palette_median_cut(const ps_image *in, int colors, uint8_t palette[256][3], int *count)
{
    if (!in || !in->data || !palette || !count || colors < 2 || colors > 256)
        return PS_ERR_ARG;
    *count = 0;
    uint32_t *hist = calloc(32768, sizeof(uint32_t));
    uint64_t (*sums)[3] = calloc(32768, sizeof *sums);
    entry *entries = malloc(sizeof(entry) * 32768);
    entry *scratch = malloc(sizeof(entry) * 32768);
    box *boxes = malloc(sizeof(box) * 256);
    if (!hist || !sums || !entries || !scratch || !boxes) {
        free(scratch);
        free(hist);
        free(sums);
        free(entries);
        free(boxes);
        return PS_ERR_NOMEM;
    }
    size_t pixels = (size_t)in->width * in->height;
    int n = in->channels, alpha = ps_has_alpha(in);
    for (size_t i = 0; i < pixels; i++) {
        const uint8_t *p = in->data + i * n;
        if (alpha && p[n - 1] == 0)
            continue; /* invisible pixels do not vote */
        int r = p[0], g = n >= 3 ? p[1] : p[0], b = n >= 3 ? p[2] : p[0];
        int cell = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
        hist[cell]++;
        sums[cell][0] += r;
        sums[cell][1] += g;
        sums[cell][2] += b;
    }
    int used = 0;
    for (int c = 0; c < 32768; c++)
        if (hist[c])
            entries[used++] = (entry){(uint16_t)c, hist[c]};
    if (used == 0) { /* fully transparent: a single black entry */
        memset(palette[0], 0, 3);
        *count = 1;
        goto done;
    }
    int boxes_used = 1;
    boxes[0].begin = 0;
    boxes[0].end = used;
    shrink(&boxes[0], entries);
    while (boxes_used < colors) {
        /* Split the box with the longest side, weighted by population. */
        int best = -1;
        double best_score = 0;
        for (int i = 0; i < boxes_used; i++) {
            if (boxes[i].end - boxes[i].begin < 2)
                continue;
            int side = 0;
            for (int c = 0; c < 3; c++)
                if (boxes[i].hi[c] - boxes[i].lo[c] > side)
                    side = boxes[i].hi[c] - boxes[i].lo[c];
            double score = (double)side * (double)boxes[i].weight;
            if (score > best_score) {
                best_score = score;
                best = i;
            }
        }
        if (best < 0)
            break;
        box *b = &boxes[best];
        int axis = 0;
        for (int c = 1; c < 3; c++)
            if (b->hi[c] - b->lo[c] > b->hi[axis] - b->lo[axis])
                axis = c;
        sort_by_axis(entries, b->begin, b->end, axis, scratch);
        uint64_t half = b->weight / 2, acc = 0;
        int split = b->begin;
        while (split < b->end - 1 && (acc += entries[split].count) < half)
            split++;
        split++;
        if (split >= b->end)
            split = b->end - 1;
        box next = {split, b->end, {0}, {0}, 0};
        b->end = split;
        shrink(b, entries);
        shrink(&next, entries);
        boxes[boxes_used++] = next;
    }
    for (int i = 0; i < boxes_used; i++) {
        uint64_t total = 0, s[3] = {0};
        for (int k = boxes[i].begin; k < boxes[i].end; k++) {
            int cell = entries[k].cell;
            total += hist[cell];
            for (int c = 0; c < 3; c++)
                s[c] += sums[cell][c];
        }
        for (int c = 0; c < 3; c++)
            palette[i][c] = (uint8_t)((s[c] + total / 2) / total);
    }
    *count = boxes_used;
done:
    free(scratch);
    free(hist);
    free(sums);
    free(entries);
    free(boxes);
    return PS_OK;
}

static int nearest(const uint8_t palette[][3], int count, int r, int g, int b)
{
    int best = 0, best_d = 1 << 30;
    for (int i = 0; i < count; i++) {
        int dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
        /* Weighted distance, closer to how different colors look. */
        int d = 3 * dr * dr + 4 * dg * dg + 2 * db * db;
        if (d < best_d) {
            best_d = d;
            best = i;
        }
    }
    return best;
}

static const int bayer8[64] = {
    0,  32, 8,  40, 2,  34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4,  36, 14, 46,
    6,  38, 60, 28, 52, 20, 62, 30, 54, 22, 3,  35, 11, 43, 1,  33, 9,  41, 51, 19, 59, 27,
    49, 17, 57, 25, 15, 47, 7,  39, 13, 45, 5,  37, 63, 31, 55, 23, 61, 29, 53, 21};

ps_status ps_remap(const ps_image *in, const uint8_t palette[][3], int count, ps_dither dither, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!in || !in->data || !palette || count < 1 || count > 256)
        return PS_ERR_ARG;
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK)
        return status;
    int w = in->width, h = in->height, n = in->channels, color = n >= 3;
    /* Cache of nearest entries over the 5-bit color cube, filled lazily. */
    int16_t *cache = malloc(sizeof(int16_t) * 32768);
    float *errors = dither == PS_DITHER_FLOYD_STEINBERG ? calloc((size_t)(w + 2) * 2 * 3, sizeof(float)) : NULL;
    if (!cache || (dither == PS_DITHER_FLOYD_STEINBERG && !errors)) {
        free(cache);
        free(errors);
        ps_image_free(out);
        return PS_ERR_NOMEM;
    }
    for (int i = 0; i < 32768; i++)
        cache[i] = -1;
    /* Bayer spread scaled to the typical gap between palette colors. */
    double spread = 255.0 / (count > 1 ? (count < 16 ? count - 1 : 4 + count / 8) : 1);
    if (spread > 96)
        spread = 96;
    for (int y = 0; y < h; y++) {
        float *current = errors ? errors + (size_t)(y % 2) * (w + 2) * 3 : NULL;
        float *next = errors ? errors + (size_t)((y + 1) % 2) * (w + 2) * 3 : NULL;
        if (next)
            memset(next, 0, sizeof(float) * (w + 2) * 3);
        for (int x = 0; x < w; x++) {
            uint8_t *p = out->data + ((size_t)y * w + x) * n;
            double v[3];
            for (int c = 0; c < 3; c++)
                v[c] = color ? p[c] : p[0];
            if (dither == PS_DITHER_FLOYD_STEINBERG)
                for (int c = 0; c < 3; c++)
                    v[c] += current[(x + 1) * 3 + c];
            else if (dither == PS_DITHER_BAYER)
                for (int c = 0; c < 3; c++)
                    v[c] += (bayer8[(y & 7) * 8 + (x & 7)] / 64.0 - 0.5) * spread;
            int r = ps_clamp_u8(v[0]), g = ps_clamp_u8(v[1]), b = ps_clamp_u8(v[2]);
            int index;
            if (count > 64) { /* many colors: look up once per 5-bit cell */
                int cell = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3);
                if (cache[cell] < 0)
                    cache[cell] = (int16_t)nearest(palette, count, (r & ~7) | 4, (g & ~7) | 4, (b & ~7) | 4);
                index = cache[cell];
            } else {
                index = nearest(palette, count, r, g, b);
            }
            if (errors) {
                double e[3] = {v[0] - palette[index][0], v[1] - palette[index][1], v[2] - palette[index][2]};
                for (int c = 0; c < 3; c++) {
                    current[(x + 2) * 3 + c] += (float)(e[c] * 7 / 16);
                    next[x * 3 + c] += (float)(e[c] * 3 / 16);
                    next[(x + 1) * 3 + c] += (float)(e[c] * 5 / 16);
                    next[(x + 2) * 3 + c] += (float)(e[c] * 1 / 16);
                }
            }
            if (color) {
                p[0] = palette[index][0];
                p[1] = palette[index][1];
                p[2] = palette[index][2];
            } else {
                p[0] = ps_clamp_u8(0.299 * palette[index][0] + 0.587 * palette[index][1] + 0.114 * palette[index][2]);
            }
        }
    }
    free(cache);
    free(errors);
    return PS_OK;
}

ps_status ps_quantize(const ps_image *in, int colors, ps_dither dither, ps_image *out)
{
    if (out)
        memset(out, 0, sizeof *out);
    uint8_t palette[256][3];
    int count;
    ps_status status = ps_palette_median_cut(in, colors, palette, &count);
    if (status != PS_OK)
        return status;
    return ps_remap(in, (const uint8_t(*)[3])palette, count, dither, out);
}

ps_status ps_posterize(ps_image *image, int levels)
{
    if (!image || !image->data || levels < 2 || levels > 256)
        return PS_ERR_ARG;
    uint8_t table[256];
    for (int v = 0; v < 256; v++) {
        int step = (v * levels) / 256;
        table[v] = (uint8_t)(step * 255 / (levels - 1));
    }
    size_t count = (size_t)image->width * image->height;
    int colors = ps_color_channels(image);
    for (size_t i = 0; i < count; i++)
        for (int c = 0; c < colors; c++)
            image->data[i * image->channels + c] = table[image->data[i * image->channels + c]];
    return PS_OK;
}
