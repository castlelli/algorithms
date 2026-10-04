#include <stdio.h>
#include <string.h>

#define MAX 68
#define AREACOLISOES 8
#define TOTALPOSICOES (MAX + AREACOLISOES)
#define TOTALRESERVADAS 32
#define POSICAOINVALIDA (-1)

#define PESOPRIMEIRO 9
#define PESOULTIMO 9
#define PESOCOMPRIMENTO 2

char *palavrasReservadas[TOTALPOSICOES];

int espalha(char *palavra);
void iniciaTabela(void);
int insereReservada(char *palavra, int *proximaLivreColisao);
int montaTabela(char *reservadas[], int totalPalavras);
int contaColisoes(char *reservadas[], int totalPalavras);
int buscaPalavra(char *palavra);
void imprimeTabela(void);
void testaPalavra(char *palavra);

int espalha(char *palavra)
{
    int comprimento, primeiro, ultimo;
    comprimento = (int)strlen(palavra);
    if (comprimento == 0)
        return 0;
    primeiro = (unsigned char)palavra[0];
    ultimo = (unsigned char)palavra[comprimento - 1];
    return (PESOPRIMEIRO * primeiro + PESOULTIMO * ultimo + PESOCOMPRIMENTO * comprimento) % MAX;
}

void iniciaTabela(void)
{
    int i;
    for (i = 0; i < TOTALPOSICOES; i++)
        palavrasReservadas[i] = NULL;
}

int insereReservada(char *palavra, int *proximaLivreColisao)
{
    int posicao;
    posicao = espalha(palavra);
    if (palavrasReservadas[posicao] == NULL)
    {
        palavrasReservadas[posicao] = palavra;
        return posicao;
    }
    if (*proximaLivreColisao >= TOTALPOSICOES)
        return POSICAOINVALIDA;
    posicao = *proximaLivreColisao;
    palavrasReservadas[posicao] = palavra;
    (*proximaLivreColisao)++;
    return posicao;
}

int montaTabela(char *reservadas[], int totalPalavras)
{
    int i, posicao, proximaLivreColisao, realocadas;
    iniciaTabela();
    proximaLivreColisao = MAX;
    realocadas = 0;
    for (i = 0; i < totalPalavras; i++)
    {
        posicao = insereReservada(reservadas[i], &proximaLivreColisao);
        if (posicao == POSICAOINVALIDA)
            printf("Erro: area de colisoes esgotada para \"%s\"\n", reservadas[i]);
        else if (posicao >= MAX)
            realocadas++;
    }
    return realocadas;
}

int contaColisoes(char *reservadas[], int totalPalavras)
{
    int ocupacoes[MAX];
    int i, posicao, colisoes;
    for (i = 0; i < MAX; i++)
        ocupacoes[i] = 0;
    colisoes = 0;
    for (i = 0; i < totalPalavras; i++)
    {
        posicao = espalha(reservadas[i]);
        if (ocupacoes[posicao] > 0)
            colisoes++;
        ocupacoes[posicao]++;
    }
    return colisoes;
}

int buscaPalavra(char *palavra)
{
    int posicao, i;
    posicao = espalha(palavra);
    if (palavrasReservadas[posicao] != NULL && strcmp(palavrasReservadas[posicao], palavra) == 0)
        return posicao;
    for (i = MAX; i < TOTALPOSICOES; i++)
    {
        if (palavrasReservadas[i] == NULL)
            return POSICAOINVALIDA;
        if (strcmp(palavrasReservadas[i], palavra) == 0)
            return i;
    }
    return POSICAOINVALIDA;
}

void imprimeTabela(void)
{
    int i, ocupadas;
    ocupadas = 0;
    for (i = 0; i < TOTALPOSICOES; i++)
    {
        if (palavrasReservadas[i] != NULL)
        {
            printf(" %3d : %s\n", i, palavrasReservadas[i]);
            ocupadas++;
        }
    }
    printf("Posicoes ocupadas: %d de %d\n", ocupadas, TOTALPOSICOES);
}

void testaPalavra(char *palavra)
{
    int posicao;
    posicao = buscaPalavra(palavra);
    if (posicao == POSICAOINVALIDA)
        printf(" %-10s espalha para %3d : NAO e' palavra reservada\n", palavra, espalha(palavra));
    else
        printf(" %-10s espalha para %3d : E' palavra reservada, esta em palavrasReservadas[%d]\n",
               palavra, espalha(palavra), posicao);
}

int main(void)
{
    char *reservadas[TOTALRESERVADAS] = {
        "auto", "break", "case", "char", "const", "continue", "default", "do",
        "double", "else", "enum", "extern", "float", "for", "goto", "if",
        "int", "long", "register", "return", "short", "signed", "sizeof", "static",
        "struct", "switch", "typedef", "union", "unsigned", "void", "volatile", "while"};
    char *testes[] = {
        "while", "whil", "elsee", "xyz", "auto", "volatile", "do", "For", "sizeof", "zz"};
    int totalTestes = 10;
    int colisoes, realocadas, i;

    colisoes = contaColisoes(reservadas, TOTALRESERVADAS);
    realocadas = montaTabela(reservadas, TOTALRESERVADAS);

    printf("MAX = %d, area de colisoes = %d posicoes, total = %d\n", MAX, AREACOLISOES, TOTALPOSICOES);
    printf("Palavras reservadas: %d\n", TOTALRESERVADAS);
    printf("Colisoes da funcao de espalhamento: %d\n", colisoes);
    printf("Palavras realocadas na area final: %d\n\n", realocadas);

    printf("Tabela:\n");
    imprimeTabela();

    printf("\nBuscas:\n");
    for (i = 0; i < totalTestes; i++)
        testaPalavra(testes[i]);

    return 0;
}