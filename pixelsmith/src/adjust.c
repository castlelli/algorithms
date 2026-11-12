/* Tone and color adjustments. They work in place on the color channels; alpha is never touched. */
#include "pixelsmith.h"

#include <math.h>
#include <string.h>

#define PS_PI 3.14159265358979323846

static int ok(const ps_image *image)
{
    return image && image->data && image->width > 0 && image->height > 0;
}

static double luma(double r, double g, double b)
{
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

ps_adjust_params ps_adjust_defaults(void)
{
    ps_adjust_params p = {0, 0, 1, 0, 0, 0};
    return p;
}

static double clampd(double v, double lo, double hi)
{
    return v < lo ? lo : v > hi ? hi : v;
}

ps_status ps_adjust(ps_image *image, const ps_adjust_params *params)
{
    if (!ok(image) || !params)
        return PS_ERR_ARG;
    double brightness = clampd(params->brightness, -1, 1) * 255;
    double contrast = tan((clampd(params->contrast, -1, 0.99) + 1) * PS_PI / 4);
    double gamma = clampd(params->gamma, 0.1, 10);
    double saturation = 1 + clampd(params->saturation, -1, 1);
    double temperature = clampd(params->temperature, -1, 1) * 40;

    /* Brightness, contrast and gamma act on each channel alike: one table. */
    uint8_t table[256];
    for (int i = 0; i < 256; i++) {
        double v = (i + brightness - 127.5) * contrast + 127.5;
        v = 255 * pow(clampd(v, 0, 255) / 255, 1 / gamma);
        table[i] = ps_clamp_u8(v);
    }

    /* Hue rotation and saturation as 3x3 matrices (the W3C filter-effects definitions), combined. */
    double h = params->hue * PS_PI / 180, c = cos(h), s = sin(h), k = saturation;
    double hue[3][3] = {
        {0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928},
        {0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283},
        {0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072}};
    double sat[3][3] = {
        {0.213 + 0.787 * k, 0.715 - 0.715 * k, 0.072 - 0.072 * k},
        {0.213 - 0.213 * k, 0.715 + 0.285 * k, 0.072 - 0.072 * k},
        {0.213 - 0.213 * k, 0.715 - 0.715 * k, 0.072 + 0.928 * k}};
    double mix[3][3];
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++) {
            double sum = 0;
            for (int n = 0; n < 3; n++)
                sum += sat[i][n] * hue[n][j];
            mix[i][j] = sum;
        }
    int color = image->channels >= 3, identity_color = params->hue == 0 && saturation == 1 && temperature == 0;
    size_t count = (size_t)image->width * image->height;
    for (size_t i = 0; i < count; i++) {
        uint8_t *p = image->data + i * image->channels;
        if (!color) {
            p[0] = table[p[0]];
            continue;
        }
        if (!identity_color) {
            double r = p[0] + temperature, g = p[1] + temperature * 0.1, b = p[2] - temperature;
            double nr = mix[0][0] * r + mix[0][1] * g + mix[0][2] * b;
            double ng = mix[1][0] * r + mix[1][1] * g + mix[1][2] * b;
            double nb = mix[2][0] * r + mix[2][1] * g + mix[2][2] * b;
            p[0] = ps_clamp_u8(nr);
            p[1] = ps_clamp_u8(ng);
            p[2] = ps_clamp_u8(nb);
        }
        p[0] = table[p[0]];
        p[1] = table[p[1]];
        p[2] = table[p[2]];
    }
    return PS_OK;
}

ps_status ps_grayscale(ps_image *image)
{
    if (!ok(image))
        return PS_ERR_ARG;
    if (image->channels < 3)
        return PS_OK;
    size_t count = (size_t)image->width * image->height;
    for (size_t i = 0; i < count; i++) {
        uint8_t *p = image->data + i * image->channels;
        p[0] = p[1] = p[2] = ps_clamp_u8(luma(p[0], p[1], p[2]));
    }
    return PS_OK;
}

ps_status ps_invert(ps_image *image)
{
    if (!ok(image))
        return PS_ERR_ARG;
    size_t count = (size_t)image->width * image->height;
    int colors = ps_color_channels(image);
    for (size_t i = 0; i < count; i++)
        for (int c = 0; c < colors; c++)
            image->data[i * image->channels + c] ^= 0xFF;
    return PS_OK;
}

ps_status ps_sepia(ps_image *image, double amount)
{
    if (!ok(image))
        return PS_ERR_ARG;
    amount = clampd(amount, 0, 1);
    if (image->channels < 3)
        return PS_OK;
    size_t count = (size_t)image->width * image->height;
    for (size_t i = 0; i < count; i++) {
        uint8_t *p = image->data + i * image->channels;
        double r = p[0], g = p[1], b = p[2];
        double sr = 0.393 * r + 0.769 * g + 0.189 * b;
        double sg = 0.349 * r + 0.686 * g + 0.168 * b;
        double sb = 0.272 * r + 0.534 * g + 0.131 * b;
        p[0] = ps_clamp_u8(r + (sr - r) * amount);
        p[1] = ps_clamp_u8(g + (sg - g) * amount);
        p[2] = ps_clamp_u8(b + (sb - b) * amount);
    }
    return PS_OK;
}

ps_status ps_threshold(ps_image *image, int level)
{
    if (!ok(image))
        return PS_ERR_ARG;
    size_t count = (size_t)image->width * image->height;
    int colors = ps_color_channels(image);
    for (size_t i = 0; i < count; i++) {
        uint8_t *p = image->data + i * image->channels;
        double l = colors == 3 ? luma(p[0], p[1], p[2]) : p[0];
        uint8_t v = l >= level ? 255 : 0;
        for (int c = 0; c < colors; c++)
            p[c] = v;
    }
    return PS_OK;
}

ps_status ps_auto_levels(ps_image *image, double clip_percent)
{
    if (!ok(image))
        return PS_ERR_ARG;
    clip_percent = clampd(clip_percent, 0, 20);
    size_t count = (size_t)image->width * image->height;
    int colors = ps_color_channels(image);
    for (int c = 0; c < colors; c++) {
        size_t hist[256] = {0};
        for (size_t i = 0; i < count; i++)
            hist[image->data[i * image->channels + c]]++;
        size_t clip = (size_t)(count * clip_percent / 100), sum = 0;
        int lo = 0, hi = 255;
        while (lo < 255 && (sum += hist[lo]) <= clip)
            lo++;
        sum = 0;
        while (hi > 0 && (sum += hist[hi]) <= clip)
            hi--;
        if (hi <= lo)
            continue;
        uint8_t table[256];
        for (int v = 0; v < 256; v++)
            table[v] = ps_clamp_u8((v - lo) * 255.0 / (hi - lo));
        for (size_t i = 0; i < count; i++) {
            uint8_t *p = image->data + i * image->channels + c;
            *p = table[*p];
        }
    }
    return PS_OK;
}

ps_status ps_equalize(ps_image *image)
{
    if (!ok(image))
        return PS_ERR_ARG;
    size_t count = (size_t)image->width * image->height;
    int colors = ps_color_channels(image);
    size_t hist[256] = {0};
    for (size_t i = 0; i < count; i++) {
        const uint8_t *p = image->data + i * image->channels;
        hist[colors == 3 ? ps_clamp_u8(luma(p[0], p[1], p[2])) : p[0]]++;
    }
    size_t cdf = 0, cdf_min = 0;
    double table[256];
    for (int v = 0; v < 256; v++) {
        cdf += hist[v];
        if (!cdf_min && cdf)
            cdf_min = cdf;
        table[v] = count > cdf_min ? (double)(cdf - cdf_min) * 255 / (count - cdf_min) : v;
    }
    for (size_t i = 0; i < count; i++) {
        uint8_t *p = image->data + i * image->channels;
        if (colors == 1) {
            p[0] = ps_clamp_u8(table[p[0]]);
            continue;
        }
        /* Replace the luma, keep the chroma (YCbCr). */
        double y = luma(p[0], p[1], p[2]);
        double cb = -0.168736 * p[0] - 0.331264 * p[1] + 0.5 * p[2];
        double cr = 0.5 * p[0] - 0.418688 * p[1] - 0.081312 * p[2];
        double ny = table[ps_clamp_u8(y)];
        p[0] = ps_clamp_u8(ny + 1.402 * cr);
        p[1] = ps_clamp_u8(ny - 0.344136 * cb - 0.714136 * cr);
        p[2] = ps_clamp_u8(ny + 1.772 * cb);
    }
    return PS_OK;
}
