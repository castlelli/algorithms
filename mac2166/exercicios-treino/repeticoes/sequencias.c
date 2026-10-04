/*Dados n e n seqüências de números inteiros não-nulos, 
cada qual seguida por um 0, calcular a soma dos números pares de cada seqüência.*/ 

#include <stdio.h>

int main() {
    int n, i, j, soma, p;
    soma = 0;
    printf("Insira o numero n de sequencias: ");
    scanf("%d", &n);

    for (i = 1; i<= n; i++) {
        printf("\n\nDigite a sequencia (termina em 0): ");
        do {
            scanf ("%d", &p);
            if (p % 2 == 0) {
                soma += p;
            }
        } while (p != 0);
        printf ("Soma dos pares da sequencia %d = %d\n", i, soma);
        soma = 0;
    }
    
}