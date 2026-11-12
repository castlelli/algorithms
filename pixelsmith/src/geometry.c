#include "pixelsmith.h"

#include <math.h>
#include <string.h>

#define PS_PI 3.14159265358979323846

ps_status ps_crop(const ps_image *in, int x, int y, int width, int height, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!in || !in->data || x < 0 || y < 0 || width <= 0 || height <= 0 || x > in->width - width ||
        y > in->height - height)
        return PS_ERR_ARG;
    ps_status status = ps_image_new(width, height, in->channels, out);
    if (status != PS_OK)
        return status;
    size_t row = (size_t)width * in->channels;
    for (int r = 0; r < height; r++)
        memcpy(out->data + r * row, in->data + ((size_t)(y + r) * in->width + x) * in->channels, row);
    return PS_OK;
}

ps_status ps_rotate90(const ps_image *in, int quarter_turns, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!in || !in->data)
        return PS_ERR_ARG;
    int turns = ((quarter_turns % 4) + 4) % 4;
    int w = in->width, h = in->height, n = in->channels;
    int ow = turns % 2 ? h : w, oh = turns % 2 ? w : h;
    ps_status status = ps_image_new(ow, oh, n, out);
    if (status != PS_OK)
        return status;
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            int ox, oy;
            switch (turns) {
            case 1: ox = h - 1 - y; oy = x; break;
            case 2: ox = w - 1 - x; oy = h - 1 - y; break;
            case 3: ox = y; oy = w - 1 - x; break;
            default: ox = x; oy = y; break;
            }
            memcpy(out->data + ((size_t)oy * ow + ox) * n, in->data + ((size_t)y * w + x) * n, (size_t)n);
        }
    return PS_OK;
}

ps_status ps_flip(const ps_image *in, int horizontal, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!in || !in->data)
        return PS_ERR_ARG;
    int w = in->width, h = in->height, n = in->channels;
    ps_status status = ps_image_new(w, h, n, out);
    if (status != PS_OK)
        return status;
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++) {
            int sx = horizontal ? w - 1 - x : x, sy = horizontal ? y : h - 1 - y;
            memcpy(out->data + ((size_t)y * w + x) * n, in->data + ((size_t)sy * w + sx) * n, (size_t)n);
        }
    return PS_OK;
}

ps_status ps_rotate(const ps_image *in, double degrees, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!in || !in->data || !isfinite(degrees))
        return PS_ERR_ARG;
    double turns = degrees / 90;
    if (fabs(turns - round(turns)) < 1e-9)
        return ps_rotate90(in, (int)fmod(round(turns), 4), out);

    /* Work in RGBA or gray + alpha so the uncovered corners can be transparent. */
    ps_image source = {0};
    int n = ps_color_channels(in) + 1;
    ps_status status = ps_image_convert(in, n, &source);
    if (status != PS_OK)
        return status;
    double angle = degrees * PS_PI / 180, cs = cos(angle), sn = sin(angle);
    int w = in->width, h = in->height;
    int ow = (int)ceil(fabs(w * cs) + fabs(h * sn) - 1e-6);
    int oh = (int)ceil(fabs(w * sn) + fabs(h * cs) - 1e-6);
    status = ps_image_new(ow, oh, n, out);
    if (status != PS_OK) {
        ps_image_free(&source);
        return status;
    }
    double icx = w / 2.0, icy = h / 2.0, ocx = ow / 2.0, ocy = oh / 2.0;
    for (int y = 0; y < oh; y++)
        for (int x = 0; x < ow; x++) {
            /* Inverse map the output pixel center into the source. */
            double dx = x + 0.5 - ocx, dy = y + 0.5 - ocy;
            double sx = cs * dx + sn * dy + icx - 0.5, sy = -sn * dx + cs * dy + icy - 0.5;
            int x0 = (int)floor(sx), y0 = (int)floor(sy);
            double fx = sx - x0, fy = sy - y0;
            double acc[4] = {0};
            for (int j = 0; j < 2; j++)
                for (int i = 0; i < 2; i++) {
                    int px = x0 + i, py = y0 + j;
                    double weight = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
                    if (px < 0 || py < 0 || px >= w || py >= h || weight == 0)
                        continue; /* outside: transparent */
                    const uint8_t *p = source.data + ((size_t)py * w + px) * n;
                    double a = p[n - 1] * weight;
                    for (int c = 0; c < n - 1; c++)
                        acc[c] += p[c] * a; /* premultiplied */
                    acc[n - 1] += a;
                }
            uint8_t *q = out->data + ((size_t)y * ow + x) * n;
            for (int c = 0; c < n - 1; c++)
                q[c] = acc[n - 1] > 0 ? ps_clamp_u8(acc[c] / acc[n - 1]) : 0;
            q[n - 1] = ps_clamp_u8(acc[n - 1]);
        }
    ps_image_free(&source);
    return PS_OK;
}
