/*Dado um número inteiro positivo n, determinar 
todos os inteiros entre 1 e n que são comprimento 
da hipotenusa de um triângulo retângulo com catetos inteiros.*/

#include<stdio.h>

int main() {
    int n, i, co, ca;
    printf("Digite o inteiro n maximo: ");
    scanf("%d", &n);

    printf("\nOs numeros entre 1 e n que sao hipotenusas sao: ");
    for (i = 1; i <= n; i++){
        for (co = 1; co < n; co++) {
            ca = co; //Evita repetição de duplas de cateto. Começando com o primeiro, não se repete.
            while ((ca*ca) + (co*co) < (i*i)) {
                ca++;
            }
                if ((ca*ca) + (co*co) == (i*i)) {
                    printf("\n%d", i);
                } 
        }
    }
}