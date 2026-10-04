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

 Nome : VINICIUS SAMPAIO CASTELLI DE DEUS
 NUSP : 17864509
 Turma: T01
 Prof.: YOSHI
******************************************************************************/

#include <stdio.h>
#include <math.h>

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

#define PI 3.14159265358979323846

void calcula_base(int N, double base[N][N])
{
    for (int frequencia = 0; frequencia < N; frequencia++)
    {
        double norma;
        if (frequencia == 0)
            norma = sqrt(N);
        else
            norma = sqrt(N / 2.0);
        for (int posicao = 0; posicao < N; posicao++)
            base[frequencia][posicao] = cos(frequencia * PI / N * (posicao + 0.5)) / norma;
    }
}

void dct_com_base(int N, int M[N][N], double D[N][N], double base[N][N])
{
    double temporaria[N][N];
    for (int linha = 0; linha < N; linha++)
        for (int frequenciaColuna = 0; frequenciaColuna < N; frequenciaColuna++)
        {
            double soma = 0;
            for (int coluna = 0; coluna < N; coluna++)
                soma += M[linha][coluna] * base[frequenciaColuna][coluna];
            temporaria[linha][frequenciaColuna] = soma;
        }
    for (int frequenciaLinha = 0; frequenciaLinha < N; frequenciaLinha++)
        for (int frequenciaColuna = 0; frequenciaColuna < N; frequenciaColuna++)
        {
            double soma = 0;
            for (int linha = 0; linha < N; linha++)
                soma += base[frequenciaLinha][linha] * temporaria[linha][frequenciaColuna];
            D[frequenciaLinha][frequenciaColuna] = soma;
        }
}

void dct(int N, int M[N][N], double D[N][N])
{
    double base[N][N];
    calcula_base(N, base);
    dct_com_base(N, M, D, base);
}

int trunca_para_intervalo(double numero)
{
    if (numero < -128)
        return -128;
    if (numero > 127)
        return 127;
    return (int)numero;
}

void quantiza(double D[8][8], int Dtil[8][8])
{
    int matrizQuantizacao[8][8] = {
        {16, 10, 10, 16, 25, 41, 50, 61},
        {12, 13, 14, 19, 26, 58, 60, 54},
        {14, 12, 16, 24, 41, 56, 68, 57},
        {14, 16, 22, 29, 51, 87, 81, 63},
        {18, 23, 37, 56, 69, 108, 102, 76},
        {24, 34, 55, 64, 80, 105, 113, 92},
        {49, 65, 78, 87, 103, 120, 120, 100},
        {72, 93, 95, 98, 113, 100, 103, 98}};
    for (int linha = 0; linha < 8; linha++)
        for (int coluna = 0; coluna < 8; coluna++)
            Dtil[linha][coluna] = trunca_para_intervalo(round(D[linha][coluna] / matrizQuantizacao[linha][coluna]));
}

void matriz_para_sequencia(int Dtil[8][8], int sequencia[64])
{
    int indice = 0;
    for (int somaIndices = 0; somaIndices <= 14; somaIndices++)
    {
        int linhaInicial = 0;
        if (somaIndices > 7)
            linhaInicial = somaIndices - 7;
        int linhaFinal = somaIndices;
        if (linhaFinal > 7)
            linhaFinal = 7;
        for (int linha = linhaInicial; linha <= linhaFinal; linha++)
        {
            sequencia[indice] = Dtil[linha][somaIndices - linha];
            indice++;
        }
    }
}

void imprime_codificacao(int Dtil[8][8])
{
    int sequencia[64];
    matriz_para_sequencia(Dtil, sequencia);
    printf("%d", sequencia[0]);
    int posicao = 1;
    while (posicao < 64)
    {
        int tamanhoBlocoZeros = 0;
        while (posicao < 64 && sequencia[posicao] == 0)
        {
            tamanhoBlocoZeros++;
            posicao++;
        }
        printf(" %d", tamanhoBlocoZeros);
        if (posicao < 64)
        {
            printf(" %d", sequencia[posicao]);
            posicao++;
        }
    }
    printf("\n");
}

int main(int argc, char *argv[])
{
    int largura, altura, numeroCanais;
    unsigned char *imagem = stbi_load(argv[1], &largura, &altura, &numeroCanais, 1);
    if (imagem == NULL)
    {
        printf("Falha ao ler arquivo %s.\n", argv[1]);
        return 1;
    }
    unsigned char (*matrizImagem)[largura] = (unsigned char (*)[largura])imagem;
    largura -= largura % 8;
    altura -= altura % 8;
    printf("%d %d\n", largura, altura);
    double base[8][8];
    calcula_base(8, base);
    for (int blocoLinha = 0; blocoLinha < altura; blocoLinha += 8)
        for (int blocoColuna = 0; blocoColuna < largura; blocoColuna += 8)
        {
            int bloco[8][8];
            for (int linha = 0; linha < 8; linha++)
                for (int coluna = 0; coluna < 8; coluna++)
                    bloco[linha][coluna] = matrizImagem[blocoLinha + linha][blocoColuna + coluna] - 128;
            double transformada[8][8];
            dct_com_base(8, bloco, transformada, base);
            int quantizada[8][8];
            quantiza(transformada, quantizada);
            imprime_codificacao(quantizada);
        }
    stbi_image_free(imagem);
    return 0;
}