# Carrossel e formiga · PME3100 Mecânica I

Uma formiga anda sobre uma reta radial fixa num carrossel, da borda rumo ao centro,
enquanto o carrossel gira com ω(t). Para funções ω(t) e v(t) quaisquer, o programa resolve:

- (a) a lei de movimento, simbólica quando existe forma fechada e numérica (declarada no PDF) quando não existe;
- (b) as velocidades relativa, de arrastamento e absoluta;
- (c) as acelerações relativa, de arrastamento (tangencial α∧OF e centrípeta ω∧(ω∧OF)), de Coriolis e absoluta;
- (d) uma animação em vista de topo.

Para cada caso ele gera um relatório em PDF tipografado em LaTeX, com a animação embutida,
e também o vídeo MP4 e o GIF.

## Instalação

Precisa de Python ≥ 3.10, `tectonic` (LaTeX que baixa os pacotes sob demanda) e `ffmpeg`.
O jeito mais simples, sem sudo, é com micromamba/conda:

```bash
micromamba create -p ~/.local/envs/pme3100 -c conda-forge \
    python=3.12 numpy scipy sympy matplotlib jinja2 pillow pytest tectonic ffmpeg
```

Não é preciso ativar o ambiente: `ffmpeg` e `tectonic` são procurados também em
`sys.prefix/bin`. Na primeira compilação, o tectonic baixa os pacotes LaTeX (~1 min).

## Uso

```bash
cd pme3100/optativa-6
PY=~/.local/envs/pme3100/bin/python

$PY -m codigo --caso 1        # um caso pronto (1, 2 ou 3)
$PY -m codigo --todos         # os três casos (~1 min cada)
$PY -m codigo --omega "0.5+0.2*t" --v "0.3" --R 2 --phi0 0 --dt 0.5 --t 1.7
$PY -m codigo --caso 3 --t 2.5 --so-tabela    # só a tabela de (b) e (c) no terminal
```

| opção | significado |
|---|---|
| `--omega`, `--v` | ω(t) [rad/s] e v(t) ≥ 0 [m/s] como expressões em `t` |
| `--R`, `--phi0` | raio [m] e ângulo inicial da reta [rad]; `--phi0` aceita `"pi/4"` |
| `--dt` | Δt de exibição dos vetores [s] (obrigatório sem `--caso`) |
| `--t` | o "instante qualquer" de (b) e (c) [s] (padrão: t_f/2) |
| `--tmax` | horizonte se a formiga não chegar ao centro (padrão 60 s) |
| `--saida`, `--build` | pasta dos resultados (padrão `resultado/`) e pasta de trabalho (padrão temporária) |
| `--sem-video` | não grava MP4/GIF; o PDF mantém a animação |

Nas expressões valem números, `t`, `+ - * / ** ^ ( )`, `pi`, `E` e as funções
`sin sen cos tan tg asin acos atan sinh cosh tanh exp log ln sqrt abs`. Qualquer outro nome
é recusado: o texto não passa por `eval`. A multiplicação precisa ser explícita (`2*t`).

### Casos prontos

| caso | ω(t) [rad/s] | v(t) [m/s] | o que mostra |
|---|---|---|---|
| 1 | 0,5 | 0,25 | referência conferível à mão: a_rel = 0, a_arr só centrípeta, \|a_cor\| = 2ωv, t_f = R/v |
| 2 | 0,2 + 0,15 t | 0,3 | α ≠ 0: aparece a parcela tangencial α∧OF |
| 3 | 0,6 sin(0,7 t) | 0,25 + 0,2 sin(1,2 t) | o carrossel inverte o sentido em t ≈ 4,49 s; todas as parcelas são não nulas e trocam de sinal |

## Saídas (em `resultado/`)

- `relatorio_<caso>.pdf` traz capa e resumo, modelo e dedução, (a), (b) e (c) no instante pedido,
  a tabela temporal, gráficos, (d) com a animação embutida e a grade de quadros-chave, e a verificação;
- `animacao_<caso>.mp4` (1920×1080, 30 quadros/s) e `animacao_<caso>.gif` com a mesma animação.

Na animação, a cada múltiplo kΔt troca-se o grupo exibido: as 3 velocidades se k é par,
as 4 acelerações se k é ímpar. As setas dos dois grupos nunca aparecem juntas, mas o painel
lateral mostra sempre os módulos de velocidades e acelerações em dois quadros lado a lado; a
borda colorida indica de qual grupo são as setas na cena. As escalas das setas são
fixas durante toda a animação: o maior vetor de cada grupo mede 0,6 R. Uma escala variável
por quadro esconderia como os módulos mudam no tempo.

### Onde a animação do PDF toca

O pacote LaTeX `animate` só funciona no **Adobe Acrobat Reader**, no **Okular** e no
**PDF-XChange**. Navegadores, o Preview do macOS, o Evince e a maioria dos leitores leves
mostram só o primeiro quadro. Para esses casos o PDF traz a grade de quadros-chave e
aponta o MP4/GIF.

## Visualizador interativo

`visualizador.html` é autocontido: abra no navegador, sem servidor e sem internet. Ele tem
sliders para t e Δt, botão de reprodução e caixas para trocar ω(t), v(t), R e φ₀. Usa a mesma
lista branca de funções, as mesmas cores e a mesma regra de alternância. A integração é
numérica (RK4), então os PDFs continuam sendo a referência com a lei simbólica e a verificação.

## Testes

```bash
$PY -m pytest -q
```

Os testes cobrem:

- composição v_abs = v_rel + v_arr e a_abs = a_rel + a_arr + a_cor, contra a derivada direta de x(t), y(t) (tolerância 1e-9);
- derivada numérica de OF e de v_abs contra v_abs e a_abs (erro relativo < 1e-5): é o teste que valida Coriolis e arrastamento;
- caso analítico com ω e v constantes, e o caso ω = 0;
- validação de entrada: expressões inválidas ou maliciosas, v negativa, R ≤ 0, Δt ≤ 0;
- alternância conferida nos quadros realmente desenhados;
- escala fixa com o maior vetor medindo 0,6 R.

## Estrutura

```
codigo/
  modelo.py        física (sympy + numpy/scipy; não importa matplotlib)
  verificacao.py   checagens numéricas usadas pelo pytest e pelo PDF
  casos.py         os três casos prontos
  animacao.py      vista de topo, quadro do vídeo, MP4/GIF/PNG
  relatorio.py     figuras + template LaTeX → PDF (tectonic)
  estilo.py        paleta Okabe–Ito e estilo das figuras
  formatacao.py    números em português (vírgula decimal)
  cli.py           linha de comando
  templates/relatorio.tex.j2
tests/test_modelo.py
```

## Limitações conhecidas

- **v(t) precisa ser ≥ 0 até a formiga chegar ao centro.** v é o *módulo* da velocidade
  relativa rumo a O. Se v(t) fica negativa antes de r = 0, o programa para com um erro que
  indica o instante em que isso acontece, porque a formiga voltaria para a borda. Valores
  negativos depois de t_f não importam.
- Se a formiga não chega ao centro até `--tmax`, a análise vai até t_max, e o PDF e o
  terminal avisam.
- A lei numérica (quando o sympy não acha primitiva) usa DOP853 com tolerância 1e-12. Se o
  sympy demorar mais de 8 s numa integral, cai-se no numérico.
- Expressões com singularidade removível, como `sin(t)/t` em t = 0, são recusadas porque o
  valor não é finito no ponto. Reescreva sem a singularidade.
