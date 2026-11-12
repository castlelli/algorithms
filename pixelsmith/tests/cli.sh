#!/bin/sh
# Runs every command of the command-line tool once and checks the outputs decode.
# Usage: tests/cli.sh PIXELSMITH FIXTURES_DIR
set -eu
bin=$1
fixtures=$2
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
fail() { echo "FAIL cli: $*" >&2; exit 1; }
run() { "$bin" "$@" > "$out/log" 2>&1 || { cat "$out/log" >&2; fail "$*"; }; }
in="$fixtures/parrot.png"

run compress "$in" "$out/a.pxs" -q 60
run decompress "$out/a.pxs" "$out/a.png"
run compress "$in" "$out/b.pxs" --444 --gray
run compress "$in" "$out/c.txt" --classic
cmp -s "$out/c.txt" "$fixtures/parrot.classic.txt" || fail "classic output differs from the original program"
run decompress "$out/c.txt" "$out/c.png"
for f in png jpg bmp tga pxs; do run convert "$in" "$out/d.$f"; run info "$out/d.$f"; done
run resize "$in" "$out/e.png" --fit 50x50 --filter bicubic
run resize "$in" "$out/e2.png" --scale 2
run resize "$in" "$out/e3.png" --width 40
run crop "$in" "$out/f.png" --x 4 --y 4 --width 32 --height 16
run rotate "$in" "$out/g.png" --degrees 30
run rotate "$in" "$out/g2.png" --degrees 270
run flip "$in" "$out/h.png" --vertical
run adjust "$in" "$out/i.png" --brightness 0.1 --contrast 0.2 --gamma 1.2 --saturation 0.3 --hue 20 --temperature -0.2
for e in grayscale invert "sepia 0.8" "threshold 100" "levels 1" equalize "posterize 3"; do run effect "$in" "$out/j.png" $e; done
for f in "blur 1.5" "sharpen 1 2" edges emboss "median 2" "pixelate 6"; do run filter "$in" "$out/k.png" $f; done
run quantize "$in" "$out/l.png" --colors 6 --dither bayer
run compare "$in" "$out/a.png" --diff "$out/m.png"
grep -q PSNR "$out/log" || fail "compare prints PSNR"
"$bin" resize "$in" "$out/x.png" > /dev/null 2>&1 && fail "resize without a size must fail"
"$bin" frobnicate "$in" "$out/x.png" > /dev/null 2>&1 && fail "unknown command must fail"
"$bin" crop "$in" "$out/x.png" --x 90 --width 50 > /dev/null 2>&1 && fail "crop outside must fail"
"$bin" --help | grep -q usage || fail "help"
echo "ok   cli (all commands)"
