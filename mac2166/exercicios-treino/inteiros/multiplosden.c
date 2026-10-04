//Dados n e dois números inteiros positivos i e j diferentes de 0, imprimir em ordem crescente os n primeiros naturais que são múltiplos de i ou de j e ou de ambos.
#include <stdio.h>
int main(){
    int n, i, j, contador, m;
    m = 0;
    printf("Digite o numero n de multiplos: ");
    scanf("%d", &n);
    printf("\nDigite os divisores i e j: ");
    scanf("%d", &i); scanf("%d", &j);
    
    printf("\nOs %d primeiros multiplos de %d e/ou %d sao: ", n, i,j);
    for (contador = 0; contador <= n; contador++) {
            if (m % i == 0 || m % j == 0){
                printf(" %d", m);
            }
            m++;
        }
    }