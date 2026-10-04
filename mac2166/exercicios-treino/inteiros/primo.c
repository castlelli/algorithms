//Verificar se um numero n é primo:

#include <stdio.h>

int main() {
    int n,i;
    printf("Insira um numero n para testar se eh primo: ");
    scanf("%d", &n);

    for (i = n-1; i > 1; i--){
        if (n % i == 0) {
            printf("\n%d nao eh primo\n", n);
            return 0;
        }
    }
    printf("\n%d eh primo\n", n);
    return 0;
}