/* A tiny test harness: CHECK records a failure and keeps going; RUN reports per test. */
#ifndef PIXELSMITH_TEST_H
#define PIXELSMITH_TEST_H

#include <stdio.h>

static int test_failures, test_checks;

#define CHECK(condition)                                                                                 \
    do {                                                                                                 \
        test_checks++;                                                                                   \
        if (!(condition)) {                                                                              \
            test_failures++;                                                                             \
            fprintf(stderr, "  FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition);                    \
        }                                                                                                \
    } while (0)

#define CHECK_OK(expression) CHECK((expression) == PS_OK)

#define RUN(test)                                                                                        \
    do {                                                                                                 \
        int before = test_failures;                                                                      \
        test();                                                                                          \
        printf("%s %s\n", test_failures == before ? "ok  " : "FAIL", #test);                          \
    } while (0)

#endif
