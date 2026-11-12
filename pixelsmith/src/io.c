#include "pixelsmith.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STBI_NO_STDIO
#define STBI_NO_HDR
#define STBI_NO_LINEAR
#define STBI_MAX_DIMENSIONS (1 << 16)
#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_STATIC
#include "stb_image.h"

/* stb_image_write's own deflate is simple; sdefl (public domain / MIT) gives PNGs about 30% smaller. */
#define SDEFL_IMPLEMENTATION
#include "sdefl.h"

static unsigned char *zlib_compress(unsigned char *data, int size, int *out_size, int quality)
{
    (void)quality;
    *out_size = 0;
    struct sdefl *state = calloc(1, sizeof *state);
    unsigned char *out = malloc((size_t)sdefl_bound(size) + 16);
    if (!state || !out) {
        free(state);
        free(out);
        return NULL;
    }
    *out_size = zsdeflate(state, out, data, size, SDEFL_LVL_MAX);
    free(state);
    return out;
}

#define STBIW_ZLIB_COMPRESS zlib_compress
#define STBI_WRITE_NO_STDIO
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STB_IMAGE_WRITE_STATIC
#include "stb_image_write.h"

static const char *const format_names[] = {"unknown", "png", "jpeg", "bmp", "tga", "pxs", "classic"};
static const char *const format_extensions[] = {"", "png", "jpg", "bmp", "tga", "pxs", "txt"};

const char *ps_format_name(ps_format format)
{
    return format >= PS_FORMAT_UNKNOWN && format <= PS_FORMAT_CLASSIC ? format_names[format] : "unknown";
}

const char *ps_format_extension(ps_format format)
{
    return format >= PS_FORMAT_UNKNOWN && format <= PS_FORMAT_CLASSIC ? format_extensions[format] : "";
}

static int equals_ignore_case(const char *a, const char *b)
{
    while (*a && *b && tolower((unsigned char)*a) == tolower((unsigned char)*b)) {
        a++;
        b++;
    }
    return *a == 0 && *b == 0;
}

ps_format ps_format_from_name(const char *name_or_path)
{
    if (!name_or_path)
        return PS_FORMAT_UNKNOWN;
    const char *dot = strrchr(name_or_path, '.');
    const char *name = dot ? dot + 1 : name_or_path;
    static const struct {
        const char *name;
        ps_format format;
    } table[] = {{"png", PS_FORMAT_PNG},   {"jpg", PS_FORMAT_JPEG}, {"jpeg", PS_FORMAT_JPEG},
                 {"bmp", PS_FORMAT_BMP},   {"tga", PS_FORMAT_TGA},  {"pxs", PS_FORMAT_PXS},
                 {"txt", PS_FORMAT_CLASSIC}, {"classic", PS_FORMAT_CLASSIC}};
    for (size_t i = 0; i < sizeof table / sizeof table[0]; i++)
        if (equals_ignore_case(name, table[i].name))
            return table[i].format;
    return PS_FORMAT_UNKNOWN;
}

/* The classic format starts with two positive integers, the width and the height. */
static int looks_classic(const uint8_t *data, size_t size)
{
    size_t i = 0;
    int numbers = 0;
    while (i < size && i < 64 && numbers < 2) {
        while (i < size && isspace(data[i]))
            i++;
        size_t start = i;
        while (i < size && isdigit(data[i]))
            i++;
        if (i == start || (i < size && !isspace(data[i])))
            return 0;
        numbers++;
    }
    return numbers == 2;
}

ps_format ps_format_sniff(const uint8_t *data, size_t size)
{
    if (!data || size < 4)
        return PS_FORMAT_UNKNOWN;
    if (!memcmp(data, "PXS1", 4))
        return PS_FORMAT_PXS;
    if (size >= 8 && !memcmp(data, "\x89PNG\r\n\x1a\n", 8))
        return PS_FORMAT_PNG;
    if (data[0] == 0xFF && data[1] == 0xD8)
        return PS_FORMAT_JPEG;
    if (data[0] == 'B' && data[1] == 'M')
        return PS_FORMAT_BMP;
    if (looks_classic(data, size))
        return PS_FORMAT_CLASSIC;
    return PS_FORMAT_UNKNOWN;
}

ps_status ps_decode(const uint8_t *data, size_t size, ps_image *out)
{
    if (!out)
        return PS_ERR_ARG;
    memset(out, 0, sizeof *out);
    if (!data || size == 0 || size > 0x7fffffff)
        return PS_ERR_ARG;
    ps_format format = ps_format_sniff(data, size);
    if (format == PS_FORMAT_PXS)
        return ps_pxs_decode(data, size, out);
    if (format == PS_FORMAT_CLASSIC)
        return ps_classic_decode((const char *)data, size, out);
    int width, height, channels;
    if (!stbi_info_from_memory(data, (int)size, &width, &height, &channels) || channels < 1 || channels > 4)
        return PS_ERR_DECODE;
    stbi_uc *pixels = stbi_load_from_memory(data, (int)size, &width, &height, &channels, channels);
    if (!pixels)
        return PS_ERR_DECODE;
    if ((double)width * height > (1 << 28)) {
        stbi_image_free(pixels);
        return PS_ERR_DECODE;
    }
    out->width = width;
    out->height = height;
    out->channels = channels;
    out->data = pixels; /* stb_image uses malloc, so ps_image_free can release it */
    return PS_OK;
}

typedef struct {
    uint8_t *data;
    size_t size, capacity;
    int failed;
} buffer;

static void buffer_write(void *context, void *bytes, int count)
{
    buffer *b = context;
    if (b->failed || count <= 0)
        return;
    if (b->size + (size_t)count > b->capacity) {
        size_t capacity = b->capacity ? b->capacity : 4096;
        while (capacity < b->size + (size_t)count)
            capacity *= 2;
        uint8_t *grown = realloc(b->data, capacity);
        if (!grown) {
            b->failed = 1;
            return;
        }
        b->data = grown;
        b->capacity = capacity;
    }
    memcpy(b->data + b->size, bytes, (size_t)count);
    b->size += (size_t)count;
}

ps_status ps_encode(const ps_image *image, ps_format format, int quality, uint8_t **data, size_t *size)
{
    if (!image || !image->data || !data || !size)
        return PS_ERR_ARG;
    *data = NULL;
    *size = 0;
    if (quality < 1)
        quality = 1;
    if (quality > 100)
        quality = 100;
    if (format == PS_FORMAT_PXS) {
        ps_pxs_options options = ps_pxs_defaults();
        options.quality = quality;
        options.grayscale = image->channels < 3;
        return ps_pxs_encode(image, &options, data, size);
    }
    if (format == PS_FORMAT_CLASSIC)
        return ps_classic_encode(image, (char **)data, size);

    buffer b = {0};
    int ok = 0, w = image->width, h = image->height, c = image->channels;
    switch (format) {
    case PS_FORMAT_PNG:
        ok = stbi_write_png_to_func(buffer_write, &b, w, h, c, image->data, w * c);
        break;
    case PS_FORMAT_JPEG: {
        /* JPEG has no alpha: composite over white first. */
        ps_image flat = {0};
        const ps_image *source = image;
        if (ps_has_alpha(image)) {
            ps_status status = ps_image_convert(image, ps_color_channels(image), &flat);
            if (status != PS_OK)
                return status;
            source = &flat;
        }
        ok = stbi_write_jpg_to_func(buffer_write, &b, w, h, source->channels, source->data, quality);
        ps_image_free(&flat);
        break;
    }
    case PS_FORMAT_BMP: {
        /* BMP stores gray + alpha only as RGBA. */
        ps_image expanded = {0};
        const ps_image *source = image;
        if (c == 2) {
            ps_status status = ps_image_convert(image, 4, &expanded);
            if (status != PS_OK)
                return status;
            source = &expanded;
        }
        ok = stbi_write_bmp_to_func(buffer_write, &b, w, h, source->channels, source->data);
        ps_image_free(&expanded);
        break;
    }
    case PS_FORMAT_TGA:
        ok = stbi_write_tga_to_func(buffer_write, &b, w, h, c, image->data);
        break;
    default:
        return PS_ERR_ARG;
    }
    if (!ok || b.failed) {
        free(b.data);
        return b.failed ? PS_ERR_NOMEM : PS_ERR_ENCODE;
    }
    *data = b.data;
    *size = b.size;
    return PS_OK;
}

void ps_free(void *pointer)
{
    free(pointer);
}

ps_status ps_read_file(const char *path, uint8_t **data, size_t *size)
{
    *data = NULL;
    *size = 0;
    FILE *file = strcmp(path, "-") ? fopen(path, "rb") : stdin;
    if (!file)
        return PS_ERR_IO;
    buffer b = {0};
    uint8_t chunk[65536];
    size_t n;
    while ((n = fread(chunk, 1, sizeof chunk, file)) > 0)
        buffer_write(&b, chunk, (int)n);
    int error = ferror(file);
    if (file != stdin)
        fclose(file);
    if (error || b.failed) {
        free(b.data);
        return b.failed ? PS_ERR_NOMEM : PS_ERR_IO;
    }
    *data = b.data;
    *size = b.size;
    return PS_OK;
}

ps_status ps_write_file(const char *path, const uint8_t *data, size_t size)
{
    FILE *file = strcmp(path, "-") ? fopen(path, "wb") : stdout;
    if (!file)
        return PS_ERR_IO;
    size_t written = fwrite(data, 1, size, file);
    int failed = written != size;
    if (file != stdout)
        failed |= fclose(file) != 0;
    else
        failed |= fflush(file) != 0;
    return failed ? PS_ERR_IO : PS_OK;
}

ps_status ps_load(const char *path, ps_image *out)
{
    uint8_t *data;
    size_t size;
    memset(out, 0, sizeof *out);
    ps_status status = ps_read_file(path, &data, &size);
    if (status != PS_OK)
        return status;
    status = ps_decode(data, size, out);
    free(data);
    return status;
}

ps_status ps_save(const ps_image *image, const char *path, ps_format format, int quality)
{
    if (format == PS_FORMAT_UNKNOWN)
        format = ps_format_from_name(path);
    if (format == PS_FORMAT_UNKNOWN)
        format = PS_FORMAT_PNG;
    uint8_t *data;
    size_t size;
    ps_status status = ps_encode(image, format, quality, &data, &size);
    if (status != PS_OK)
        return status;
    status = ps_write_file(path, data, size);
    free(data);
    return status;
}
