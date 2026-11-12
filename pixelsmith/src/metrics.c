/* Histograms and image-quality metrics. */
#include "pixelsmith.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

ps_status ps_histogram(const ps_image *image, uint32_t hist[4][256])
{
    if (!image || !image->data || !hist)
        return PS_ERR_ARG;
    memset(hist, 0, sizeof(uint32_t) * 4 * 256);
    size_t count = (size_t)image->width * image->height;
    for (size_t i = 0; i < count; i++) {
        const uint8_t *p = image->data + i * image->channels;
        if (image->channels >= 3) {
            hist[0][p[0]]++;
            hist[1][p[1]]++;
            hist[2][p[2]]++;
            hist[3][ps_clamp_u8(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])]++;
        } else {
            for (int c = 0; c < 4; c++)
                hist[c][p[0]]++;
        }
    }
    return PS_OK;
}

/* Both images as RGB composited over white. */
static ps_status flatten_pair(const ps_image *a, const ps_image *b, ps_image *fa, ps_image *fb)
{
    memset(fa, 0, sizeof *fa);
    memset(fb, 0, sizeof *fb);
    if (!a || !b || !a->data || !b->data)
        return PS_ERR_ARG;
    if (a->width != b->width || a->height != b->height)
        return PS_ERR_ARG;
    ps_status status = ps_image_convert(a, 3, fa);
    if (status == PS_OK)
        status = ps_image_convert(b, 3, fb);
    if (status != PS_OK) {
        ps_image_free(fa);
        ps_image_free(fb);
    }
    return status;
}

ps_status ps_psnr(const ps_image *a, const ps_image *b, double *psnr, double *mse)
{
    ps_image fa, fb;
    ps_status status = flatten_pair(a, b, &fa, &fb);
    if (status != PS_OK)
        return status;
    size_t n = ps_image_size(&fa);
    double sum = 0;
    for (size_t i = 0; i < n; i++) {
        double d = (double)fa.data[i] - fb.data[i];
        sum += d * d;
    }
    double m = sum / n;
    if (mse)
        *mse = m;
    if (psnr)
        *psnr = m == 0 ? INFINITY : 10 * log10(255.0 * 255.0 / m);
    ps_image_free(&fa);
    ps_image_free(&fb);
    return PS_OK;
}

/* Mean SSIM over 8x8 windows (stride 4) of the luma channel. */
ps_status ps_ssim(const ps_image *a, const ps_image *b, double *ssim)
{
    if (!ssim)
        return PS_ERR_ARG;
    ps_image fa, fb;
    ps_status status = flatten_pair(a, b, &fa, &fb);
    if (status != PS_OK)
        return status;
    int w = fa.width, h = fa.height;
    size_t count = (size_t)w * h;
    float *la = malloc(sizeof(float) * count), *lb = malloc(sizeof(float) * count);
    if (!la || !lb) {
        free(la);
        free(lb);
        ps_image_free(&fa);
        ps_image_free(&fb);
        return PS_ERR_NOMEM;
    }
    for (size_t i = 0; i < count; i++) {
        const uint8_t *p = fa.data + i * 3, *q = fb.data + i * 3;
        la[i] = (float)(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]);
        lb[i] = (float)(0.299 * q[0] + 0.587 * q[1] + 0.114 * q[2]);
    }
    const double c1 = (0.01 * 255) * (0.01 * 255), c2 = (0.03 * 255) * (0.03 * 255);
    int win = w < 8 || h < 8 ? (w < h ? w : h) : 8;
    double total = 0;
    long windows = 0;
    for (int y = 0; y + win <= h; y += win > 4 ? 4 : 1)
        for (int x = 0; x + win <= w; x += win > 4 ? 4 : 1) {
            double ma = 0, mb = 0, va = 0, vb = 0, cov = 0;
            int n = win * win;
            for (int j = 0; j < win; j++)
                for (int i = 0; i < win; i++) {
                    size_t k = (size_t)(y + j) * w + x + i;
                    ma += la[k];
                    mb += lb[k];
                }
            ma /= n;
            mb /= n;
            for (int j = 0; j < win; j++)
                for (int i = 0; i < win; i++) {
                    size_t k = (size_t)(y + j) * w + x + i;
                    double da = la[k] - ma, db = lb[k] - mb;
                    va += da * da;
                    vb += db * db;
                    cov += da * db;
                }
            if (n > 1) {
                va /= n - 1;
                vb /= n - 1;
                cov /= n - 1;
            }
            total += ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
            windows++;
        }
    *ssim = windows ? total / windows : 1;
    free(la);
    free(lb);
    ps_image_free(&fa);
    ps_image_free(&fb);
    return PS_OK;
}

ps_status ps_difference(const ps_image *a, const ps_image *b, double amplify, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    ps_image fa, fb;
    ps_status status = flatten_pair(a, b, &fa, &fb);
    if (status != PS_OK)
        return status;
    status = ps_image_new(fa.width, fa.height, 3, out);
    if (status == PS_OK) {
        size_t n = ps_image_size(&fa);
        for (size_t i = 0; i < n; i++)
            out->data[i] = ps_clamp_u8(fabs((double)fa.data[i] - fb.data[i]) * amplify);
    }
    ps_image_free(&fa);
    ps_image_free(&fb);
    return status;
}
