/*Dizemos que um número natural é triangular se ele é produto de três números naturais consecutivos.

Exemplo: 120 é triangular, pois 4.5.6 = 120.

Dado um inteiro não-negativo n, verificar se n é triangular.*/

#include <stdio.h>

int main(){
    int n, i, t;
    printf("Insira um numero para testar se ele eh triangular: ");
    scanf("%d", &n);

    for (i = 1; (i*(i+1)*(i+2)) <= n; i++) {
        t = i*(i+1)*(i+2);
        if (t == n) {
            printf("O numero %d eh triangular, pois %d * %d * %d = %d\n",
            n, i, i+1, i+2, t);
            return 0;
        }
    } 
    printf("O numero %d nao eh triangular.\n", n);

}