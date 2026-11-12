/* Neighborhood filters. Edges are handled by clamping coordinates; alpha is carried through unchanged. */
#include "pixelsmith.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static int clampi(int v, int lo, int hi)
{
    return v < lo ? lo : v > hi ? hi : v;
}

static int ok(const ps_image *in, ps_image *out)
{
    if (out)
        memset(out, 0, sizeof *out);
    return in && in->data && out;
}

ps_status ps_convolve(const ps_image *in, const double *kernel, int size, double divisor, double bias, ps_image *out)
{
    if (!ok(in, out) || !kernel || size < 1 || size % 2 == 0 || size > 63 || divisor == 0)
        return PS_ERR_ARG;
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK)
        return status;
    int w = in->width, h = in->height, n = in->channels, colors = ps_color_channels(in), r = size / 2;
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
            for (int c = 0; c < colors; c++) {
                double sum = 0;
                for (int j = 0; j < size; j++) {
                    int sy = clampi(y + j - r, 0, h - 1);
                    for (int i = 0; i < size; i++) {
                        int sx = clampi(x + i - r, 0, w - 1);
                        sum += kernel[j * size + i] * in->data[((size_t)sy * w + sx) * n + c];
                    }
                }
                out->data[((size_t)y * w + x) * n + c] = ps_clamp_u8(sum / divisor + bias);
            }
    return PS_OK;
}

/* Separable Gaussian into a float buffer (color channels only). */
static float *gaussian(const ps_image *in, double sigma)
{
    int w = in->width, h = in->height, n = in->channels, colors = ps_color_channels(in);
    int r = (int)ceil(sigma * 3);
    if (r < 1)
        r = 1;
    if (r > 200)
        r = 200;
    double *k = malloc(sizeof(double) * (2 * r + 1));
    float *tmp = malloc(sizeof(float) * (size_t)w * h * colors);
    float *dst = malloc(sizeof(float) * (size_t)w * h * colors);
    if (!k || !tmp || !dst) {
        free(k);
        free(tmp);
        free(dst);
        return NULL;
    }
    double total = 0;
    for (int i = -r; i <= r; i++)
        total += k[i + r] = exp(-(double)i * i / (2 * sigma * sigma));
    for (int i = 0; i <= 2 * r; i++)
        k[i] /= total;
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
            for (int c = 0; c < colors; c++) {
                double sum = 0;
                for (int i = -r; i <= r; i++)
                    sum += k[i + r] * in->data[((size_t)y * w + clampi(x + i, 0, w - 1)) * n + c];
                tmp[((size_t)y * w + x) * colors + c] = (float)sum;
            }
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
            for (int c = 0; c < colors; c++) {
                double sum = 0;
                for (int i = -r; i <= r; i++)
                    sum += k[i + r] * tmp[((size_t)clampi(y + i, 0, h - 1) * w + x) * colors + c];
                dst[((size_t)y * w + x) * colors + c] = (float)sum;
            }
    free(k);
    free(tmp);
    return dst;
}

ps_status ps_blur(const ps_image *in, double sigma, ps_image *out)
{
    if (!ok(in, out) || !(sigma >= 0) || sigma > 64)
        return PS_ERR_ARG;
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK || sigma < 0.05)
        return status;
    float *blurred = gaussian(in, sigma);
    if (!blurred) {
        ps_image_free(out);
        return PS_ERR_NOMEM;
    }
    size_t count = (size_t)in->width * in->height;
    int colors = ps_color_channels(in);
    for (size_t i = 0; i < count; i++)
        for (int c = 0; c < colors; c++)
            out->data[i * in->channels + c] = ps_clamp_u8(blurred[i * colors + c]);
    free(blurred);
    return PS_OK;
}

ps_status ps_sharpen(const ps_image *in, double sigma, double amount, ps_image *out)
{
    if (!ok(in, out) || !(sigma > 0) || sigma > 64 || !(amount >= 0) || amount > 10)
        return PS_ERR_ARG;
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK)
        return status;
    float *blurred = gaussian(in, sigma);
    if (!blurred) {
        ps_image_free(out);
        return PS_ERR_NOMEM;
    }
    size_t count = (size_t)in->width * in->height;
    int colors = ps_color_channels(in);
    for (size_t i = 0; i < count; i++)
        for (int c = 0; c < colors; c++) {
            double v = in->data[i * in->channels + c];
            out->data[i * in->channels + c] = ps_clamp_u8(v + amount * (v - blurred[i * colors + c]));
        }
    free(blurred);
    return PS_OK;
}

static float *luma_plane(const ps_image *in)
{
    size_t count = (size_t)in->width * in->height;
    float *l = malloc(sizeof(float) * count);
    if (!l)
        return NULL;
    for (size_t i = 0; i < count; i++) {
        const uint8_t *p = in->data + i * in->channels;
        l[i] = in->channels >= 3 ? (float)(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) : p[0];
    }
    return l;
}

/* Applies a 3x3 kernel to luma and writes the result (scaled, offset) as gray into every color channel. */
static ps_status luma_filter(const ps_image *in, ps_image *out, int sobel, const double k[9], double bias)
{
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK)
        return status;
    float *l = luma_plane(in);
    if (!l) {
        ps_image_free(out);
        return PS_ERR_NOMEM;
    }
    int w = in->width, h = in->height, n = in->channels, colors = ps_color_channels(in);
    static const int gx[9] = {-1, 0, 1, -2, 0, 2, -1, 0, 1}, gy[9] = {-1, -2, -1, 0, 0, 0, 1, 2, 1};
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            double sx = 0, sy = 0, s = 0;
            for (int j = -1; j <= 1; j++)
                for (int i = -1; i <= 1; i++) {
                    float v = l[(size_t)clampi(y + j, 0, h - 1) * w + clampi(x + i, 0, w - 1)];
                    int t = (j + 1) * 3 + i + 1;
                    if (sobel) {
                        sx += gx[t] * v;
                        sy += gy[t] * v;
                    } else {
                        s += k[t] * v;
                    }
                }
            uint8_t v = ps_clamp_u8(sobel ? sqrt(sx * sx + sy * sy) / 2 : s + bias);
            for (int c = 0; c < colors; c++)
                out->data[((size_t)y * w + x) * n + c] = v;
        }
    free(l);
    return PS_OK;
}

ps_status ps_edges(const ps_image *in, ps_image *out)
{
    if (!ok(in, out))
        return PS_ERR_ARG;
    return luma_filter(in, out, 1, NULL, 0);
}

ps_status ps_emboss(const ps_image *in, ps_image *out)
{
    if (!ok(in, out))
        return PS_ERR_ARG;
    static const double k[9] = {-2, -1, 0, -1, 0, 1, 0, 1, 2};
    return luma_filter(in, out, 0, k, 128);
}

/* Median with a sliding histogram per row (Huang's algorithm): O(radius) per pixel. */
ps_status ps_median(const ps_image *in, int radius, ps_image *out)
{
    if (!ok(in, out) || radius < 1 || radius > 32)
        return PS_ERR_ARG;
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK)
        return status;
    int w = in->width, h = in->height, n = in->channels, colors = ps_color_channels(in);
    int area = (2 * radius + 1) * (2 * radius + 1), half = area / 2;
    for (int c = 0; c < colors; c++)
        for (int y = 0; y < h; y++) {
            int hist[256] = {0};
            for (int j = -radius; j <= radius; j++)
                for (int i = -radius; i <= radius; i++)
                    hist[in->data[((size_t)clampi(y + j, 0, h - 1) * w + clampi(i, 0, w - 1)) * n + c]]++;
            for (int x = 0; x < w; x++) {
                if (x > 0)
                    for (int j = -radius; j <= radius; j++) {
                        size_t row = (size_t)clampi(y + j, 0, h - 1) * w;
                        hist[in->data[(row + clampi(x - radius - 1, 0, w - 1)) * n + c]]--;
                        hist[in->data[(row + clampi(x + radius, 0, w - 1)) * n + c]]++;
                    }
                int sum = 0, v = 0;
                while ((sum += hist[v]) <= half)
                    v++;
                out->data[((size_t)y * w + x) * n + c] = (uint8_t)v;
            }
        }
    return PS_OK;
}

ps_status ps_pixelate(const ps_image *in, int block, ps_image *out)
{
    if (!ok(in, out) || block < 1 || block > 4096)
        return PS_ERR_ARG;
    ps_status status = ps_image_copy(in, out);
    if (status != PS_OK)
        return status;
    int w = in->width, h = in->height, n = in->channels;
    for (int by = 0; by < h; by += block)
        for (int bx = 0; bx < w; bx += block) {
            double sum[4] = {0};
            int count = 0;
            for (int y = by; y < by + block && y < h; y++)
                for (int x = bx; x < bx + block && x < w; x++, count++)
                    for (int c = 0; c < n; c++)
                        sum[c] += in->data[((size_t)y * w + x) * n + c];
            for (int y = by; y < by + block && y < h; y++)
                for (int x = bx; x < bx + block && x < w; x++)
                    for (int c = 0; c < n; c++)
                        out->data[((size_t)y * w + x) * n + c] = ps_clamp_u8(sum[c] / count);
        }
    return PS_OK;
}
