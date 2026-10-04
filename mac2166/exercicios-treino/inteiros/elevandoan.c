//Dados um inteiro x e um inteiro não-negativo n, calcular x^n.
#include <stdio.h>

int main(){
    int n, x, resultado, i;
    do {
        printf("Digite um numero inteiro x: ");
        scanf("%d", &x);
        if(x != (int)x) {
            printf("\nO numero deve ser inteiro, sem virgulas!\n");
        }
    } while (x != (int)x);

        do {
        printf("\nDigite um numero inteiro nao-negativo n: ");
        scanf("%d", &n);
        if(n != (int)n || n < 0) {
            printf("\nO numero deve ser inteiro e positivo!\n");
        }
    } while (n != (int)n || n < 0);
    if (n == 0) {
        printf("\nQualquer numero elevado a 0 = 1");
        return 0;
    }
    resultado = x;
    for (i = 2; i <= n; i++) {
        resultado *= x;
    }
    printf("%d elevado a %d = %d\n", x,n,resultado);
    
}