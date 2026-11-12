/* pixelsmith: command-line front end for the Pixelsmith library. */
#include "pixelsmith.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char usage[] =
    "Pixelsmith " PS_VERSION ": free, open-source image tools in C.\n"
    "\n"
    "usage: pixelsmith <command> <input> [output] [options]\n"
    "\n"
    "Codec\n"
    "  compress   IN OUT.pxs  [--quality 1-100] [--444] [--gray]   DCT + Huffman, color 4:2:0 by default\n"
    "  compress   IN OUT.txt  --classic                             the original text format (gray, fixed table)\n"
    "  decompress IN.pxs|IN.txt OUT.png\n"
    "\n"
    "Geometry and formats\n"
    "  convert    IN OUT.{png,jpg,bmp,tga,pxs}  [--quality Q]\n"
    "  resize     IN OUT  --width W | --height H | --scale S | --fit WxH  [--filter nearest|bilinear|bicubic|lanczos]\n"
    "  crop       IN OUT  --x X --y Y --width W --height H\n"
    "  rotate     IN OUT  --degrees D        clockwise; multiples of 90 are lossless\n"
    "  flip       IN OUT  --horizontal | --vertical\n"
    "\n"
    "Tone and color\n"
    "  adjust     IN OUT  [--brightness -1..1] [--contrast -1..1] [--gamma 0.1..10]\n"
    "                     [--saturation -1..1] [--hue DEG] [--temperature -1..1]\n"
    "  effect     IN OUT  grayscale | invert | sepia [AMOUNT] | threshold [LEVEL]\n"
    "                     | levels [CLIP%] | equalize | posterize [LEVELS]\n"
    "\n"
    "Filters\n"
    "  filter     IN OUT  blur [SIGMA] | sharpen [SIGMA] [AMOUNT] | edges | emboss | median [RADIUS] | pixelate [SIZE]\n"
    "\n"
    "Colors\n"
    "  quantize   IN OUT  [--colors 2-256] [--dither none|floyd-steinberg|bayer]\n"
    "\n"
    "Inspect\n"
    "  info       IN\n"
    "  compare    A B  [--diff OUT] [--amplify K]\n"
    "\n"
    "Output formats follow the file extension (png, jpg, bmp, tga, pxs, txt); use '-' for stdin or\n"
    "stdout together with --format. Global options: -q/--quality Q (JPEG and PXS, default 85 / 75).\n";

typedef struct {
    const char *positional[8];
    int positional_count;
    const char *names[32];
    const char *values[32];
    int option_count;
} arguments;

static const char *const flags[] = {"444", "gray", "classic", "horizontal", "vertical", "help"};

static int is_flag(const char *name)
{
    for (size_t i = 0; i < sizeof flags / sizeof flags[0]; i++)
        if (!strcmp(name, flags[i]))
            return 1;
    return 0;
}

static int parse(int argc, char **argv, arguments *a)
{
    memset(a, 0, sizeof *a);
    for (int i = 0; i < argc; i++) {
        const char *s = argv[i];
        if (!strcmp(s, "-q"))
            s = "--quality";
        else if (!strcmp(s, "-h"))
            s = "--help";
        if (s[0] == '-' && s[1] == '-' && s[2]) {
            if (a->option_count == 32)
                return 0;
            const char *name = s + 2;
            a->names[a->option_count] = name;
            if (is_flag(name))
                a->values[a->option_count++] = "1";
            else if (i + 1 < argc)
                a->values[a->option_count++] = argv[++i];
            else {
                fprintf(stderr, "pixelsmith: option --%s needs a value\n", name);
                return 0;
            }
        } else if (a->positional_count < 8) {
            a->positional[a->positional_count++] = s;
        } else {
            return 0;
        }
    }
    return 1;
}

static const char *option(const arguments *a, const char *name)
{
    for (int i = a->option_count - 1; i >= 0; i--)
        if (!strcmp(a->names[i], name))
            return a->values[i];
    return NULL;
}

static int number(const arguments *a, const char *name, double fallback, double *value)
{
    const char *s = option(a, name);
    if (!s) {
        *value = fallback;
        return 1;
    }
    char *end;
    *value = strtod(s, &end);
    if (*end || end == s || !isfinite(*value)) {
        fprintf(stderr, "pixelsmith: --%s expects a number, got '%s'\n", name, s);
        return 0;
    }
    return 1;
}

static double positional_number(const arguments *a, int index, double fallback)
{
    if (index >= a->positional_count)
        return fallback;
    char *end;
    double v = strtod(a->positional[index], &end);
    return *end || end == a->positional[index] ? fallback : v;
}

static int fail(ps_status status, const char *what)
{
    fprintf(stderr, "pixelsmith: %s: %s\n", what, ps_status_string(status));
    return 1;
}

static ps_format output_format(const arguments *a, const char *path, ps_format fallback)
{
    const char *f = option(a, "format");
    ps_format format = f ? ps_format_from_name(f) : ps_format_from_name(path);
    return format == PS_FORMAT_UNKNOWN ? fallback : format;
}

static int save(const arguments *a, const ps_image *image, const char *path)
{
    double quality;
    ps_format format = output_format(a, path, PS_FORMAT_PNG);
    if (!number(a, "quality", format == PS_FORMAT_PXS ? 75 : 85, &quality))
        return 1;
    ps_status status = ps_save(image, path, format, (int)quality);
    return status == PS_OK ? 0 : fail(status, path);
}

static int command_compress(const arguments *a, const ps_image *in, const char *out_path)
{
    uint8_t *data = NULL;
    size_t size = 0;
    ps_status status;
    if (option(a, "classic") || output_format(a, out_path, PS_FORMAT_PXS) == PS_FORMAT_CLASSIC) {
        status = ps_classic_encode(in, (char **)&data, &size);
    } else {
        double quality;
        if (!number(a, "quality", 75, &quality))
            return 1;
        ps_pxs_options o = ps_pxs_defaults();
        o.quality = (int)quality;
        o.subsampling = option(a, "444") ? PS_SUBSAMPLE_444 : PS_SUBSAMPLE_420;
        o.grayscale = option(a, "gray") != NULL;
        status = ps_pxs_encode(in, &o, &data, &size);
    }
    if (status != PS_OK)
        return fail(status, "compress");
    status = ps_write_file(out_path, data, size);
    size_t raw = ps_image_size(in);
    if (status == PS_OK && strcmp(out_path, "-"))
        printf("%dx%d, %zu bytes raw -> %zu bytes (%.1f:1, %.3f bits per pixel)\n", in->width, in->height, raw, size,
               (double)raw / size, 8.0 * size / ((double)in->width * in->height));
    ps_free(data);
    return status == PS_OK ? 0 : fail(status, out_path);
}

static int command_resize(const arguments *a, const ps_image *in, ps_image *out)
{
    double width, height, scale;
    if (!number(a, "width", 0, &width) || !number(a, "height", 0, &height) || !number(a, "scale", 0, &scale))
        return 1;
    const char *fit = option(a, "fit");
    if (fit) {
        int fw, fh;
        if (sscanf(fit, "%dx%d", &fw, &fh) != 2 || fw <= 0 || fh <= 0) {
            fprintf(stderr, "pixelsmith: --fit expects WxH\n");
            return 1;
        }
        double s = fmin((double)fw / in->width, (double)fh / in->height);
        width = round(in->width * s);
        height = round(in->height * s);
    } else if (scale > 0) {
        width = round(in->width * scale);
        height = round(in->height * scale);
    } else if (width > 0 && height <= 0) {
        height = round(in->height * width / in->width);
    } else if (height > 0 && width <= 0) {
        width = round(in->width * height / in->height);
    }
    if (width < 1 || height < 1) {
        fprintf(stderr, "pixelsmith: resize needs --width, --height, --scale or --fit\n");
        return 1;
    }
    ps_filter filter = PS_FILTER_LANCZOS3;
    const char *name = option(a, "filter");
    if (name && !ps_filter_from_name(name, &filter)) {
        fprintf(stderr, "pixelsmith: unknown filter '%s'\n", name);
        return 1;
    }
    ps_status status = ps_resize(in, (int)width, (int)height, filter, out);
    return status == PS_OK ? 0 : fail(status, "resize");
}

static int command_effect(const arguments *a, ps_image *image)
{
    const char *name = a->positional_count > 3 ? a->positional[3] : "";
    ps_status status;
    if (!strcmp(name, "grayscale"))
        status = ps_grayscale(image);
    else if (!strcmp(name, "invert"))
        status = ps_invert(image);
    else if (!strcmp(name, "sepia"))
        status = ps_sepia(image, positional_number(a, 4, 1));
    else if (!strcmp(name, "threshold"))
        status = ps_threshold(image, (int)positional_number(a, 4, 128));
    else if (!strcmp(name, "levels"))
        status = ps_auto_levels(image, positional_number(a, 4, 0.5));
    else if (!strcmp(name, "equalize"))
        status = ps_equalize(image);
    else if (!strcmp(name, "posterize"))
        status = ps_posterize(image, (int)positional_number(a, 4, 4));
    else {
        fprintf(stderr, "pixelsmith: unknown effect '%s'\n", name);
        return 1;
    }
    return status == PS_OK ? 0 : fail(status, name);
}

static int command_filter(const arguments *a, const ps_image *in, ps_image *out)
{
    const char *name = a->positional_count > 3 ? a->positional[3] : "";
    ps_status status;
    if (!strcmp(name, "blur"))
        status = ps_blur(in, positional_number(a, 4, 2), out);
    else if (!strcmp(name, "sharpen"))
        status = ps_sharpen(in, positional_number(a, 4, 1), positional_number(a, 5, 1), out);
    else if (!strcmp(name, "edges"))
        status = ps_edges(in, out);
    else if (!strcmp(name, "emboss"))
        status = ps_emboss(in, out);
    else if (!strcmp(name, "median"))
        status = ps_median(in, (int)positional_number(a, 4, 1), out);
    else if (!strcmp(name, "pixelate"))
        status = ps_pixelate(in, (int)positional_number(a, 4, 8), out);
    else {
        fprintf(stderr, "pixelsmith: unknown filter '%s'\n", name);
        return 1;
    }
    return status == PS_OK ? 0 : fail(status, name);
}

static int command_info(const char *path)
{
    uint8_t *data;
    size_t size;
    ps_status status = ps_read_file(path, &data, &size);
    if (status != PS_OK)
        return fail(status, path);
    ps_image image;
    status = ps_decode(data, size, &image);
    if (status != PS_OK) {
        ps_free(data);
        return fail(status, path);
    }
    ps_format format = ps_format_sniff(data, size);
    printf("file       %s\n", path);
    printf("format     %s\n", format == PS_FORMAT_UNKNOWN ? "other (gif, tga, psd, pnm)" : ps_format_name(format));
    printf("size       %zu bytes\n", size);
    printf("dimensions %d x %d\n", image.width, image.height);
    printf("channels   %d (%s)\n", image.channels,
           (const char *[]){"", "gray", "gray + alpha", "RGB", "RGBA"}[image.channels]);
    printf("bits/pixel %.3f\n", 8.0 * size / ((double)image.width * image.height));
    if (format == PS_FORMAT_PXS) {
        ps_pxs_info info;
        if (ps_pxs_inspect(data, size, &info) == PS_OK)
            printf("pxs        quality %d, %s, header %zu bytes, payload %zu bytes\n", info.quality,
                   info.channels == 1 ? "gray" : info.subsampling ? "YCbCr 4:2:0" : "YCbCr 4:4:4", info.header_bytes,
                   info.payload_bytes);
    }
    uint32_t hist[4][256];
    ps_histogram(&image, hist);
    double total = (double)image.width * image.height, mean = 0;
    int lo = -1, hi = 0;
    for (int v = 0; v < 256; v++) {
        mean += v * (double)hist[3][v];
        if (hist[3][v]) {
            if (lo < 0)
                lo = v;
            hi = v;
        }
    }
    printf("luma       mean %.1f, range %d..%d\n", mean / total, lo, hi);
    ps_image_free(&image);
    ps_free(data);
    return 0;
}

static int command_compare(const arguments *a)
{
    if (a->positional_count < 3) {
        fputs(usage, stderr);
        return 2;
    }
    ps_image x, y;
    ps_status status = ps_load(a->positional[1], &x);
    if (status != PS_OK)
        return fail(status, a->positional[1]);
    status = ps_load(a->positional[2], &y);
    if (status != PS_OK) {
        ps_image_free(&x);
        return fail(status, a->positional[2]);
    }
    int result = 0;
    double psnr, mse, ssim;
    if ((status = ps_psnr(&x, &y, &psnr, &mse)) != PS_OK || (status = ps_ssim(&x, &y, &ssim)) != PS_OK) {
        result = fail(status, "compare (the images must have the same size)");
    } else {
        if (isinf(psnr))
            printf("PSNR inf dB (identical)\n");
        else
            printf("PSNR %.2f dB\n", psnr);
        printf("MSE  %.3f\nSSIM %.4f\n", mse, ssim);
        const char *diff = option(a, "diff");
        if (diff) {
            double amplify;
            ps_image d;
            if (!number(a, "amplify", 4, &amplify))
                result = 1;
            else if ((status = ps_difference(&x, &y, amplify, &d)) != PS_OK)
                result = fail(status, "difference");
            else {
                result = save(a, &d, diff);
                ps_image_free(&d);
            }
        }
    }
    ps_image_free(&x);
    ps_image_free(&y);
    return result;
}

int main(int argc, char **argv)
{
    arguments a;
    if (argc < 2 || !parse(argc - 1, argv + 1, &a) || option(&a, "help") || a.positional_count < 1) {
        fputs(usage, argc < 2 || (argc >= 2 && option(&a, "help")) ? stdout : stderr);
        return argc < 2 ? 0 : 2;
    }
    const char *command = a.positional[0];
    if (!strcmp(command, "help")) {
        fputs(usage, stdout);
        return 0;
    }
    if (!strcmp(command, "version")) {
        puts(PS_VERSION);
        return 0;
    }
    if (!strcmp(command, "compare"))
        return command_compare(&a);
    if (a.positional_count < 2) {
        fputs(usage, stderr);
        return 2;
    }
    if (!strcmp(command, "info"))
        return command_info(a.positional[1]);
    if (a.positional_count < 3) {
        fprintf(stderr, "pixelsmith: %s needs an input and an output\n", command);
        return 2;
    }
    const char *out_path = a.positional[2];
    ps_image in, out = {0};
    ps_status status = ps_load(a.positional[1], &in);
    if (status != PS_OK)
        return fail(status, a.positional[1]);

    int result = 0, write = 1;
    if (!strcmp(command, "compress")) {
        result = command_compress(&a, &in, out_path);
        write = 0;
    } else if (!strcmp(command, "decompress") || !strcmp(command, "convert")) {
        status = ps_image_copy(&in, &out);
        result = status == PS_OK ? 0 : fail(status, command);
    } else if (!strcmp(command, "resize")) {
        result = command_resize(&a, &in, &out);
    } else if (!strcmp(command, "crop")) {
        double x, y, w, h;
        if (!number(&a, "x", 0, &x) || !number(&a, "y", 0, &y) || !number(&a, "width", in.width - x, &w) ||
            !number(&a, "height", in.height - y, &h))
            result = 1;
        else if ((status = ps_crop(&in, (int)x, (int)y, (int)w, (int)h, &out)) != PS_OK)
            result = fail(status, "crop (is the rectangle inside the image?)");
    } else if (!strcmp(command, "rotate")) {
        double degrees;
        if (!number(&a, "degrees", 90, &degrees))
            result = 1;
        else if ((status = ps_rotate(&in, degrees, &out)) != PS_OK)
            result = fail(status, "rotate");
    } else if (!strcmp(command, "flip")) {
        if ((status = ps_flip(&in, option(&a, "vertical") == NULL, &out)) != PS_OK)
            result = fail(status, "flip");
    } else if (!strcmp(command, "adjust")) {
        ps_adjust_params p = ps_adjust_defaults();
        if (!number(&a, "brightness", 0, &p.brightness) || !number(&a, "contrast", 0, &p.contrast) ||
            !number(&a, "gamma", 1, &p.gamma) || !number(&a, "saturation", 0, &p.saturation) ||
            !number(&a, "hue", 0, &p.hue) || !number(&a, "temperature", 0, &p.temperature))
            result = 1;
        else if ((status = ps_adjust(&in, &p)) != PS_OK)
            result = fail(status, "adjust");
        out = in;
        in = (ps_image){0};
    } else if (!strcmp(command, "effect")) {
        result = command_effect(&a, &in);
        out = in;
        in = (ps_image){0};
    } else if (!strcmp(command, "filter")) {
        result = command_filter(&a, &in, &out);
    } else if (!strcmp(command, "quantize")) {
        double colors;
        ps_dither dither = PS_DITHER_FLOYD_STEINBERG;
        const char *name = option(&a, "dither");
        if (!number(&a, "colors", 16, &colors))
            result = 1;
        else if (name && !ps_dither_from_name(name, &dither)) {
            fprintf(stderr, "pixelsmith: unknown dither '%s'\n", name);
            result = 1;
        } else if ((status = ps_quantize(&in, (int)colors, dither, &out)) != PS_OK)
            result = fail(status, "quantize (colors must be 2-256)");
    } else {
        fprintf(stderr, "pixelsmith: unknown command '%s'\n\n%s", command, usage);
        result = 2;
        write = 0;
    }
    if (result == 0 && write)
        result = save(&a, &out, out_path);
    ps_image_free(&in);
    ps_image_free(&out);
    return result;
}
