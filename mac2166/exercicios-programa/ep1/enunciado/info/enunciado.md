Universidade de São Paulo
Instituto de Matemática, Estatística e Ciência da Computação
Departamento de Ciência da Computação

# MAC2166 — Introdução à Computação (Eng. da Computação e Elétrica)
## Exercício-Programa 1: Grid de largada (v1.1, 30/03/2026)

*Grid de largada do GP da Malásia. Foto por eastkandar (licença CC BY 2.0).*

Está dada a largada dos EPs de MAC2166! Você foi contratado para ajudar a escrever a lógica
de um sistema que determina a ordem de largada de uma corrida de Fórmula 1. Tal ordem
depende do desempenho dos pilotos em um treino classificatório.

Os pilotos são identificados por números. No treino classificatório, eles têm como objetivo dar
uma volta na pista no menor tempo possível. Cada piloto pode tentar várias vezes, e considera-se
apenas o menor dos tempos obtidos nas diversas tentativas. Quem conseguir o menor tempo de
todos larga na frente, o próximo menor tempo larga em segundo, e assim por diante. Caso dois
competidores obtenham exatamente o mesmo menor tempo, estará na frente aquele que precisou
de menos tentativas para obter tal tempo pela primeira vez. Se o empate permanecer mesmo
assim, o piloto identificado pelo menor número prevalece. Por exemplo, na tabela de tempos
abaixo, Cernaldo largará na frente e Arnaldo largará em segundo.

| Nome     | Número do piloto | Tempo da primeira tentativa | Tempo da segunda tentativa |
|----------|------------------|-----------------------------|----------------------------|
| Arnaldo  | 1                | 1m10s                       | 1m                         |
| Bernaldo | 2                | 1m5s                        | 1m                         |
| Cernaldo | 3                | 1m                          | 1m30s                      |

Por outro lado, um competidor que conseguisse o tempo de 59 segundos na sua terceira tentativa largaria na frente de Arnaldo, Bernaldo e Cernaldo.

Seu objetivo nesse EP é determinar os corredores que largarão na primeira fila, isto é, o primeiro
lugar (*pole position*) e o segundo lugar.

---

## 2

### FORMATO DE ENTRADA E SAÍDA

Seu programa deve ler os dados de entrada da entrada padrão, até o fim do arquivo (EOF). É
garantido que a entrada está no formato descrito abaixo, e seu código não precisa verificar erros
de formatação.

Cada linha contém três números: O número do competidor, o número da tentativa, e o tempo
em milissegundos. Para cada competidor, as suas tentativas são numeradas sequencialmente (iniciando de 1), e serão listadas em ordem crescente de número de tentativa. Há pelo menos dois
competidores. Não há ordem definida entre as linhas correspondentes a tentativas de competidores diferentes. Um exemplo de entrada que corresponde à tabela acima é:

```
3 1 60000
1 1 70000
1 2 60000
2 1 65000
3 2 90000
2 2 60000
```

A saída deverá consistir de exatamente duas linhas. A primeira contém dados sobre o pole
position, e a seguinte deve conter dados do segundo colocado. Por exemplo, para o caso de teste
acima, a saída deverá ser exatamente como abaixo:

```
Pole position: Piloto 3, com tempo de 1 minuto, 0 segundos e 0 milissegundos (tentativa 1).
Segundo lugar: Piloto 1, com tempo de 1 minuto, 0 segundos e 0 milissegundos (tentativa 2).
```

O tempo deverá ser impresso no formato "X minuto[s], Y segundo[s] e Z milissegundo[s]", em
que nem X, nem Y nem Z devem conter zeros desnecessários à esquerda. Caso X seja 1, a palavra
que o segue deve ser "minuto", ou "minutos" caso contrário. O análogo vale para Y e Z.

Para mostrar a precisão dos cronômetros do seu empregador, você deve imprimir todas as componentes, mesmo que o tempo corresponda a uma quantidade inteira de minutos ou de segundos.
Ou seja, um tempo de 60000 milissegundos deve ser impresso como "1 minuto, 0 segundos e 0
milissegundos", como visto acima.

### AVISOS E RECOMENDAÇÕES

Você só pode usar recursos vistos em sala antes da primeira avaliação. Em particular, está
proibido o uso de vetores (arrays) neste EP. Seu código será compilado com a opção `-std=c99`.
Recomenda-se testar também com as opções `-Wall -pedantic`, para que o compilador detecte
possíveis erros.

Estruturar seu código é muito importante para que você não perca tempo consertando problemas (bugs). É altamente recomendável que você use uma ou mais funções para estruturar seu
código e que use nomes de variável descritivos.

### COMO SUBMETER

Você deve submeter sua solução pelo Laboratório de Programação Virtual (VPL) do EP, que
está disponível na página do curso no e-Disciplinas. Para tal, você deve colocar seu programa
no arquivo "ep1.c", que já vem criado por padrão. Para testar seu programa, você deve clicar
no botão "Salvar" e depois no botão "Avaliar". Você receberá o resultado de uma avaliação
automática, que consiste de dois tipos de casos de teste:

- Para alguns casos de teste, o VPL te informará a entrada fornecida e a resposta esperada
em casos de erro, para facilitar a identificação de pequenos problemas.
- Outros casos de teste são "secretos", e você receberá apenas a informação de que seu
programa forneceu a resposta correta/errada nesses casos. Caso você erre algum desses casos, você deve pensar em casos traiçoeiros e escrever casos de teste você mesmo.
Recomenda-se salvar tais casos de teste em arquivos de texto, para facilitar testes futuros.

A página seguinte contém informações importantes sobre honestidade acadêmica. Não a pule.

---

## 3

### SOBRE PLÁGIO

Este EP é um trabalho puramente individual. Você não deve mostrar seu código a seus colegas, nem ler código de outras pessoas, nem usar LLMs (como ChatGPT ou Gemini). Mais detalhes
sobre punições a plágio estão disponíveis em https://www.ime.usp.br/~mac2166/plagio/. Observe que:

- Em caso de plágio, todos os envolvidos serão punidos, independente de quem fez o código e de quem plagiou.
- Obviamente, uma parte da punição é receber nota zero no EP. No entanto, como avisado
em https://www.ime.usp.br/~mac2166/gerais/index2026.html, todo aluno tem uma
"nota de conduta ética" α, que começa igual a 1. Em cada ocorrência de plágio, haverá
uma redução de pelo menos 0,3 em α. A média dos EPs (MEP) e a média das provas (MP)
são dadas por

$$MEP = \alpha \times \frac{E_1 + 2E_2 + 3E_3}{6}$$

$$MP = \alpha \times \frac{P_1 + 2P_2 + 2P_3}{5}$$

em que $E_i$ é a nota do $i$-ésimo EP e $P_i$ é a nota da $i$-ésima prova. Em particular, a média
das provas de uma pessoa punida por plágio no EP1 será no máximo 7, e a média dos EPs
será no máximo 5,83. Para aprovação no curso, é necessário que MEP e MP sejam ambos
pelo menos 5.

Seu código deve começar com o comentário abaixo, e você deve preencher os quatro campos
nele contidos. Fazendo-o, você está concordando com os termos listados no comentário. Uma versão do comentário abaixo está disponível em https://www.ime.usp.br/~mac2166/infoepsC/.

```c
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
Nome :
NUSP :
Turma:
Prof.:
******************************************************************************/
```