//Dada uma seqüência de números inteiros não-nulos, seguida por 0, imprimir seus quadrados.
#include <stdio.h>

int main() {
    int num;
    int cont = 0;
    int i; 
    int quadrados[1000];

    printf("Digite uma sequencia de numeros inteiros nao-nulos (termina em 0):\n");

    do {
        scanf("%d", &num);
        if (num != 0) {
            if (cont < 1000) {
                quadrados[cont] = num * num;
                cont++;
            }
        }
    } while (num != 0);

    printf("Quadrados dos numeros digitados:\n");
    
    for (i = 0; i < cont; i++) {
        printf("%d\n", quadrados[i]);
    }

    return 0;
}