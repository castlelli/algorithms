/* Writes the expected results for the website's verification section.
 *
 * Each check names a function of the WebAssembly interface (src/wasm.c), the fixture it runs on and
 * its arguments. This program runs the very same functions natively and records a hash of what they
 * return; the website runs them again in the browser and compares. A few checks compare against the
 * files written by the original compressor instead.
 *
 * Usage: golden FIXTURES_DIR OUTPUT.json
 */
#include "pixelsmith.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    int32_t status, width, height, channels;
    uint8_t *data;
    int32_t size;
    uint8_t *extra;
    int32_t extra_size, padding;
    double values[16];
} ps_wasm_result;

ps_wasm_result *ps_wasm_decode(const uint8_t *data, int size);
ps_wasm_result *ps_wasm_encode(uint8_t *rgba, int width, int height, int format, int quality, int subsampling, int gray);
ps_wasm_result *ps_wasm_resize(uint8_t *rgba, int width, int height, int new_width, int new_height, int filter);
ps_wasm_result *ps_wasm_rotate(uint8_t *rgba, int width, int height, double degrees);
ps_wasm_result *ps_wasm_adjust(uint8_t *rgba, int width, int height, double brightness, double contrast, double gamma,
                               double saturation, double hue, double temperature);
ps_wasm_result *ps_wasm_effect(uint8_t *rgba, int width, int height, int kind, double value);
ps_wasm_result *ps_wasm_filter(uint8_t *rgba, int width, int height, int kind, double a, double b);
ps_wasm_result *ps_wasm_quantize(uint8_t *rgba, int width, int height, int colors, int dither);
ps_wasm_result *ps_wasm_compare(uint8_t *a, uint8_t *b, int width, int height, double amplify);
void ps_wasm_result_free(ps_wasm_result *r);

static uint32_t fnv1a(const uint8_t *data, size_t size)
{
    uint32_t h = 2166136261u;
    for (size_t i = 0; i < size; i++) {
        h ^= data[i];
        h *= 16777619u;
    }
    return h;
}

static const char *dir;

static uint8_t *read_fixture(const char *name, size_t *size)
{
    char path[512];
    uint8_t *data;
    snprintf(path, sizeof path, "%s/%s", dir, name);
    if (ps_read_file(path, &data, size) != PS_OK) {
        fprintf(stderr, "golden: cannot read %s\n", path);
        exit(1);
    }
    return data;
}

/* Decodes a fixture through the same entry point the website uses, as RGBA. */
static ps_wasm_result *rgba_fixture(const char *name)
{
    size_t size;
    uint8_t *data = read_fixture(name, &size);
    ps_wasm_result *r = ps_wasm_decode(data, (int)size);
    free(data);
    if (!r || r->status != PS_OK) {
        fprintf(stderr, "golden: cannot decode %s\n", name);
        exit(1);
    }
    return r;
}

static FILE *out;
static int first = 1;

static void begin(const char *id, const char *group, const char *title, const char *detail)
{
    fprintf(out, "%s\n    {\"id\": \"%s\", \"group\": \"%s\", \"title\": \"%s\", \"detail\": \"%s\"", first ? "" : ",", id,
            group, title, detail);
    first = 0;
}

static void expect_bytes(const ps_wasm_result *r)
{
    if (!r || r->status != PS_OK) {
        fprintf(stderr, "golden: a check failed natively\n");
        exit(1);
    }
    fprintf(out, ", \"expect\": {\"hash\": %u, \"size\": %d, \"width\": %d, \"height\": %d}}", fnv1a(r->data, (size_t)r->size),
            r->size, r->width, r->height);
}

int main(int argc, char **argv)
{
    if (argc != 3) {
        fprintf(stderr, "usage: golden FIXTURES_DIR OUTPUT.json\n");
        return 2;
    }
    dir = argv[1];
    out = fopen(argv[2], "w");
    if (!out)
        return 1;
    fprintf(out, "{\n  \"version\": \"%s\",\n  \"checks\": [", PS_VERSION);

    ps_wasm_result *parrot = rgba_fixture("parrot.png"), *gradient = rgba_fixture("gradient.png");
    ps_wasm_result *gray = rgba_fixture("gray.png"), *alpha = rgba_fixture("alpha.png");
    const struct {
        const char *name;
        ps_wasm_result *image;
    } fixtures[] = {{"parrot", parrot}, {"gradient", gradient}, {"gray", gray}, {"alpha", alpha}};

    /* 1. The classic format against the files the original programs wrote. */
    for (int f = 0; f < 4; f++) {
        char name[64], id[64], title[160];
        size_t size;
        snprintf(name, sizeof name, "%s.classic.txt", fixtures[f].name);
        uint8_t *text = read_fixture(name, &size);
        snprintf(id, sizeof id, "classic-encode-%s", fixtures[f].name);
        snprintf(title, sizeof title, "Classic encoder matches the original program on %s.png", fixtures[f].name);
        begin(id, "Original compressor", title, "Text output must be byte-identical to what the original compressor wrote.");
        fprintf(out, ", \"call\": \"encode\", \"input\": \"%s\", \"args\": [%d, 50, 0, 0]", fixtures[f].name,
                PS_FORMAT_CLASSIC);
        fprintf(out, ", \"expect\": {\"hash\": %u, \"size\": %zu}}", fnv1a(text, size), size);

        /* Decoding the original text gives the original PNG, pixel for pixel. */
        snprintf(name, sizeof name, "%s.classic.png", fixtures[f].name);
        ps_wasm_result *reference = rgba_fixture(name);
        snprintf(id, sizeof id, "classic-decode-%s", fixtures[f].name);
        snprintf(title, sizeof title, "Classic decoder matches the original program on %s", fixtures[f].name);
        begin(id, "Original compressor", title, "Pixels must equal the original decompressor's PNG.");
        fprintf(out, ", \"call\": \"decode\", \"file\": \"%s.classic.txt\"", fixtures[f].name);
        expect_bytes(reference);
        ps_wasm_result_free(reference);
        free(text);
    }

    /* 2. The PXS codec: same bytes in the browser as natively, and the same pixels back. */
    const int qualities[] = {10, 50, 90};
    for (int i = 0; i < 3; i++) {
        char id[64], title[160];
        ps_wasm_result *r = ps_wasm_encode(parrot->data, parrot->width, parrot->height, PS_FORMAT_PXS, qualities[i], 1, 0);
        snprintf(id, sizeof id, "pxs-encode-%d", qualities[i]);
        snprintf(title, sizeof title, "PXS encoder, quality %d, 4:2:0", qualities[i]);
        begin(id, "PXS codec", title, "The .pxs file must be bit-identical to the native build's.");
        fprintf(out, ", \"call\": \"encode\", \"input\": \"parrot\", \"args\": [%d, %d, 1, 0]", PS_FORMAT_PXS, qualities[i]);
        expect_bytes(r);
        ps_wasm_result *d = ps_wasm_decode(r->data, r->size);
        snprintf(id, sizeof id, "pxs-decode-%d", qualities[i]);
        snprintf(title, sizeof title, "PXS round trip, quality %d", qualities[i]);
        begin(id, "PXS codec", title, "Decoding must give the same pixels as the native decoder.");
        fprintf(out, ", \"call\": \"roundtrip\", \"input\": \"parrot\", \"args\": [%d, %d, 1, 0]", PS_FORMAT_PXS, qualities[i]);
        expect_bytes(d);
        ps_wasm_result_free(d);
        ps_wasm_result_free(r);
    }
    {
        ps_wasm_result *r = ps_wasm_encode(gray->data, gray->width, gray->height, PS_FORMAT_PXS, 75, 0, 1);
        begin("pxs-encode-gray", "PXS codec", "PXS encoder, grayscale", "One channel, its own Huffman tables.");
        fprintf(out, ", \"call\": \"encode\", \"input\": \"gray\", \"args\": [%d, 75, 0, 1]", PS_FORMAT_PXS);
        expect_bytes(r);
        ps_wasm_result_free(r);
        r = ps_wasm_encode(gradient->data, gradient->width, gradient->height, PS_FORMAT_PXS, 60, 0, 0);
        begin("pxs-encode-odd", "PXS codec", "PXS encoder, 37 x 29 pixels, 4:4:4",
              "Sizes that are not multiples of 8 are padded by repeating the edge.");
        fprintf(out, ", \"call\": \"encode\", \"input\": \"gradient\", \"args\": [%d, 60, 0, 0]", PS_FORMAT_PXS);
        expect_bytes(r);
        ps_wasm_result_free(r);
    }

    /* 3. Formats. */
    {
        ps_wasm_result *r = ps_wasm_encode(alpha->data, alpha->width, alpha->height, PS_FORMAT_PNG, 90, 0, 0);
        begin("png-encode", "Formats", "PNG encoder keeps transparency", "RGBA in, RGBA PNG out, same bytes.");
        fprintf(out, ", \"call\": \"encode\", \"input\": \"alpha\", \"args\": [%d, 90, 0, 0]", PS_FORMAT_PNG);
        expect_bytes(r);
        ps_wasm_result_free(r);
        r = ps_wasm_encode(parrot->data, parrot->width, parrot->height, PS_FORMAT_JPEG, 80, 0, 0);
        begin("jpeg-encode", "Formats", "JPEG encoder, quality 80", "Baseline JPEG, the same bytes as natively.");
        fprintf(out, ", \"call\": \"encode\", \"input\": \"parrot\", \"args\": [%d, 80, 0, 0]", PS_FORMAT_JPEG);
        expect_bytes(r);
        ps_wasm_result_free(r);
    }

    /* 4. Image operations. */
    const char *filters[] = {"nearest", "bilinear", "bicubic", "Lanczos-3"};
    for (int f = 0; f < 4; f++) {
        char id[64], title[160];
        ps_wasm_result *r = ps_wasm_resize(parrot->data, parrot->width, parrot->height, 41, 23, f);
        snprintf(id, sizeof id, "resize-%d", f);
        snprintf(title, sizeof title, "Resize to 41 x 23, %s", filters[f]);
        begin(id, "Resize and geometry", title, "Linear light, premultiplied alpha.");
        fprintf(out, ", \"call\": \"resize\", \"input\": \"parrot\", \"args\": [41, 23, %d]", f);
        expect_bytes(r);
        ps_wasm_result_free(r);
    }
    {
        ps_wasm_result *r = ps_wasm_resize(alpha->data, alpha->width, alpha->height, 97, 61, 3);
        begin("resize-alpha", "Resize and geometry", "Upscale with transparency, Lanczos-3", "No dark fringes at the edges.");
        fprintf(out, ", \"call\": \"resize\", \"input\": \"alpha\", \"args\": [97, 61, 3]");
        expect_bytes(r);
        ps_wasm_result_free(r);
        r = ps_wasm_rotate(gradient->data, gradient->width, gradient->height, 30);
        begin("rotate-30", "Resize and geometry", "Rotate 30 degrees", "Bilinear, canvas grows, transparent corners.");
        fprintf(out, ", \"call\": \"rotate\", \"input\": \"gradient\", \"args\": [30]");
        expect_bytes(r);
        ps_wasm_result_free(r);
    }
    {
        ps_wasm_result *r = ps_wasm_adjust(parrot->data, parrot->width, parrot->height, 0.1, 0.25, 1.3, 0.4, 35, -0.3);
        begin("adjust", "Tone and filters", "Brightness, contrast, gamma, saturation, hue, temperature", "All six at once.");
        fprintf(out, ", \"call\": \"adjust\", \"input\": \"parrot\", \"args\": [0.1, 0.25, 1.3, 0.4, 35, -0.3]");
        expect_bytes(r);
        ps_wasm_result_free(r);
        r = ps_wasm_effect(parrot->data, parrot->width, parrot->height, 5, 0);
        begin("equalize", "Tone and filters", "Histogram equalization", "Luma only, chroma kept.");
        fprintf(out, ", \"call\": \"effect\", \"input\": \"parrot\", \"args\": [5, 0]");
        expect_bytes(r);
        ps_wasm_result_free(r);
        const struct {
            int kind;
            double a, b;
            const char *id, *title;
        } fs[] = {{0, 2.5, 0, "blur", "Gaussian blur, sigma 2.5"},
                  {1, 1.2, 1.5, "sharpen", "Unsharp mask"},
                  {2, 0, 0, "edges", "Sobel edges"},
                  {4, 2, 0, "median", "Median, radius 2"}};
        for (int i = 0; i < 4; i++) {
            r = ps_wasm_filter(parrot->data, parrot->width, parrot->height, fs[i].kind, fs[i].a, fs[i].b);
            begin(fs[i].id, "Tone and filters", fs[i].title, "Same pixels as natively.");
            fprintf(out, ", \"call\": \"filter\", \"input\": \"parrot\", \"args\": [%d, %g, %g]", fs[i].kind, fs[i].a, fs[i].b);
            expect_bytes(r);
            ps_wasm_result_free(r);
        }
    }
    for (int dither = 0; dither < 3; dither++) {
        char id[64], title[160];
        const char *names[] = {"no dithering", "Floyd-Steinberg", "ordered (Bayer 8 x 8)"};
        ps_wasm_result *r = ps_wasm_quantize(parrot->data, parrot->width, parrot->height, 12, dither);
        snprintf(id, sizeof id, "quantize-%d", dither);
        snprintf(title, sizeof title, "12-color median cut, %s", names[dither]);
        begin(id, "Colors", title, "Palette and mapping as natively.");
        fprintf(out, ", \"call\": \"quantize\", \"input\": \"parrot\", \"args\": [12, %d]", dither);
        expect_bytes(r);
        ps_wasm_result_free(r);
    }

    /* 5. Metrics, compared as numbers. */
    {
        ps_wasm_result *decoded = rgba_fixture("parrot.classic.png");
        /* The classic output is cropped to 96 x 64, the same as the parrot. */
        ps_wasm_result *r = ps_wasm_compare(parrot->data, decoded->data, parrot->width, parrot->height, 4);
        begin("metrics", "Metrics", "PSNR and SSIM of the original compressor on parrot.png",
              "Numbers must agree to 9 decimal places.");
        fprintf(out, ", \"call\": \"compare\", \"input\": \"parrot\", \"file\": \"parrot.classic.png\"");
        fprintf(out, ", \"expect\": {\"values\": [%.12f, %.12f, %.12f]}}", r->values[0], r->values[1], r->values[2]);
        ps_wasm_result_free(r);
        ps_wasm_result_free(decoded);
    }

    fprintf(out, "\n  ]\n}\n");
    fclose(out);
    for (int f = 0; f < 4; f++)
        ps_wasm_result_free(fixtures[f].image);
    return 0;
}
