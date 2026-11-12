/* The WebAssembly interface used by the website.
 *
 * Images cross the boundary as RGBA (4 channels), which is what canvases use. Every call returns a
 * ps_wasm_result allocated on the heap, which JavaScript reads and then releases with
 * ps_wasm_result_free. Its layout is fixed (see the static asserts) so JavaScript can read it by offset.
 */
#include "pixelsmith.h"

#include <stddef.h>
#include <stdlib.h>
#include <string.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define PS_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define PS_EXPORT
#endif

typedef struct {
    int32_t status;
    int32_t width, height, channels;
    uint8_t *data;       /* image (RGBA) or encoded bytes */
    int32_t size;        /* bytes at data */
    uint8_t *extra;      /* histogram, palette, tables, traces */
    int32_t extra_size;
    int32_t padding;
    double values[16];   /* metrics and other numbers */
} ps_wasm_result;

_Static_assert(sizeof(void *) != 4 || offsetof(ps_wasm_result, data) == 16, "layout");
_Static_assert(sizeof(void *) != 4 || offsetof(ps_wasm_result, size) == 20, "layout");
_Static_assert(sizeof(void *) != 4 || offsetof(ps_wasm_result, extra) == 24, "layout");
_Static_assert(sizeof(void *) != 4 || offsetof(ps_wasm_result, extra_size) == 28, "layout");
_Static_assert(sizeof(void *) != 4 || offsetof(ps_wasm_result, values) == 40, "layout");
_Static_assert(offsetof(ps_block_trace, coefficients) == 512, "layout");
_Static_assert(offsetof(ps_block_trace, quant) == 1024, "layout");
_Static_assert(offsetof(ps_block_trace, quantized) == 1280, "layout");
_Static_assert(offsetof(ps_block_trace, zigzag) == 1536, "layout");
_Static_assert(offsetof(ps_block_trace, reconstructed) == 1792, "layout");
_Static_assert(offsetof(ps_block_trace, symbol_count) == 2304, "layout");
_Static_assert(offsetof(ps_block_trace, symbols) == 2308, "layout");

static ps_wasm_result *result_new(void)
{
    return calloc(1, sizeof(ps_wasm_result));
}

PS_EXPORT void ps_wasm_result_free(ps_wasm_result *r)
{
    if (!r)
        return;
    free(r->data);
    free(r->extra);
    free(r);
}

PS_EXPORT const char *ps_wasm_version(void)
{
    return PS_VERSION;
}

PS_EXPORT const char *ps_wasm_status_string(int status)
{
    return ps_status_string((ps_status)status);
}

/* Wraps caller memory as an image without copying. */
static ps_image view(uint8_t *rgba, int width, int height)
{
    ps_image image = {width, height, 4, rgba};
    return image;
}

/* Stores an image in the result as RGBA, taking ownership. */
static ps_wasm_result *image_result(ps_wasm_result *r, ps_status status, ps_image *image)
{
    if (!r) {
        ps_image_free(image);
        return NULL;
    }
    if (status == PS_OK && image->channels != 4) {
        ps_image rgba;
        status = ps_image_convert(image, 4, &rgba);
        ps_image_free(image);
        *image = rgba;
    }
    r->status = status;
    if (status == PS_OK) {
        r->width = image->width;
        r->height = image->height;
        r->channels = 4;
        r->data = image->data;
        r->size = (int32_t)ps_image_size(image);
    } else {
        ps_image_free(image);
    }
    return r;
}

PS_EXPORT ps_wasm_result *ps_wasm_decode(const uint8_t *data, int size)
{
    ps_wasm_result *r = result_new();
    ps_image image = {0};
    ps_status status = ps_decode(data, (size_t)size, &image);
    if (r && status == PS_OK)
        r->values[0] = image.channels; /* channels in the source */
    if (r)
        r->values[1] = ps_format_sniff(data, (size_t)size);
    return image_result(r, status, &image);
}

/* format: ps_format. For PXS, subsampling and gray select the options. */
PS_EXPORT ps_wasm_result *ps_wasm_encode(uint8_t *rgba, int width, int height, int format, int quality,
                                         int subsampling, int gray)
{
    ps_wasm_result *r = result_new();
    if (!r)
        return NULL;
    ps_image in = view(rgba, width, height), source = {0};
    const ps_image *image = &in;
    if (format == PS_FORMAT_CLASSIC) { /* gray as the original computed it, from RGB, ignoring alpha */
        size_t size = 0;
        r->status = ps_classic_encode(&in, (char **)&r->data, &size);
        r->size = (int32_t)size;
        return r;
    }
    /* Opaque images are stored without alpha, gray ones as gray. */
    int opaque = 1, monochrome = 1;
    size_t count = (size_t)width * height;
    for (size_t i = 0; i < count && (opaque || monochrome); i++) {
        const uint8_t *p = rgba + i * 4;
        opaque &= p[3] == 255;
        monochrome &= p[0] == p[1] && p[1] == p[2];
    }
    int channels = (monochrome ? 1 : 3) + (opaque ? 0 : 1);
    if (format == PS_FORMAT_JPEG || format == PS_FORMAT_PXS || format == PS_FORMAT_CLASSIC)
        channels = monochrome ? 1 : 3;
    if (channels != 4) {
        r->status = ps_image_convert(&in, channels, &source);
        if (r->status != PS_OK)
            return r;
        image = &source;
    }
    uint8_t *bytes = NULL;
    size_t size = 0;
    if (format == PS_FORMAT_PXS) {
        ps_pxs_options o = ps_pxs_defaults();
        o.quality = quality;
        o.subsampling = subsampling ? PS_SUBSAMPLE_420 : PS_SUBSAMPLE_444;
        o.grayscale = gray || monochrome;
        r->status = ps_pxs_encode(image, &o, &bytes, &size);
    } else {
        r->status = ps_encode(image, (ps_format)format, quality, &bytes, &size);
    }
    ps_image_free(&source);
    r->data = bytes;
    r->size = (int32_t)size;
    r->values[0] = channels;
    return r;
}

PS_EXPORT ps_wasm_result *ps_wasm_resize(uint8_t *rgba, int width, int height, int new_width, int new_height,
                                         int filter)
{
    ps_image in = view(rgba, width, height), out = {0};
    return image_result(result_new(), ps_resize(&in, new_width, new_height, (ps_filter)filter, &out), &out);
}

PS_EXPORT ps_wasm_result *ps_wasm_crop(uint8_t *rgba, int width, int height, int x, int y, int w, int h)
{
    ps_image in = view(rgba, width, height), out = {0};
    return image_result(result_new(), ps_crop(&in, x, y, w, h, &out), &out);
}

PS_EXPORT ps_wasm_result *ps_wasm_rotate(uint8_t *rgba, int width, int height, double degrees)
{
    ps_image in = view(rgba, width, height), out = {0};
    return image_result(result_new(), ps_rotate(&in, degrees, &out), &out);
}

PS_EXPORT ps_wasm_result *ps_wasm_flip(uint8_t *rgba, int width, int height, int horizontal)
{
    ps_image in = view(rgba, width, height), out = {0};
    return image_result(result_new(), ps_flip(&in, horizontal, &out), &out);
}

PS_EXPORT ps_wasm_result *ps_wasm_adjust(uint8_t *rgba, int width, int height, double brightness, double contrast,
                                         double gamma, double saturation, double hue, double temperature)
{
    ps_image in = view(rgba, width, height), out = {0};
    ps_status status = ps_image_copy(&in, &out);
    ps_adjust_params p = {brightness, contrast, gamma, saturation, hue, temperature};
    if (status == PS_OK)
        status = ps_adjust(&out, &p);
    return image_result(result_new(), status, &out);
}

/* kind: 0 grayscale, 1 invert, 2 sepia, 3 threshold, 4 auto levels, 5 equalize, 6 posterize */
PS_EXPORT ps_wasm_result *ps_wasm_effect(uint8_t *rgba, int width, int height, int kind, double value)
{
    ps_image in = view(rgba, width, height), out = {0};
    ps_status status = ps_image_copy(&in, &out);
    if (status == PS_OK) {
        switch (kind) {
        case 0: status = ps_grayscale(&out); break;
        case 1: status = ps_invert(&out); break;
        case 2: status = ps_sepia(&out, value); break;
        case 3: status = ps_threshold(&out, (int)value); break;
        case 4: status = ps_auto_levels(&out, value); break;
        case 5: status = ps_equalize(&out); break;
        case 6: status = ps_posterize(&out, (int)value); break;
        default: status = PS_ERR_ARG;
        }
    }
    return image_result(result_new(), status, &out);
}

/* kind: 0 blur, 1 sharpen, 2 edges, 3 emboss, 4 median, 5 pixelate */
PS_EXPORT ps_wasm_result *ps_wasm_filter(uint8_t *rgba, int width, int height, int kind, double a, double b)
{
    ps_image in = view(rgba, width, height), out = {0};
    ps_status status;
    switch (kind) {
    case 0: status = ps_blur(&in, a, &out); break;
    case 1: status = ps_sharpen(&in, a, b, &out); break;
    case 2: status = ps_edges(&in, &out); break;
    case 3: status = ps_emboss(&in, &out); break;
    case 4: status = ps_median(&in, (int)a, &out); break;
    case 5: status = ps_pixelate(&in, (int)a, &out); break;
    default: status = PS_ERR_ARG;
    }
    return image_result(result_new(), status, &out);
}

/* extra = palette (count * 3 bytes), values[0] = count */
PS_EXPORT ps_wasm_result *ps_wasm_quantize(uint8_t *rgba, int width, int height, int colors, int dither)
{
    ps_wasm_result *r = result_new();
    if (!r)
        return NULL;
    ps_image in = view(rgba, width, height), out = {0};
    uint8_t palette[256][3];
    int count = 0;
    ps_status status = ps_palette_median_cut(&in, colors, palette, &count);
    if (status == PS_OK)
        status = ps_remap(&in, (const uint8_t(*)[3])palette, count, (ps_dither)dither, &out);
    if (status == PS_OK && (r->extra = malloc((size_t)count * 3))) {
        memcpy(r->extra, palette, (size_t)count * 3);
        r->extra_size = count * 3;
        r->values[0] = count;
    }
    return image_result(r, status, &out);
}

/* image = difference map; values = PSNR, MSE, SSIM */
PS_EXPORT ps_wasm_result *ps_wasm_compare(uint8_t *a, uint8_t *b, int width, int height, double amplify)
{
    ps_wasm_result *r = result_new();
    if (!r)
        return NULL;
    ps_image x = view(a, width, height), y = view(b, width, height), diff = {0};
    ps_status status = ps_psnr(&x, &y, &r->values[0], &r->values[1]);
    if (status == PS_OK)
        status = ps_ssim(&x, &y, &r->values[2]);
    if (status == PS_OK)
        status = ps_difference(&x, &y, amplify, &diff);
    return image_result(r, status, &diff);
}

/* extra = 4 x 256 uint32: R, G, B, luma */
PS_EXPORT ps_wasm_result *ps_wasm_histogram(uint8_t *rgba, int width, int height)
{
    ps_wasm_result *r = result_new();
    if (!r)
        return NULL;
    ps_image in = view(rgba, width, height);
    r->extra = malloc(sizeof(uint32_t) * 4 * 256);
    if (!r->extra) {
        r->status = PS_ERR_NOMEM;
        return r;
    }
    r->extra_size = sizeof(uint32_t) * 4 * 256;
    r->status = ps_histogram(&in, (uint32_t(*)[256])r->extra);
    return r;
}

/* values = width, height, channels, quality, subsampling, header bytes, payload bytes;
   extra = 4 x 256 code lengths (luma DC, luma AC, chroma DC, chroma AC) */
PS_EXPORT ps_wasm_result *ps_wasm_pxs_inspect(const uint8_t *data, int size)
{
    ps_wasm_result *r = result_new();
    if (!r)
        return NULL;
    ps_pxs_info info;
    r->status = ps_pxs_inspect(data, (size_t)size, &info);
    if (r->status != PS_OK)
        return r;
    double v[7] = {info.width, info.height, info.channels, info.quality, info.subsampling, (double)info.header_bytes,
                   (double)info.payload_bytes};
    memcpy(r->values, v, sizeof v);
    if ((r->extra = malloc(sizeof info.code_lengths))) {
        memcpy(r->extra, info.code_lengths, sizeof info.code_lengths);
        r->extra_size = sizeof info.code_lengths;
    }
    return r;
}

/* extra = ps_block_trace */
PS_EXPORT ps_wasm_result *ps_wasm_block(const uint8_t *pixels, int quality, int chroma)
{
    ps_wasm_result *r = result_new();
    if (!r)
        return NULL;
    r->extra = malloc(sizeof(ps_block_trace));
    if (!r->extra) {
        r->status = PS_ERR_NOMEM;
        return r;
    }
    ps_block_analyze(pixels, quality, chroma, (ps_block_trace *)r->extra);
    r->extra_size = sizeof(ps_block_trace);
    return r;
}

PS_EXPORT ps_wasm_result *ps_wasm_dct_mask(uint8_t *rgba, int width, int height, const uint8_t *mask)
{
    ps_image in = view(rgba, width, height), out = {0};
    return image_result(result_new(), ps_dct_mask(&in, mask, &out), &out);
}

/* extra = 64 int32, row-major */
PS_EXPORT ps_wasm_result *ps_wasm_quant_table(int quality, int chroma)
{
    ps_wasm_result *r = result_new();
    if (!r)
        return NULL;
    r->extra = malloc(64 * sizeof(int));
    if (!r->extra) {
        r->status = PS_ERR_NOMEM;
        return r;
    }
    ps_quant_table(quality, chroma, (int *)r->extra);
    r->extra_size = 64 * sizeof(int);
    return r;
}
