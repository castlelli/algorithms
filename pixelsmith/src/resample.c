/* Separable resampling. Each output sample is a weighted sum of input samples, with the weights given
   by a filter kernel. When shrinking, the kernel is stretched by the scale factor so every input
   pixel contributes (no aliasing). Color is converted to linear light first and alpha is
   premultiplied, so edges against transparency stay clean. */
#include "pixelsmith.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

#define PS_PI 3.14159265358979323846

static const char *const filter_names[] = {"nearest", "bilinear", "bicubic", "lanczos"};

const char *ps_filter_name(ps_filter filter)
{
    return filter >= PS_FILTER_NEAREST && filter <= PS_FILTER_LANCZOS3 ? filter_names[filter] : "?";
}

int ps_filter_from_name(const char *name, ps_filter *filter)
{
    for (int i = 0; i < 4; i++)
        if (!strcmp(name, filter_names[i])) {
            *filter = (ps_filter)i;
            return 1;
        }
    if (!strcmp(name, "lanczos3")) {
        *filter = PS_FILTER_LANCZOS3;
        return 1;
    }
    return 0;
}

static double sinc(double x)
{
    if (fabs(x) < 1e-8)
        return 1;
    x *= PS_PI;
    return sin(x) / x;
}

static double kernel(ps_filter filter, double x)
{
    x = fabs(x);
    switch (filter) {
    case PS_FILTER_BILINEAR:
        return x < 1 ? 1 - x : 0;
    case PS_FILTER_BICUBIC: /* Catmull-Rom, a = -0.5 */
        if (x < 1)
            return 1.5 * x * x * x - 2.5 * x * x + 1;
        if (x < 2)
            return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
        return 0;
    case PS_FILTER_LANCZOS3:
        return x < 3 ? sinc(x) * sinc(x / 3) : 0;
    default:
        return x < 0.5 ? 1 : 0;
    }
}

static double support(ps_filter filter)
{
    return filter == PS_FILTER_BILINEAR ? 1 : filter == PS_FILTER_BICUBIC ? 2 : 3;
}

/* Weights for one axis: for output i, `count` taps starting at first[i]. */
typedef struct {
    int taps;
    int *first;
    float *weights; /* out_size * taps */
} contributions;

static int contributions_make(contributions *k, int in_size, int out_size, ps_filter filter)
{
    double scale = (double)out_size / in_size;
    double stretch = scale < 1 ? 1 / scale : 1;
    double radius = support(filter) * stretch;
    k->taps = (int)ceil(radius * 2) + 1;
    k->first = malloc(sizeof(int) * (size_t)out_size);
    k->weights = calloc((size_t)out_size * k->taps, sizeof(float));
    if (!k->first || !k->weights)
        return 0;
    for (int i = 0; i < out_size; i++) {
        double center = (i + 0.5) / scale - 0.5;
        int first = (int)floor(center - radius) + 1;
        k->first[i] = first;
        double total = 0;
        float *w = k->weights + (size_t)i * k->taps;
        for (int t = 0; t < k->taps; t++) {
            double value = kernel(filter, (first + t - center) / stretch);
            w[t] = (float)value;
            total += value;
        }
        if (total != 0)
            for (int t = 0; t < k->taps; t++)
                w[t] = (float)(w[t] / total);
    }
    return 1;
}

static void contributions_free(contributions *k)
{
    free(k->first);
    free(k->weights);
}

static int clamp_index(int i, int size)
{
    return i < 0 ? 0 : i >= size ? size - 1 : i;
}

static ps_status nearest(const ps_image *in, int width, int height, ps_image *out)
{
    ps_status status = ps_image_new(width, height, in->channels, out);
    if (status != PS_OK)
        return status;
    int n = in->channels;
    for (int y = 0; y < height; y++) {
        int sy = clamp_index((int)((y + 0.5) * in->height / height), in->height);
        for (int x = 0; x < width; x++) {
            int sx = clamp_index((int)((x + 0.5) * in->width / width), in->width);
            memcpy(out->data + ((size_t)y * width + x) * n, in->data + ((size_t)sy * in->width + sx) * n, (size_t)n);
        }
    }
    return PS_OK;
}

ps_status ps_resize(const ps_image *in, int width, int height, ps_filter filter, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!in || !in->data || width <= 0 || height <= 0 || width > 32768 || height > 32768)
        return PS_ERR_ARG;
    if (filter == PS_FILTER_NEAREST)
        return nearest(in, width, height, out);

    int n = in->channels, alpha = ps_has_alpha(in), colors = ps_color_channels(in);
    float to_linear[256];
    for (int i = 0; i < 256; i++) {
        double v = i / 255.0;
        to_linear[i] = (float)(v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4));
    }
    uint8_t to_srgb[4096];
    for (int i = 0; i < 4096; i++) {
        double v = i / 4095.0;
        to_srgb[i] = ps_clamp_u8(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1 / 2.4) - 0.055));
    }

    size_t in_pixels = (size_t)in->width * in->height;
    float *linear = malloc(sizeof(float) * in_pixels * n);
    float *middle = malloc(sizeof(float) * (size_t)width * in->height * n);
    contributions kx = {0}, ky = {0};
    ps_status status = PS_ERR_NOMEM;
    if (!linear || !middle || !contributions_make(&kx, in->width, width, filter) ||
        !contributions_make(&ky, in->height, height, filter))
        goto done;

    for (size_t i = 0; i < in_pixels; i++) {
        const uint8_t *p = in->data + i * n;
        float a = alpha ? p[n - 1] / 255.0f : 1;
        for (int c = 0; c < colors; c++)
            linear[i * n + c] = to_linear[p[c]] * a;
        if (alpha)
            linear[i * n + n - 1] = a;
    }
    /* Horizontal pass. */
    for (int y = 0; y < in->height; y++)
        for (int x = 0; x < width; x++) {
            const float *w = kx.weights + (size_t)x * kx.taps;
            float sum[4] = {0};
            for (int t = 0; t < kx.taps; t++) {
                if (w[t] == 0)
                    continue;
                const float *p = linear + ((size_t)y * in->width + clamp_index(kx.first[x] + t, in->width)) * n;
                for (int c = 0; c < n; c++)
                    sum[c] += w[t] * p[c];
            }
            memcpy(middle + ((size_t)y * width + x) * n, sum, sizeof(float) * n);
        }
    /* Vertical pass, straight to bytes. */
    status = ps_image_new(width, height, n, out);
    if (status != PS_OK)
        goto done;
    for (int y = 0; y < height; y++) {
        const float *w = ky.weights + (size_t)y * ky.taps;
        for (int x = 0; x < width; x++) {
            float sum[4] = {0};
            for (int t = 0; t < ky.taps; t++) {
                if (w[t] == 0)
                    continue;
                const float *p = middle + ((size_t)clamp_index(ky.first[y] + t, in->height) * width + x) * n;
                for (int c = 0; c < n; c++)
                    sum[c] += w[t] * p[c];
            }
            uint8_t *q = out->data + ((size_t)y * width + x) * n;
            float a = alpha ? sum[n - 1] : 1;
            if (a > 1)
                a = 1;
            for (int c = 0; c < colors; c++) {
                float v = a > 1e-6f ? sum[c] / a : 0;
                v = v < 0 ? 0 : v > 1 ? 1 : v;
                q[c] = to_srgb[(int)(v * 4095 + 0.5f)];
            }
            if (alpha)
                q[n - 1] = ps_clamp_u8(a * 255);
        }
    }
    status = PS_OK;
done:
    free(linear);
    free(middle);
    contributions_free(&kx);
    contributions_free(&ky);
    return status;
}
