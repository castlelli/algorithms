#include <stdio.h>
#include <math.h>
double sen(double x, double eps)
{
    int indice = 1;
    double somaSeno = 0;
    double fatorial = 1;
    double termo;
    int iFor;
    do
    {
        for (iFor = indice; iFor > 0; iFor--)
        {
            fatorial *= iFor;
        }
        termo = pow(x, indice) / fatorial;
        somaSeno += termo;
        fatorial = 1;
        indice += 2;
    } while (fabs(termo) > eps);
    return somaSeno;
}

double senElegante(double x, double eps)
{
    double termo = x;
    double somaSeno = x;
    double n = 1;
    while (fabs(termo) > eps)
    {
        n += 2;
        termo = termo * (pow(x, 2)) / (n * (n - 1));
        somaSeno += termo;
    }
    return somaSeno;
}

int main()
{
    double x, eps;
    scanf("%lf %lf", &x, &eps);
    printf("%f", senElegante(x, eps));
    return 0;
}