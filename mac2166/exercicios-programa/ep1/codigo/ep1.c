/******************************************************************************
Ao preencher esse cabeçalho com o meu nome e o meu número USP, declaro que sou
o único autor e responsável por esse programa. Todas as partes originais desse
Exercício-Programa (EP) foram desenvolvidas e implementadas por mim seguindo
as instruções desse EP e que portanto não constituem desonestidade acadêmica
ou plágio.
Declaro também que sou responsável por todas as cópias desse programa e que eu
não distribuí ou facilitei a sua distribuição. Estou ciente que os casos de
plágio e desonestidade acadêmica serão tratados segundo os critérios
divulgados na página da disciplina.
Entendo que EPs sem assinatura não serão corrigidos e, ainda assim, poderão
ser punidos por desonestidade acadêmica.
Nome : VINICIUS CASTELLI
NUSP : 17864509
Turma: T01
Prof.: YOSHI
******************************************************************************/
/*
Comando para rodar o programa: 
gcc -std=c99 -Wall -pedantic ep1.c -o ep1

    //Quando scanf(%d %d %d) != 0, parou tudo.
    /*Fluxo de dados:


    Recebe um, veja se é o mesmo piloto que o primeiro (guarda numa variável, true ou false)
    Se for o mesmo piloto e i for melhor que o primeiro, ele substitui o primeiro e só.
    Se for o mesmo piloto e i não for melhor que o primeiro, nada acontece.(Permanece a tentativa mais antiga)
    --------
    Se não for o mesmo piloto e i for melhor que o primeiro, i vira o primeiro, o primeiro vira o segundo.
    Se não for o mesmo piloto e i não for melhor que o primeiro, vamos comparar com o segundo:
        --------
        Sendo ou não o mesmo piloto, se i for melhor que o segundo, ele substitui o segundo.
    
    */
#include <stdio.h>

int compara_tempos(int t1, int t2) {
    
    if (t1 > t2) return 1;
    if (t1 < t2) return -1;
    return 0;
}

int compara_voltas(int v1, int v2) {
    if (v1 > v2) return 1;
    if (v1 < v2) return -1;
    return 0;
}

int compara_melhor(int n1, int n2, int t1, int v1, int t2, int v2) {
    int comparacao_tempos = compara_tempos(t1, t2);
    if (comparacao_tempos == -1 || comparacao_tempos == 1) {
        return comparacao_tempos;
    }
    int comparacao_voltas = compara_voltas(v1, v2);
    if (comparacao_voltas == -1 || comparacao_voltas == 1) {
        return comparacao_voltas;
    }
    return n1 > n2 ? 1 : (n1 < n2 ? -1 : 0);
}

void substitui(int *alvo_n, int *alvo_t, int *alvo_v, int n, int t, int v) {
    *alvo_n = n;
    *alvo_t = t;
    *alvo_v = v;
}

void imprime_tempo(int posicao, int n, int t, int v) {
    int min = t / 60000;
    int seg = (t % 60000) / 1000;
    int ms = t % 1000;

    if (posicao == 1) {
        printf("Pole position: ");
    } else {
        printf("Segundo lugar: ");
    }

    printf("Piloto %d, com tempo de ", n);
    
    if (min == 1) printf("%d minuto", min);
    else printf("%d minutos", min);
    
    printf(", ");
    
    if (seg == 1) printf("%d segundo", seg);
    else printf("%d segundos", seg);
    
    printf(" e ");
    
    if (ms == 1) printf("%d milissegundo", ms);
    else printf("%d milissegundos", ms);
    
    printf(" (tentativa %d).\n", v);
}

int main() {
    int n1 = -1, t1 = -1, v1 = -1;
    int n2 = -1, t2 = -1, v2 = -1;
    int i_n, i_v, i_t;

    while (scanf("%d %d %d", &i_n, &i_v, &i_t) == 3) {
        if (t1 == -1) {
            substitui(&n1, &t1, &v1, i_n, i_t, i_v);
        } else if (i_n == n1) {
            if (compara_melhor(i_n, n1, i_t, i_v, t1, v1) == -1) {
                substitui(&n1, &t1, &v1, i_n, i_t, i_v);
            }
        } else if (compara_melhor(i_n, n1, i_t, i_v, t1, v1) == -1) {
            substitui(&n2, &t2, &v2, n1, t1, v1);
            substitui(&n1, &t1, &v1, i_n, i_t, i_v);
        } else if (t2 == -1) {
            substitui(&n2, &t2, &v2, i_n, i_t, i_v);
        } else if (i_n == n2) {
            if (compara_melhor(i_n, n2, i_t, i_v, t2, v2) == -1) {
                substitui(&n2, &t2, &v2, i_n, i_t, i_v);
            }
        } else if (compara_melhor(i_n, n2, i_t, i_v, t2, v2) == -1) {
            substitui(&n2, &t2, &v2, i_n, i_t, i_v);
        }
    }
    if (t1 != -1) imprime_tempo(1, n1, t1, v1);
    if (t2 != -1) imprime_tempo(2, n2, t2, v2);

    return 0;
}