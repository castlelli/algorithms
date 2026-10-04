//Dado um número inteiro positivo n, calcular a soma dos n primeiros números inteiros positivos.

#include <stdio.h>

int main(){
    int n;
    int soma = 0;
    int i;
    printf("Digite um numero inteiro positivo: ");
    scanf("%d", &n);
    for (i = 1; i<= n; i++){
        soma += i;
    }
    printf("A soma dos %d primeiros numeros inteiros positivos eh: %d\n", n, soma);
    return 0;
}