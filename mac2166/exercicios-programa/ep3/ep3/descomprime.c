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
#include <stdlib.h>
#include <math.h>

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

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

int trunca_para_intervalo(double numero)
{
    if (numero < -128)
        return -128;
    if (numero > 127)
        return 127;
    return (int)numero;
}

void dct_inverso_com_base(int N, double D[N][N], int M[N][N], double base[N][N])
{
    double temporaria[N][N];
    for (int frequenciaLinha = 0; frequenciaLinha < N; frequenciaLinha++)
        for (int coluna = 0; coluna < N; coluna++)
        {
            double soma = 0;
            for (int frequenciaColuna = 0; frequenciaColuna < N; frequenciaColuna++)
                soma += D[frequenciaLinha][frequenciaColuna] * base[frequenciaColuna][coluna];
            temporaria[frequenciaLinha][coluna] = soma;
        }
    for (int linha = 0; linha < N; linha++)
        for (int coluna = 0; coluna < N; coluna++)
        {
            double soma = 0;
            for (int frequenciaLinha = 0; frequenciaLinha < N; frequenciaLinha++)
                soma += base[frequenciaLinha][linha] * temporaria[frequenciaLinha][coluna];
            M[linha][coluna] = trunca_para_intervalo(round(soma));
        }
}

void dct_inverso(int N, double D[N][N], int M[N][N])
{
    double base[N][N];
    calcula_base(N, base);
    dct_inverso_com_base(N, D, M, base);
}

void dequantiza(int Dtil[8][8], double D[8][8])
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
            D[linha][coluna] = Dtil[linha][coluna] * matrizQuantizacao[linha][coluna];
}

void sequencia_para_matriz(int sequencia[64], int Dtil[8][8])
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
            Dtil[linha][somaIndices - linha] = sequencia[indice];
            indice++;
        }
    }
}

void le_codificacao(int Dtil[8][8])
{
    int sequencia[64];
    scanf("%d", &sequencia[0]);
    int posicao = 1;
    while (posicao < 64)
    {
        int tamanhoBlocoZeros;
        scanf("%d", &tamanhoBlocoZeros);
        for (int contador = 0; contador < tamanhoBlocoZeros; contador++)
        {
            sequencia[posicao] = 0;
            posicao++;
        }
        if (posicao < 64)
        {
            scanf("%d", &sequencia[posicao]);
            posicao++;
        }
    }
    sequencia_para_matriz(sequencia, Dtil);
}

int main(int argc, char *argv[])
{
    int largura, altura;
    scanf("%d %d", &largura, &altura);
    unsigned char *imagem = malloc(largura * altura);
    unsigned char (*matrizImagem)[largura] = (unsigned char (*)[largura])imagem;
    double base[8][8];
    calcula_base(8, base);
    for (int blocoLinha = 0; blocoLinha < altura; blocoLinha += 8)
        for (int blocoColuna = 0; blocoColuna < largura; blocoColuna += 8)
        {
            int quantizada[8][8];
            le_codificacao(quantizada);
            double transformada[8][8];
            dequantiza(quantizada, transformada);
            int bloco[8][8];
            dct_inverso_com_base(8, transformada, bloco, base);
            for (int linha = 0; linha < 8; linha++)
                for (int coluna = 0; coluna < 8; coluna++)
                    matrizImagem[blocoLinha + linha][blocoColuna + coluna] = bloco[linha][coluna] + 128;
        }
    if (stbi_write_png(argv[1], largura, altura, 1, imagem, largura))
    {
        free(imagem);
        return 0;
    }
    printf("Falha ao salvar PNG em %s.\n", argv[1]);
    free(imagem);
    return 1;
}