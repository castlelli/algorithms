#include <stdio.h>

#DEFINE TRUE 1;
#DEFINE FALSE 0;

double EQM(int n, double x[n], double y[n], double a, double b)
{
    double av = 0;
    int i;
    double diff;

    for (i = 0; i < n; i++)
    {
        diff += (y[i] - (a + (b * x[i])));
        av = diff * diff;
    }
    return av / n;
}

int menorEQM(int n, double x[n], double y[n], double a, double b, double eps)
{
    double av = EQM(n, x, y, a, b);

    return (av <= EQM(n, x, y, (a + eps), b) &&
            av <= EQM(n, x, y, (a - eps), b) &&
            av <= EQM(n, x, y, a, (b + eps)) &&
            av <= EQM(n, x, y, a, (b - eps))) == TRUE;
}