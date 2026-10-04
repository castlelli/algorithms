//Dado um número inteiro positivo n, imprimir os n primeiros naturais ímpares.

#include <stdio.h>

int main(){
    int i, num, impar;

    do{
        printf("Digite um numero inteiro positivo: ");
        scanf("%d", &num);
        if(num <= 0) {
            printf("\nPositivo! Tente novamente.\n");
        }
    } while (num <= 0);
    
    printf("\n%d primeiros numeros impares inteiros: \n", num);
    impar = 1;
    for (i = 1; i <= num; i++){
        printf("%d\n", impar);
        impar+= 2;
    }

    return 0;
}