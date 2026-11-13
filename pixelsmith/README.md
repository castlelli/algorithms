# Pixelsmith

Free, open-source image tools written in C: a DCT image codec built from the 8×8 block up, plus
resizing, cropping, rotation, tone and color adjustments, filters, palette reduction with
dithering, and quality metrics. One small C11 library, one command-line tool, and the same code
compiled to WebAssembly for the website.

**Try it in your browser:** <https://castlelli.github.io/algorithms/pixelsmith/>. Everything runs
locally, and no image is uploaded.

## Build

To fetch only this folder, not the rest of the repository:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/castlelli/algorithms
cd algorithms
git sparse-checkout set pixelsmith
cd pixelsmith
```

Then:

```sh
make            # ./pixelsmith
make test       # unit tests and a CLI smoke test, with AddressSanitizer and UBSan
```

The only dependency is the C library (`-lm`). Image files are read and written with the
public-domain [stb](https://github.com/nothings/stb) headers, and PNGs are deflated with
[sdefl](https://github.com/vurtun/lib) (public domain / MIT). All three are vendored in
`third_party/`.

## Command line

```
pixelsmith compress   IN OUT.pxs [--quality 1-100] [--444] [--gray]
pixelsmith compress   IN OUT.txt --classic
pixelsmith decompress IN.pxs OUT.png
pixelsmith convert    IN OUT.{png,jpg,bmp,tga,pxs} [--quality Q]
pixelsmith resize     IN OUT --width W | --height H | --scale S | --fit WxH [--filter nearest|bilinear|bicubic|lanczos]
pixelsmith crop       IN OUT --x X --y Y --width W --height H
pixelsmith rotate     IN OUT --degrees D
pixelsmith flip       IN OUT --horizontal | --vertical
pixelsmith adjust     IN OUT [--brightness] [--contrast] [--gamma] [--saturation] [--hue] [--temperature]
pixelsmith effect     IN OUT grayscale | invert | sepia [A] | threshold [L] | levels [CLIP%] | equalize | posterize [N]
pixelsmith filter     IN OUT blur [SIGMA] | sharpen [SIGMA] [AMOUNT] | edges | emboss | median [R] | pixelate [N]
pixelsmith quantize   IN OUT [--colors 2-256] [--dither none|floyd-steinberg|bayer]
pixelsmith info       IN
pixelsmith compare    A B [--diff OUT] [--amplify K]
```

Inputs can be PNG, JPEG, BMP, GIF, TGA, PSD, PNM, PXS or classic text. The output format follows
the file extension.

## What is inside

| file | what it does |
|---|---|
| `src/dct.c` | orthonormal 8×8 DCT-II and its inverse, separable |
| `src/codec.c` | the PXS codec: YCbCr, 4:2:0 subsampling, quality-scaled tables, zigzag, run/size symbols, Huffman tables built per image |
| `src/classic.c` | the original text format, byte-compatible with the first version of the compressor |
| `src/resample.c` | nearest, bilinear, Catmull-Rom bicubic and Lanczos-3, filtered in linear light with premultiplied alpha |
| `src/geometry.c` | crop, lossless quarter turns and flips, any-angle rotation with transparent corners |
| `src/adjust.c` | brightness, contrast, gamma (one lookup table); hue and saturation (one 3×3 matrix); temperature, sepia, threshold, auto levels, histogram equalization |
| `src/filter.c` | generic convolution, separable Gaussian blur, unsharp mask, Sobel edges, emboss, median (sliding histogram), pixelate |
| `src/quantize.c` | median-cut palette; Floyd–Steinberg and ordered (Bayer 8×8) dithering |
| `src/metrics.c` | histogram, PSNR, MSE, SSIM, difference map |
| `src/io.c` | file formats, through stb |
| `src/wasm.c` | the interface the website calls |

The public API is in `include/pixelsmith.h`.

## The PXS format

All integers are little-endian.

| bytes | content |
|---|---|
| 4 | magic `PXS1` |
| 1 | version (1) |
| 1 | flags: bit 0 = chroma subsampled 4:2:0 |
| 1 | channels: 1 (gray) or 3 (YCbCr) |
| 1 | quality, 1–100 |
| 4 + 4 | width, height |
| 64 per table | quantization tables, luma then chroma, in zigzag order |
| 16 + n per table | Huffman tables (luma DC, luma AC, chroma DC, chroma AC): number of codes of each length 1–16, then the symbols in code order (canonical codes, as in JPEG) |
| 4 | payload size |
| … | payload: every Y block, then every Cb block, then every Cr block, in raster order; bits are packed most significant first |

Each block is coded as in baseline JPEG. The DC term is stored as its difference from the previous
block, written as a size category followed by raw bits. The AC terms in zigzag order are written as
one `(zero run << 4 | size)` symbol per nonzero value, with `0xF0` for sixteen zeros and `0x00`
for end of block. Quality 50 uses the original compressor's luminance table; other qualities scale
it with the IJG formula.

At equal quality the files are a little smaller than a baseline JPEG with fixed tables, because the
Huffman tables are fitted to each image.

## The classic format

This is the text format of the first version of the compressor. The first line is
`width height`, cut down to multiples of 8. Each following line is one 8×8 block of the luma
channel, quantized with a fixed table and read in diagonal order: the DC value first, then pairs of
`zero-run value`. `make test` checks that the output matches that program's files byte for byte,
in both directions.

## Website

The website is in `docs/pixelsmith/`. It is plain HTML, CSS and JavaScript modules, with no build
step. The C engine (`docs/pixelsmith/engine/`) is built with Emscripten 7.0.0:

```sh
make wasm        # rebuild the engine
make check-wasm  # fail if the committed engine differs from a fresh build
make site-data   # golden results for the website's verification section
```

The verification section runs the same engine calls in the browser and compares hashes with the
native build. All of them are bit-identical.

Sample photos come from the Kodak Lossless True Color Image Suite.

## License

MIT; see [LICENSE](../LICENSE).
