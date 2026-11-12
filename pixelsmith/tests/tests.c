/* Unit tests. Usage: test_runner FIXTURES_DIR */
#include "pixelsmith.h"
#include "test.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

static const char *fixtures = "tests/fixtures";
static const char *const fixture_names[] = {"parrot", "gradient", "gray", "alpha"};

static void fixture_path(char *out, size_t size, const char *name, const char *suffix)
{
    snprintf(out, size, "%s/%s%s", fixtures, name, suffix);
}

static ps_image load_fixture(const char *name)
{
    char path[512];
    ps_image image = {0};
    fixture_path(path, sizeof path, name, ".png");
    if (ps_load(path, &image) != PS_OK)
        fprintf(stderr, "  cannot load %s\n", path);
    return image;
}

static uint32_t rng_state = 12345;
static uint32_t rng(void)
{
    rng_state ^= rng_state << 13;
    rng_state ^= rng_state >> 17;
    rng_state ^= rng_state << 5;
    return rng_state;
}

static ps_image noise(int w, int h, int channels)
{
    ps_image image;
    ps_image_new(w, h, channels, &image);
    for (size_t i = 0; i < ps_image_size(&image); i++)
        image.data[i] = (uint8_t)rng();
    return image;
}

static ps_image solid(int w, int h, int channels, uint8_t value)
{
    ps_image image;
    ps_image_new(w, h, channels, &image);
    memset(image.data, value, ps_image_size(&image));
    return image;
}

static int same(const ps_image *a, const ps_image *b)
{
    return a->width == b->width && a->height == b->height && a->channels == b->channels &&
           !memcmp(a->data, b->data, ps_image_size(a));
}

static int max_difference(const ps_image *a, const ps_image *b)
{
    if (a->width != b->width || a->height != b->height || a->channels != b->channels)
        return 999;
    int worst = 0;
    for (size_t i = 0; i < ps_image_size(a); i++) {
        int d = abs((int)a->data[i] - (int)b->data[i]);
        if (d > worst)
            worst = d;
    }
    return worst;
}

static double psnr_of(const ps_image *a, const ps_image *b)
{
    double psnr = 0;
    ps_psnr(a, b, &psnr, NULL);
    return psnr;
}

/* ------------------------------------------------------------------ transform */

static void test_dct(void)
{
    double basis[8][8], block[8][8], coefficients[8][8], back[8][8];
    ps_dct_basis(basis);
    /* The basis is orthonormal. */
    double worst = 0;
    for (int a = 0; a < 8; a++)
        for (int b = 0; b < 8; b++) {
            double dot = 0;
            for (int n = 0; n < 8; n++)
                dot += basis[a][n] * basis[b][n];
            worst = fmax(worst, fabs(dot - (a == b)));
        }
    CHECK(worst < 1e-12);
    double energy_in = 0, energy_out = 0;
    for (int r = 0; r < 8; r++)
        for (int c = 0; c < 8; c++) {
            block[r][c] = (int)(rng() % 256) - 128;
            energy_in += block[r][c] * block[r][c];
        }
    ps_dct8(basis, block, coefficients);
    ps_idct8(basis, coefficients, back);
    worst = 0;
    for (int r = 0; r < 8; r++)
        for (int c = 0; c < 8; c++) {
            worst = fmax(worst, fabs(back[r][c] - block[r][c]));
            energy_out += coefficients[r][c] * coefficients[r][c];
        }
    CHECK(worst < 1e-9);
    CHECK(fabs(energy_in - energy_out) < 1e-6 * energy_in);
    /* A flat block has only a DC term, equal to 8 times the level. */
    for (int r = 0; r < 8; r++)
        for (int c = 0; c < 8; c++)
            block[r][c] = 10;
    ps_dct8(basis, block, coefficients);
    CHECK(fabs(coefficients[0][0] - 80) < 1e-9);
    CHECK(fabs(coefficients[3][5]) < 1e-9);
}

static void test_zigzag(void)
{
    int seen[64] = {0};
    for (int i = 0; i < 64; i++)
        seen[ps_zigzag[i]]++;
    int all_once = 1;
    for (int i = 0; i < 64; i++)
        all_once &= seen[i] == 1;
    CHECK(all_once);
    CHECK(ps_zigzag[1] == 1 && ps_zigzag[2] == 8 && ps_zigzag[3] == 16 && ps_zigzag[63] == 63);
}

static void test_quant_tables(void)
{
    int t50[64], t100[64], t10[64], t90[64];
    ps_quant_table(50, 0, t50);
    ps_quant_table(100, 0, t100);
    ps_quant_table(10, 0, t10);
    ps_quant_table(90, 0, t90);
    CHECK(t50[0] == 16 && t50[1] == 10 && t50[63] == 98); /* the original table */
    int ones = 1, ordered = 1;
    for (int i = 0; i < 64; i++) {
        ones &= t100[i] == 1;
        ordered &= t10[i] >= t50[i] && t50[i] >= t90[i] && t90[i] >= t100[i] && t10[i] <= 255;
    }
    CHECK(ones);
    CHECK(ordered);
}

/* ------------------------------------------------------------------ classic */

static void test_classic_matches_original(void)
{
    for (size_t f = 0; f < sizeof fixture_names / sizeof *fixture_names; f++) {
        char path[512];
        ps_image image = load_fixture(fixture_names[f]);
        uint8_t *expected;
        size_t expected_size;
        fixture_path(path, sizeof path, fixture_names[f], ".classic.txt");
        CHECK_OK(ps_read_file(path, &expected, &expected_size));
        char *text;
        size_t size;
        CHECK_OK(ps_classic_encode(&image, &text, &size));
        CHECK(size == expected_size && !memcmp(text, expected, size));

        ps_image decoded, reference;
        CHECK_OK(ps_decode(expected, expected_size, &decoded));
        fixture_path(path, sizeof path, fixture_names[f], ".classic.png");
        CHECK_OK(ps_load(path, &reference));
        CHECK(same(&decoded, &reference));
        ps_free(text);
        ps_free(expected);
        ps_image_free(&image);
        ps_image_free(&decoded);
        ps_image_free(&reference);
    }
}

static void test_classic_rejects_bad_input(void)
{
    const char *bad[] = {"", "8", "8 8", "7 8\n0 63\n", "8 8\n0 70\n", "8 8\n0 3", "-8 8\n0 63", "8 8\nx"};
    for (size_t i = 0; i < sizeof bad / sizeof *bad; i++) {
        ps_image image;
        CHECK(ps_classic_decode(bad[i], strlen(bad[i]), &image) != PS_OK);
        CHECK(image.data == NULL);
    }
    ps_image image;
    CHECK_OK(ps_classic_decode("8 8\n4 63\n", 9, &image));
    CHECK(image.width == 8 && image.data[0] == image.data[63]);
    ps_image_free(&image);
}

/* ------------------------------------------------------------------ pxs */

static void test_pxs_round_trip(void)
{
    ps_image parrot = load_fixture("parrot");
    size_t previous = 0;
    double previous_psnr = 0;
    for (int quality = 5; quality <= 100; quality += 19) {
        ps_pxs_options o = ps_pxs_defaults();
        o.quality = quality;
        uint8_t *data;
        size_t size;
        ps_image decoded;
        CHECK_OK(ps_pxs_encode(&parrot, &o, &data, &size));
        CHECK_OK(ps_pxs_decode(data, size, &decoded));
        CHECK(decoded.width == parrot.width && decoded.height == parrot.height && decoded.channels == 3);
        double psnr = psnr_of(&parrot, &decoded);
        CHECK(size > previous);         /* higher quality, more bytes */
        CHECK(psnr > previous_psnr);    /* and less error */
        CHECK(psnr > 24);
        previous = size;
        previous_psnr = psnr;
        ps_free(data);
        ps_image_free(&decoded);
    }
    /* Full chroma at quality 100 is close to lossless. */
    ps_pxs_options o = {100, PS_SUBSAMPLE_444, 0};
    uint8_t *data;
    size_t size;
    ps_image decoded;
    CHECK_OK(ps_pxs_encode(&parrot, &o, &data, &size));
    CHECK_OK(ps_pxs_decode(data, size, &decoded));
    CHECK(psnr_of(&parrot, &decoded) > 45);
    ps_free(data);
    ps_image_free(&decoded);
    ps_image_free(&parrot);
}

static void test_pxs_shapes(void)
{
    /* Odd sizes, gray, alpha, tiny and flat images. */
    const int sizes[][3] = {{1, 1, 3}, {1, 9, 1}, {9, 1, 4}, {17, 13, 2}, {37, 29, 3}, {64, 8, 1}};
    for (size_t i = 0; i < sizeof sizes / sizeof *sizes; i++) {
        ps_image image = noise(sizes[i][0], sizes[i][1], sizes[i][2]);
        for (int subsampling = 0; subsampling <= 1; subsampling++) {
            ps_pxs_options o = {90, subsampling, 0};
            uint8_t *data;
            size_t size;
            ps_image decoded;
            CHECK_OK(ps_pxs_encode(&image, &o, &data, &size));
            CHECK_OK(ps_decode(data, size, &decoded));
            CHECK(decoded.width == image.width && decoded.height == image.height);
            CHECK(decoded.channels == (image.channels >= 3 ? 3 : 1));
            ps_free(data);
            ps_image_free(&decoded);
        }
        ps_image_free(&image);
    }
    ps_image flat = solid(40, 24, 3, 77);
    ps_pxs_options o = ps_pxs_defaults();
    uint8_t *data;
    size_t size;
    ps_image decoded;
    CHECK_OK(ps_pxs_encode(&flat, &o, &data, &size));
    CHECK_OK(ps_pxs_decode(data, size, &decoded));
    CHECK(max_difference(&flat, &decoded) <= 1);
    ps_free(data);
    ps_image_free(&decoded);
    ps_image_free(&flat);
}

static void test_pxs_corrupt_input(void)
{
    ps_image parrot = load_fixture("parrot");
    ps_pxs_options o = ps_pxs_defaults();
    uint8_t *data;
    size_t size;
    CHECK_OK(ps_pxs_encode(&parrot, &o, &data, &size));
    int crashes_avoided = 1;
    /* Every truncation fails cleanly or decodes something; nothing reads out of bounds (ASan). */
    for (size_t cut = 0; cut < size; cut += 7) {
        uint8_t *copy = malloc(cut ? cut : 1);
        memcpy(copy, data, cut);
        ps_image image;
        ps_status status = ps_pxs_decode(copy, cut, &image);
        if (status != PS_OK)
            crashes_avoided &= image.data == NULL;
        ps_image_free(&image);
        free(copy);
    }
    for (int trial = 0; trial < 300; trial++) {
        uint8_t *copy = malloc(size);
        memcpy(copy, data, size);
        copy[rng() % size] ^= (uint8_t)(1 << (rng() % 8));
        ps_image image;
        ps_pxs_decode(copy, size, &image);
        ps_image_free(&image);
        free(copy);
    }
    CHECK(crashes_avoided);
    ps_pxs_info info;
    CHECK_OK(ps_pxs_inspect(data, size, &info));
    CHECK(info.width == parrot.width && info.quality == 75 && info.subsampling == 1);
    CHECK(info.header_bytes + info.payload_bytes == size);
    CHECK(info.code_lengths[1][0x00] > 0); /* end of block has a code */
    ps_free(data);
    ps_image_free(&parrot);
}

static void test_block_trace(void)
{
    uint8_t pixels[64];
    for (int i = 0; i < 64; i++)
        pixels[i] = (uint8_t)(100 + (i % 8) * 4);
    ps_block_trace t;
    ps_block_analyze(pixels, 50, 0, &t);
    CHECK(t.quant[0] == 16);
    CHECK(t.quantized[0] == (int)round(t.coefficients[0] / 16));
    CHECK(t.zigzag[1] == t.quantized[1] && t.zigzag[2] == t.quantized[8]);
    double worst = 0;
    for (int i = 0; i < 64; i++)
        worst = fmax(worst, fabs(t.reconstructed[i] - pixels[i]));
    CHECK(worst < 4);
    CHECK(t.symbol_count >= 1);
}

static void test_dct_mask(void)
{
    ps_image parrot = load_fixture("parrot"), out;
    uint8_t all[64], dc[64] = {1};
    memset(all, 1, 64);
    CHECK_OK(ps_dct_mask(&parrot, all, &out));
    CHECK(max_difference(&parrot, &out) <= 1);
    ps_image_free(&out);
    CHECK_OK(ps_dct_mask(&parrot, dc, &out)); /* DC only: every 8x8 block is flat */
    int flat = 1;
    for (int y = 0; y < 8; y++)
        for (int x = 0; x < 8; x++)
            flat &= out.data[(y * out.width + x) * 3] == out.data[0];
    CHECK(flat);
    ps_image_free(&out);
    ps_image_free(&parrot);
}

/* ------------------------------------------------------------------ io */

static void test_formats(void)
{
    for (int channels = 1; channels <= 4; channels++) {
        ps_image image = noise(23, 17, channels);
        const ps_format lossless[] = {PS_FORMAT_PNG, PS_FORMAT_BMP, PS_FORMAT_TGA};
        for (size_t f = 0; f < 3; f++) {
            uint8_t *data;
            size_t size;
            ps_image decoded;
            CHECK_OK(ps_encode(&image, lossless[f], 90, &data, &size));
            CHECK_OK(ps_decode(data, size, &decoded));
            /* BMP and TGA have no gray + alpha: stb writes it expanded. Compare as RGBA. */
            ps_image a, b;
            ps_image_convert(&image, 4, &a);
            ps_image_convert(&decoded, 4, &b);
            CHECK(same(&a, &b));
            ps_image_free(&a);
            ps_image_free(&b);
            ps_free(data);
            ps_image_free(&decoded);
        }
        uint8_t *data;
        size_t size;
        ps_image decoded;
        CHECK_OK(ps_encode(&image, PS_FORMAT_JPEG, 90, &data, &size));
        CHECK(ps_format_sniff(data, size) == PS_FORMAT_JPEG);
        CHECK_OK(ps_decode(data, size, &decoded));
        CHECK(decoded.width == 23 && decoded.height == 17 && !ps_has_alpha(&decoded));
        ps_free(data);
        ps_image_free(&decoded);
        ps_image_free(&image);
    }
    CHECK(ps_format_from_name("photo.JPG") == PS_FORMAT_JPEG);
    CHECK(ps_format_from_name("x.pxs") == PS_FORMAT_PXS);
    CHECK(ps_format_from_name("x.webp") == PS_FORMAT_UNKNOWN);
    ps_image image;
    CHECK(ps_decode((const uint8_t *)"not an image", 12, &image) != PS_OK && image.data == NULL);
}

static void test_convert(void)
{
    ps_image rgba;
    ps_image_new(2, 1, 4, &rgba);
    const uint8_t pixels[] = {255, 0, 0, 255, 0, 0, 255, 0};
    memcpy(rgba.data, pixels, sizeof pixels);
    ps_image rgb, gray;
    CHECK_OK(ps_image_convert(&rgba, 3, &rgb));
    CHECK(rgb.data[0] == 255 && rgb.data[1] == 0);                         /* opaque red stays red */
    CHECK(rgb.data[3] == 255 && rgb.data[4] == 255 && rgb.data[5] == 255); /* transparent becomes white */
    CHECK_OK(ps_image_convert(&rgb, 1, &gray));
    CHECK(gray.data[0] == 76 && gray.data[1] == 255);
    ps_image_free(&rgba);
    ps_image_free(&rgb);
    ps_image_free(&gray);
    CHECK(ps_image_new(0, 5, 3, &rgb) == PS_ERR_ARG && rgb.data == NULL);
    CHECK(ps_image_new(5, 5, 5, &rgb) == PS_ERR_ARG);
}

/* ------------------------------------------------------------------ resample and geometry */

static void test_resize(void)
{
    ps_image parrot = load_fixture("parrot"), out, back;
    for (int filter = PS_FILTER_NEAREST; filter <= PS_FILTER_LANCZOS3; filter++) {
        CHECK_OK(ps_resize(&parrot, parrot.width, parrot.height, (ps_filter)filter, &out));
        CHECK(max_difference(&parrot, &out) <= 1); /* same size is (almost) a copy */
        ps_image_free(&out);
        CHECK_OK(ps_resize(&parrot, 41, 23, (ps_filter)filter, &out));
        CHECK(out.width == 41 && out.height == 23 && out.channels == 3);
        ps_image_free(&out);
    }
    CHECK_OK(ps_resize(&parrot, parrot.width * 2, parrot.height * 2, PS_FILTER_LANCZOS3, &out));
    CHECK_OK(ps_resize(&out, parrot.width, parrot.height, PS_FILTER_LANCZOS3, &back));
    CHECK(psnr_of(&parrot, &back) > 35);
    ps_image_free(&out);
    ps_image_free(&back);

    ps_image flat = solid(30, 20, 3, 200);
    CHECK_OK(ps_resize(&flat, 7, 11, PS_FILTER_LANCZOS3, &out));
    CHECK(out.data[0] == 200 && out.data[ps_image_size(&out) - 1] == 200);
    ps_image_free(&out);
    ps_image_free(&flat);

    /* Transparent red around an opaque blue square: no red may leak into the blue. */
    ps_image rgba;
    ps_image_new(32, 32, 4, &rgba);
    for (int y = 0; y < 32; y++)
        for (int x = 0; x < 32; x++) {
            uint8_t *p = rgba.data + (y * 32 + x) * 4;
            int inside = x >= 8 && x < 24 && y >= 8 && y < 24;
            p[0] = inside ? 0 : 255;
            p[1] = 0;
            p[2] = inside ? 255 : 0;
            p[3] = inside ? 255 : 0;
        }
    CHECK_OK(ps_resize(&rgba, 13, 13, PS_FILTER_BICUBIC, &out));
    int leak = 0;
    for (size_t i = 0; i < 13 * 13; i++)
        if (out.data[i * 4 + 3] > 16 && out.data[i * 4] > 8)
            leak = 1;
    CHECK(!leak);
    ps_image_free(&out);
    ps_image_free(&rgba);
    CHECK(ps_resize(&parrot, 0, 10, PS_FILTER_BILINEAR, &out) == PS_ERR_ARG);
    ps_image_free(&parrot);
}

static void test_geometry(void)
{
    ps_image image = noise(13, 7, 3), a, b;
    CHECK_OK(ps_rotate90(&image, 1, &a));
    CHECK(a.width == 7 && a.height == 13);
    CHECK(!memcmp(a.data + (0 * 7 + 6) * 3, image.data, 3)); /* top-left goes to top-right */
    ps_image current = a;
    for (int i = 0; i < 3; i++) {
        CHECK_OK(ps_rotate90(&current, 1, &b));
        ps_image_free(&current);
        current = b;
    }
    CHECK(same(&current, &image));
    ps_image_free(&current);
    CHECK_OK(ps_rotate(&image, -90, &a));
    CHECK_OK(ps_rotate90(&image, 3, &b));
    CHECK(same(&a, &b));
    ps_image_free(&a);
    ps_image_free(&b);

    CHECK_OK(ps_flip(&image, 1, &a));
    CHECK_OK(ps_flip(&a, 1, &b));
    CHECK(same(&b, &image));
    CHECK(!memcmp(a.data, image.data + 12 * 3, 3));
    ps_image_free(&a);
    ps_image_free(&b);

    CHECK_OK(ps_crop(&image, 2, 3, 5, 4, &a));
    CHECK(a.width == 5 && a.height == 4 && !memcmp(a.data, image.data + (3 * 13 + 2) * 3, 3));
    ps_image_free(&a);
    CHECK(ps_crop(&image, 10, 0, 5, 4, &a) == PS_ERR_ARG && a.data == NULL);

    ps_image square = solid(20, 20, 3, 128);
    CHECK_OK(ps_rotate(&square, 45, &a));
    CHECK(a.channels == 4 && a.width == 29 && a.height == 29);
    CHECK(a.data[3] == 0);                                  /* corner is transparent */
    CHECK(a.data[((14 * 29) + 14) * 4 + 3] == 255);         /* center is opaque */
    CHECK(abs(a.data[((14 * 29) + 14) * 4] - 128) <= 1);
    ps_image_free(&a);
    ps_image_free(&square);
    ps_image_free(&image);
}

/* ------------------------------------------------------------------ adjust */

static void test_adjust(void)
{
    ps_image image = load_fixture("parrot"), copy;
    ps_image_copy(&image, &copy);
    ps_adjust_params p = ps_adjust_defaults();
    CHECK_OK(ps_adjust(&copy, &p));
    CHECK(max_difference(&image, &copy) <= 1);
    CHECK_OK(ps_invert(&copy));
    CHECK_OK(ps_invert(&copy));
    CHECK(max_difference(&image, &copy) <= 1);
    p.saturation = -1;
    CHECK_OK(ps_adjust(&copy, &p));
    int gray = 1;
    for (size_t i = 0; i < ps_image_size(&copy); i += 3)
        gray &= abs(copy.data[i] - copy.data[i + 1]) <= 1 && abs(copy.data[i + 1] - copy.data[i + 2]) <= 1;
    CHECK(gray);
    ps_image_free(&copy);

    ps_image_copy(&image, &copy);
    p = ps_adjust_defaults();
    p.hue = 360;
    CHECK_OK(ps_adjust(&copy, &p));
    CHECK(max_difference(&image, &copy) <= 2);
    p = ps_adjust_defaults();
    p.brightness = 0.2;
    ps_image brighter;
    ps_image_copy(&image, &brighter);
    ps_adjust(&brighter, &p);
    uint32_t h1[4][256], h2[4][256];
    ps_histogram(&image, h1);
    ps_histogram(&brighter, h2);
    double m1 = 0, m2 = 0;
    for (int v = 0; v < 256; v++) {
        m1 += v * (double)h1[3][v];
        m2 += v * (double)h2[3][v];
    }
    CHECK(m2 > m1);
    ps_image_free(&brighter);
    ps_image_free(&copy);

    ps_image_copy(&image, &copy);
    CHECK_OK(ps_grayscale(&copy));
    CHECK(copy.data[0] == copy.data[1] && copy.data[1] == copy.data[2]);
    CHECK_OK(ps_threshold(&copy, 128));
    int binary = 1;
    for (size_t i = 0; i < ps_image_size(&copy); i++)
        binary &= copy.data[i] == 0 || copy.data[i] == 255;
    CHECK(binary);
    ps_image_free(&copy);

    ps_image_copy(&image, &copy);
    CHECK_OK(ps_posterize(&copy, 4));
    int levels = 1;
    for (size_t i = 0; i < ps_image_size(&copy); i++)
        levels &= copy.data[i] == 0 || copy.data[i] == 85 || copy.data[i] == 170 || copy.data[i] == 255;
    CHECK(levels);
    ps_image_free(&copy);

    ps_image dim;
    ps_image_new(16, 16, 1, &dim);
    for (int i = 0; i < 256; i++)
        dim.data[i] = (uint8_t)(100 + i % 50);
    CHECK_OK(ps_auto_levels(&dim, 0));
    uint8_t lo = 255, hi = 0;
    for (int i = 0; i < 256; i++) {
        lo = dim.data[i] < lo ? dim.data[i] : lo;
        hi = dim.data[i] > hi ? dim.data[i] : hi;
    }
    CHECK(lo == 0 && hi == 255);
    CHECK_OK(ps_equalize(&dim));
    ps_image_free(&dim);
    CHECK_OK(ps_sepia(&image, 1));
    CHECK(image.data[0] >= image.data[2]);
    ps_image_free(&image);
}

/* ------------------------------------------------------------------ filters */

static void test_filters(void)
{
    ps_image flat = solid(25, 19, 4, 90), out;
    CHECK_OK(ps_blur(&flat, 3, &out));
    CHECK(same(&flat, &out));
    ps_image_free(&out);
    CHECK_OK(ps_edges(&flat, &out));
    CHECK(out.data[0] == 0 && out.data[3] == 90); /* no edges; alpha kept */
    ps_image_free(&out);
    CHECK_OK(ps_sharpen(&flat, 1, 2, &out));
    CHECK(same(&flat, &out));
    ps_image_free(&out);
    ps_image_free(&flat);

    ps_image speckled = solid(30, 30, 1, 120);
    for (int i = 0; i < 40; i++)
        speckled.data[rng() % 900] = (i % 2) ? 255 : 0;
    CHECK_OK(ps_median(&speckled, 1, &out));
    size_t still = 0; /* isolated speckles are all removed */
    for (int i = 0; i < 900; i++)
        still += out.data[i] != 120;
    CHECK(still < 10);
    ps_image_free(&out);
    ps_image_free(&speckled);

    ps_image parrot = load_fixture("parrot");
    CHECK_OK(ps_pixelate(&parrot, 8, &out));
    CHECK(!memcmp(out.data, out.data + (7 * out.width + 7) * 3, 3));
    ps_image_free(&out);
    CHECK_OK(ps_emboss(&parrot, &out));
    ps_image_free(&out);
    double box[9] = {1, 1, 1, 1, 1, 1, 1, 1, 1};
    CHECK_OK(ps_convolve(&parrot, box, 3, 9, 0, &out));
    ps_image_free(&out);
    CHECK(ps_convolve(&parrot, box, 2, 4, 0, &out) == PS_ERR_ARG);
    CHECK(ps_blur(&parrot, -1, &out) == PS_ERR_ARG);
    ps_image_free(&parrot);
}

/* ------------------------------------------------------------------ colors */

static void test_quantize(void)
{
    ps_image parrot = load_fixture("parrot"), out;
    for (int dither = PS_DITHER_NONE; dither <= PS_DITHER_BAYER; dither++) {
        CHECK_OK(ps_quantize(&parrot, 8, (ps_dither)dither, &out));
        /* Count distinct colors. */
        int distinct = 0;
        uint8_t seen[64][3];
        for (size_t i = 0; i < ps_image_size(&out); i += 3) {
            int found = 0;
            for (int k = 0; k < distinct && !found; k++)
                found = !memcmp(seen[k], out.data + i, 3);
            if (!found && distinct < 64)
                memcpy(seen[distinct++], out.data + i, 3);
        }
        CHECK(distinct <= 8);
        ps_image_free(&out);
    }
    ps_image_free(&parrot);

    ps_image three;
    ps_image_new(12, 1, 3, &three);
    const uint8_t colors[3][3] = {{250, 10, 10}, {10, 250, 10}, {10, 10, 250}};
    for (int i = 0; i < 12; i++)
        memcpy(three.data + i * 3, colors[i % 3], 3);
    CHECK_OK(ps_quantize(&three, 4, PS_DITHER_NONE, &out));
    CHECK(max_difference(&three, &out) <= 4);
    ps_image_free(&out);
    ps_image_free(&three);
    CHECK(ps_quantize(&parrot, 1, PS_DITHER_NONE, &out) == PS_ERR_ARG);
}

/* ------------------------------------------------------------------ metrics */

static void test_metrics(void)
{
    ps_image parrot = load_fixture("parrot"), copy, diff;
    ps_image_copy(&parrot, &copy);
    double psnr, mse, ssim;
    CHECK_OK(ps_psnr(&parrot, &copy, &psnr, &mse));
    CHECK(isinf(psnr) && mse == 0);
    CHECK_OK(ps_ssim(&parrot, &copy, &ssim));
    CHECK(fabs(ssim - 1) < 1e-12);
    copy.data[0] ^= 0x10;
    CHECK_OK(ps_psnr(&parrot, &copy, &psnr, &mse));
    CHECK(fabs(mse - 256.0 / ps_image_size(&parrot)) < 1e-9);
    CHECK_OK(ps_difference(&parrot, &copy, 1, &diff));
    CHECK(diff.data[0] == 16 && diff.data[1] == 0);
    ps_image_free(&diff);
    ps_image small = solid(4, 4, 3, 0);
    CHECK(ps_psnr(&parrot, &small, &psnr, &mse) == PS_ERR_ARG);
    ps_image blurred;
    ps_blur(&parrot, 2, &blurred);
    CHECK_OK(ps_ssim(&parrot, &blurred, &ssim));
    CHECK(ssim < 0.95 && ssim > 0.2);
    ps_image_free(&blurred);
    ps_image_free(&small);
    ps_image_free(&copy);
    ps_image_free(&parrot);
}

int main(int argc, char **argv)
{
    if (argc > 1)
        fixtures = argv[1];
    RUN(test_dct);
    RUN(test_zigzag);
    RUN(test_quant_tables);
    RUN(test_classic_matches_original);
    RUN(test_classic_rejects_bad_input);
    RUN(test_pxs_round_trip);
    RUN(test_pxs_shapes);
    RUN(test_pxs_corrupt_input);
    RUN(test_block_trace);
    RUN(test_dct_mask);
    RUN(test_formats);
    RUN(test_convert);
    RUN(test_resize);
    RUN(test_geometry);
    RUN(test_adjust);
    RUN(test_filters);
    RUN(test_quantize);
    RUN(test_metrics);
    printf("\n%d checks, %d failed\n", test_checks, test_failures);
    return test_failures ? 1 : 0;
}
