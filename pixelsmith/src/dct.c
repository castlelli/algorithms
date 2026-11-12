/* The 8x8 discrete cosine transform. The arithmetic (basis, summation order) is the same as in the
   original compressor, so the classic format reproduces its output bit for bit. */
#include "pixelsmith.h"

#include <math.h>

#define PS_PI 3.14159265358979323846

const uint8_t ps_zigzag[64] = {
    0,  1,  8,  16, 9,  2,  3,  10, 17, 24, 32, 25, 18, 11, 4,  5,  12, 19, 26, 33, 40, 48,
    41, 34, 27, 20, 13, 6,  7,  14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23,
    30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63};

void ps_dct_basis(double basis[8][8])
{
    for (int k = 0; k < 8; k++) {
        double norm = k == 0 ? sqrt(8) : sqrt(8 / 2.0);
        for (int n = 0; n < 8; n++)
            basis[k][n] = cos(k * PS_PI / 8 * (n + 0.5)) / norm;
    }
}

/* out = B * in * B^T, rows first. */
void ps_dct8(double basis[8][8], double in[8][8], double out[8][8])
{
    double rows[8][8];
    for (int r = 0; r < 8; r++)
        for (int v = 0; v < 8; v++) {
            double sum = 0;
            for (int c = 0; c < 8; c++)
                sum += in[r][c] * basis[v][c];
            rows[r][v] = sum;
        }
    for (int u = 0; u < 8; u++)
        for (int v = 0; v < 8; v++) {
            double sum = 0;
            for (int r = 0; r < 8; r++)
                sum += basis[u][r] * rows[r][v];
            out[u][v] = sum;
        }
}

/* out = B^T * in * B. */
void ps_idct8(double basis[8][8], double in[8][8], double out[8][8])
{
    double rows[8][8];
    for (int u = 0; u < 8; u++)
        for (int c = 0; c < 8; c++) {
            double sum = 0;
            for (int v = 0; v < 8; v++)
                sum += in[u][v] * basis[v][c];
            rows[u][c] = sum;
        }
    for (int r = 0; r < 8; r++)
        for (int c = 0; c < 8; c++) {
            double sum = 0;
            for (int u = 0; u < 8; u++)
                sum += basis[u][r] * rows[u][c];
            out[r][c] = sum;
        }
}
