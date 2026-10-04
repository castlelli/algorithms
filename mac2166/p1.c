
#include <stdio.h>
int somaDivProp(int N)
{
    int d;
    int soma;
    soma = 0;
    for (d = 1; d < N; d++)
    {
        if (N % d == 0)
        {
            soma += d;
        }
    }
    return soma;
}

int main()
{
    // Foi necessária uma correção aqui: a e b não foram declarados.
    int a, b;
    scanf("%d", &a, &b);
    int num;
    for (num = a; num < b; num++)
    {
        if (somaDivProp(num) == num)
        {
            printf("%d\n", num);
        }
    }
}
