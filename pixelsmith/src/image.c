#include "pixelsmith.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

const char *ps_status_string(ps_status status)
{
    switch (status) {
    case PS_OK: return "ok";
    case PS_ERR_NOMEM: return "out of memory";
    case PS_ERR_ARG: return "invalid argument";
    case PS_ERR_DECODE: return "could not decode the image";
    case PS_ERR_ENCODE: return "could not encode the image";
    case PS_ERR_FORMAT: return "unrecognized or corrupt data";
    case PS_ERR_IO: return "could not read or write the file";
    }
    return "unknown error";
}

/* Upper bound on pixels, so width * height * channels always fits comfortably in size_t on wasm32. */
#define PS_MAX_PIXELS (1 << 28)

ps_status ps_image_new(int width, int height, int channels, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (width <= 0 || height <= 0 || channels < 1 || channels > 4)
        return PS_ERR_ARG;
    if ((double)width * height > PS_MAX_PIXELS)
        return PS_ERR_ARG;
    out->data = calloc((size_t)width * height, (size_t)channels);
    if (!out->data)
        return PS_ERR_NOMEM;
    out->width = width;
    out->height = height;
    out->channels = channels;
    return PS_OK;
}

void ps_image_free(ps_image *image)
{
    if (!image)
        return;
    free(image->data);
    memset(image, 0, sizeof *image);
}

size_t ps_image_size(const ps_image *image)
{
    return (size_t)image->width * image->height * image->channels;
}

int ps_has_alpha(const ps_image *image)
{
    return image->channels == 2 || image->channels == 4;
}

int ps_color_channels(const ps_image *image)
{
    return image->channels >= 3 ? 3 : 1;
}

uint8_t ps_clamp_u8(double value)
{
    if (!(value > 0)) /* also catches NaN */
        return 0;
    if (value >= 255)
        return 255;
    return (uint8_t)(value + 0.5);
}

static int valid(const ps_image *image)
{
    return image && image->data && image->width > 0 && image->height > 0 && image->channels >= 1 &&
           image->channels <= 4;
}

ps_status ps_image_copy(const ps_image *in, ps_image *out)
{
    if (!valid(in))
        return PS_ERR_ARG;
    ps_status status = ps_image_new(in->width, in->height, in->channels, out);
    if (status != PS_OK)
        return status;
    memcpy(out->data, in->data, ps_image_size(in));
    return PS_OK;
}

ps_status ps_image_convert(const ps_image *in, int channels, ps_image *out)
{
    if (!valid(in))
        return PS_ERR_ARG;
    if (channels == in->channels)
        return ps_image_copy(in, out);
    ps_status status = ps_image_new(in->width, in->height, channels, out);
    if (status != PS_OK)
        return status;
    size_t count = (size_t)in->width * in->height;
    int alpha_in = ps_has_alpha(in), alpha_out = channels == 2 || channels == 4;
    for (size_t i = 0; i < count; i++) {
        const uint8_t *p = in->data + i * in->channels;
        double r, g, b, a = alpha_in ? p[in->channels - 1] : 255;
        if (in->channels >= 3) {
            r = p[0];
            g = p[1];
            b = p[2];
        } else {
            r = g = b = p[0];
        }
        if (!alpha_out && alpha_in) { /* composite over white */
            double t = a / 255.0;
            r = r * t + 255 * (1 - t);
            g = g * t + 255 * (1 - t);
            b = b * t + 255 * (1 - t);
        }
        uint8_t *q = out->data + i * channels;
        if (channels >= 3) {
            q[0] = ps_clamp_u8(r);
            q[1] = ps_clamp_u8(g);
            q[2] = ps_clamp_u8(b);
        } else {
            q[0] = in->channels >= 3 ? ps_clamp_u8(0.299 * r + 0.587 * g + 0.114 * b) : ps_clamp_u8(r);
        }
        if (alpha_out)
            q[channels - 1] = (uint8_t)a;
    }
    return PS_OK;
}
