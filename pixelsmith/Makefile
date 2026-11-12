# Pixelsmith build.
#   make            command-line tool (./pixelsmith)
#   make test       unit tests, with AddressSanitizer and UndefinedBehaviorSanitizer
#   make wasm       WebAssembly engine for the website (needs Emscripten's emcc)
#   make site-data  golden outputs for the website's verification section
#   make check-wasm rebuild the engine and fail if it differs from the committed one

CC      ?= cc
CFLAGS  ?= -O2
WARN     = -std=c11 -Wall -Wextra -Wpedantic -Wshadow -Wno-unused-function
INC      = -Iinclude -Ithird_party
LIBS     = -lm

SRC      = src/image.c src/io.c src/dct.c src/codec.c src/classic.c src/resample.c \
           src/geometry.c src/adjust.c src/filter.c src/quantize.c src/metrics.c
HDR      = include/pixelsmith.h
SITE     = ../docs/pixelsmith
ENGINE   = $(SITE)/engine

SANITIZE = -O1 -g -fsanitize=address,undefined -fno-omit-frame-pointer -fno-sanitize-recover=all

EXPORTS  = $(shell grep '^PS_EXPORT' src/wasm.c | grep -o 'ps_wasm_[a-z0-9_]*' | grep -vx ps_wasm_result | sed 's/^/_/' | paste -sd, -)

.PHONY: all test wasm check-wasm site-data clean

all: pixelsmith

pixelsmith: $(SRC) cli/pixelsmith.c $(HDR)
	$(CC) $(CFLAGS) $(WARN) $(INC) $(SRC) cli/pixelsmith.c -o $@ $(LIBS)

build/test_runner: $(SRC) tests/tests.c tests/test.h $(HDR)
	@mkdir -p build
	$(CC) $(SANITIZE) $(WARN) $(INC) -Itests $(SRC) tests/tests.c -o $@ $(LIBS)

test: build/test_runner pixelsmith
	./build/test_runner tests/fixtures
	./tests/cli.sh ./pixelsmith tests/fixtures

wasm: $(SRC) src/wasm.c $(HDR)
	@mkdir -p $(ENGINE)
	emcc -O3 -std=c11 $(INC) $(SRC) src/wasm.c -o $(ENGINE)/pixelsmith.js \
	  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createEngine -sENVIRONMENT=web,worker \
	  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=1MB -sFILESYSTEM=0 \
	  -sEXPORTED_FUNCTIONS=_malloc,_free,$(EXPORTS) \
	  -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32,HEAPU32,HEAPF64 \
	  -sINCOMING_MODULE_JS_API=locateFile -fno-ident

check-wasm:
	@cp $(ENGINE)/pixelsmith.wasm build/committed.wasm 2>/dev/null || (mkdir -p build && cp $(ENGINE)/pixelsmith.wasm build/committed.wasm)
	@cp $(ENGINE)/pixelsmith.js build/committed.js
	$(MAKE) wasm
	cmp build/committed.wasm $(ENGINE)/pixelsmith.wasm
	cmp build/committed.js $(ENGINE)/pixelsmith.js
	@echo "engine is up to date"

site-data: tools/golden.c src/wasm.c $(SRC) $(HDR)
	@mkdir -p build $(SITE)/data/fixtures
	$(CC) $(CFLAGS) $(WARN) $(INC) $(SRC) src/wasm.c tools/golden.c -o build/golden $(LIBS)
	./build/golden tests/fixtures $(SITE)/data/checks.json
	cp tests/fixtures/*.png tests/fixtures/*.classic.txt $(SITE)/data/fixtures/

clean:
	rm -rf build pixelsmith
