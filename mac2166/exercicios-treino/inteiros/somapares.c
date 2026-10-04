// Dados n e uma seqüência de n números inteiros, determinar a soma dos números pares.
#include <stdio.h>

int main(){
    int n,p,i,soma;
    soma = 0;
    i = 0; 
    p = 2;
    printf("Insira um numero n: ");
    scanf("%d", &n);
    if (n == 0) {
        printf("\nZero.");
    }
    else {
        for (i = 0; i<= n; i++){
            soma+= p;
            p+=2;
            i++;
        }
    } 
    printf("\n\nSoma dos %d primeiros pares: %d\n", n, soma);
    return 0;
}