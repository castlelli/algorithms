#include <stdio.h>

int main() {
    int n, i, fatorial;
    printf("Insira um numero inteiro n: ");
    scanf("%d", &n);
    fatorial = n;

    for (i = (n-1); i > 0; i--){
        fatorial *= i;
    }
    printf("\n\nO fatorial de %d eh: %d\n", n, fatorial);
}