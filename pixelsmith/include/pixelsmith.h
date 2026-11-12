/*
 * Pixelsmith: free, open-source image tools in C.
 *
 * Every image is a tightly packed array of 8-bit samples, row by row, with 1 (gray),
 * 2 (gray + alpha), 3 (RGB) or 4 (RGBA) channels. Functions return a ps_status. Functions
 * that create an image write it to an output parameter that the caller later releases with
 * ps_image_free. On failure the output is left empty ({0}), so freeing it is always safe.
 *
 * MIT License. See LICENSE at the repository root.
 */
#ifndef PIXELSMITH_H
#define PIXELSMITH_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define PS_VERSION "1.0.0"

typedef enum {
    PS_OK = 0,
    PS_ERR_NOMEM,    /* allocation failed */
    PS_ERR_ARG,      /* invalid argument */
    PS_ERR_DECODE,   /* the input could not be decoded */
    PS_ERR_ENCODE,   /* the output could not be encoded */
    PS_ERR_FORMAT,   /* the input is not in the expected format, or is corrupt */
    PS_ERR_IO        /* a file could not be read or written */
} ps_status;

typedef struct {
    int width;
    int height;
    int channels;    /* 1..4 */
    uint8_t *data;   /* width * height * channels bytes */
} ps_image;

const char *ps_status_string(ps_status status);

/* ---------------------------------------------------------------- image.c */

ps_status ps_image_new(int width, int height, int channels, ps_image *out);
void ps_image_free(ps_image *image);
ps_status ps_image_copy(const ps_image *in, ps_image *out);
/* Converts between channel counts. Color to gray uses Rec. 601 luma, and removing alpha
   composites the image over white. */
ps_status ps_image_convert(const ps_image *in, int channels, ps_image *out);
size_t ps_image_size(const ps_image *image);
int ps_has_alpha(const ps_image *image);
int ps_color_channels(const ps_image *image); /* 1 or 3: the channels that are not alpha */
uint8_t ps_clamp_u8(double value);

/* ---------------------------------------------------------------- io.c */

typedef enum {
    PS_FORMAT_UNKNOWN = 0,
    PS_FORMAT_PNG,
    PS_FORMAT_JPEG,
    PS_FORMAT_BMP,
    PS_FORMAT_TGA,
    PS_FORMAT_PXS,      /* Pixelsmith's DCT + Huffman container */
    PS_FORMAT_CLASSIC   /* the original text format of the DCT compressor */
} ps_format;

const char *ps_format_name(ps_format format);
const char *ps_format_extension(ps_format format);
ps_format ps_format_from_name(const char *name_or_path); /* "png", "photo.jpg", ... */
ps_format ps_format_sniff(const uint8_t *data, size_t size);

/* Decodes PNG, JPEG, BMP, GIF (first frame), TGA, PSD, PNM, PXS and classic text. */
ps_status ps_decode(const uint8_t *data, size_t size, ps_image *out);
/* Encodes to PNG, JPEG, BMP, TGA, PXS or classic text. quality (1..100) applies to JPEG and PXS. */
ps_status ps_encode(const ps_image *image, ps_format format, int quality, uint8_t **data, size_t *size);
void ps_free(void *pointer);

ps_status ps_read_file(const char *path, uint8_t **data, size_t *size);
ps_status ps_write_file(const char *path, const uint8_t *data, size_t size);
ps_status ps_load(const char *path, ps_image *out);
ps_status ps_save(const ps_image *image, const char *path, ps_format format, int quality);

/* ---------------------------------------------------------------- dct.c */

/* Orthonormal DCT-II basis: basis[k][n] = c(k) cos(k pi (n + 1/2) / 8). */
void ps_dct_basis(double basis[8][8]);
void ps_dct8(double basis[8][8], double in[8][8], double out[8][8]);
void ps_idct8(double basis[8][8], double in[8][8], double out[8][8]);
/* zigzag[i] = row * 8 + column of the i-th coefficient in zigzag order. */
extern const uint8_t ps_zigzag[64];

/* ---------------------------------------------------------------- codec.c */

#define PS_SUBSAMPLE_444 0
#define PS_SUBSAMPLE_420 1

typedef struct {
    int quality;      /* 1..100 */
    int subsampling;  /* PS_SUBSAMPLE_444 or PS_SUBSAMPLE_420 (color only) */
    int grayscale;    /* encode only the luma channel */
} ps_pxs_options;

ps_pxs_options ps_pxs_defaults(void);
/* Quantization table for a quality, in row-major order. chroma = 0 for luma. */
void ps_quant_table(int quality, int chroma, int table[64]);
ps_status ps_pxs_encode(const ps_image *image, const ps_pxs_options *options, uint8_t **data, size_t *size);
ps_status ps_pxs_decode(const uint8_t *data, size_t size, ps_image *out);

typedef struct {
    int width, height, channels, quality, subsampling;
    size_t header_bytes, payload_bytes;
    uint8_t code_lengths[4][256]; /* Huffman code length per symbol: luma DC, luma AC, chroma DC, chroma AC */
} ps_pxs_info;
ps_status ps_pxs_inspect(const uint8_t *data, size_t size, ps_pxs_info *info);

/* One 8x8 block through the codec, step by step (for teaching and inspection). */
typedef struct {
    double pixels[64];       /* level-shifted input (sample - 128) */
    double coefficients[64]; /* DCT */
    int quant[64];           /* quantization table */
    int quantized[64];       /* round(coefficient / quant) */
    int zigzag[64];          /* quantized values in zigzag order */
    double reconstructed[64];/* dequantized, inverse DCT, + 128, clamped */
    int symbol_count;
    int symbols[64][3];      /* AC symbols: zero run, size category, value. (0,0,0) is end of block, (15,0,0) is a run of 16 zeros */
} ps_block_trace;
void ps_block_analyze(const uint8_t pixels[64], int quality, int chroma, ps_block_trace *trace);

/* Keeps only the DCT frequencies where mask[row * 8 + column] != 0 in every 8x8 block. */
ps_status ps_dct_mask(const ps_image *in, const uint8_t mask[64], ps_image *out);

/* ---------------------------------------------------------------- classic.c */

/* The original format: "width height" then one line per 8x8 block of the luma channel, with the
   DC term followed by (zero run, value) pairs over the zigzag sequence. Fixed table, quality 50.
   Width and height are cut down to multiples of 8. */
ps_status ps_classic_encode(const ps_image *image, char **text, size_t *size);
ps_status ps_classic_decode(const char *text, size_t size, ps_image *out);

/* ---------------------------------------------------------------- resample.c */

typedef enum {
    PS_FILTER_NEAREST = 0,
    PS_FILTER_BILINEAR,
    PS_FILTER_BICUBIC,  /* Catmull-Rom */
    PS_FILTER_LANCZOS3
} ps_filter;

const char *ps_filter_name(ps_filter filter);
int ps_filter_from_name(const char *name, ps_filter *filter);
/* Separable resampling with area-correct support when shrinking. Color is filtered in linear
   light and alpha is premultiplied, so dark fringes and halos do not appear. */
ps_status ps_resize(const ps_image *in, int width, int height, ps_filter filter, ps_image *out);

/* ---------------------------------------------------------------- geometry.c */

ps_status ps_crop(const ps_image *in, int x, int y, int width, int height, ps_image *out);
ps_status ps_rotate90(const ps_image *in, int quarter_turns, ps_image *out); /* clockwise */
ps_status ps_flip(const ps_image *in, int horizontal, ps_image *out);
/* Rotates by any angle (degrees, clockwise) with bilinear sampling. The canvas grows to fit and the
   corners are filled with transparent pixels (an alpha channel is added if needed). */
ps_status ps_rotate(const ps_image *in, double degrees, ps_image *out);

/* ---------------------------------------------------------------- adjust.c (in place) */

typedef struct {
    double brightness;  /* -1..1, 0 = unchanged */
    double contrast;    /* -1..1, 0 = unchanged */
    double gamma;       /* 0.1..10, 1 = unchanged */
    double saturation;  /* -1..1, 0 = unchanged, -1 = gray */
    double hue;         /* degrees, 0 = unchanged */
    double temperature; /* -1..1, 0 = unchanged; positive is warmer */
} ps_adjust_params;

ps_adjust_params ps_adjust_defaults(void);
ps_status ps_adjust(ps_image *image, const ps_adjust_params *params);
ps_status ps_grayscale(ps_image *image);  /* keeps the channel count */
ps_status ps_invert(ps_image *image);
ps_status ps_sepia(ps_image *image, double amount);
ps_status ps_threshold(ps_image *image, int level);
ps_status ps_auto_levels(ps_image *image, double clip_percent);
ps_status ps_equalize(ps_image *image);   /* histogram equalization of luma, hue preserved */

/* ---------------------------------------------------------------- filter.c */

/* Square convolution kernel of odd size; out = sum(kernel * in) / divisor + bias. Edges are clamped. */
ps_status ps_convolve(const ps_image *in, const double *kernel, int size, double divisor, double bias, ps_image *out);
ps_status ps_blur(const ps_image *in, double sigma, ps_image *out);
ps_status ps_sharpen(const ps_image *in, double sigma, double amount, ps_image *out); /* unsharp mask */
ps_status ps_edges(const ps_image *in, ps_image *out);                               /* Sobel magnitude */
ps_status ps_emboss(const ps_image *in, ps_image *out);
ps_status ps_median(const ps_image *in, int radius, ps_image *out);
ps_status ps_pixelate(const ps_image *in, int block, ps_image *out);

/* ---------------------------------------------------------------- quantize.c */

typedef enum {
    PS_DITHER_NONE = 0,
    PS_DITHER_FLOYD_STEINBERG,
    PS_DITHER_BAYER
} ps_dither;

const char *ps_dither_name(ps_dither dither);
int ps_dither_from_name(const char *name, ps_dither *dither);
/* Median-cut palette of at most `colors` (2..256) RGB entries. Returns the size in *count. */
ps_status ps_palette_median_cut(const ps_image *in, int colors, uint8_t palette[256][3], int *count);
/* Maps every pixel to the palette. Alpha, if any, is kept. */
ps_status ps_remap(const ps_image *in, const uint8_t palette[][3], int count, ps_dither dither, ps_image *out);
ps_status ps_quantize(const ps_image *in, int colors, ps_dither dither, ps_image *out);
ps_status ps_posterize(ps_image *image, int levels);

/* ---------------------------------------------------------------- metrics.c */

/* hist[0..2] = R, G, B (or gray in all three), hist[3] = luma. */
ps_status ps_histogram(const ps_image *image, uint32_t hist[4][256]);
/* Both images must have the same size; they are compared as RGB over white. */
ps_status ps_psnr(const ps_image *a, const ps_image *b, double *psnr, double *mse);
ps_status ps_ssim(const ps_image *a, const ps_image *b, double *ssim);
ps_status ps_difference(const ps_image *a, const ps_image *b, double amplify, ps_image *out);

#ifdef __cplusplus
}
#endif

#endif
