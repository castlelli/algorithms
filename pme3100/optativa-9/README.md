# Oscilador de Duffing · PME3100 Mecânica I

Integra por Runge-Kutta de 4ª ordem o oscilador

    m x'' + c x' + k1 x + k2 x³ = A cos(ωt)

e gera os gráficos x(t), ẋ(t) e ẋ(x). O entregável é `resultado/relatorio_duffing.pdf`.

## Como rodar

```bash
# Ambiente (uma vez só; sem sudo)
micromamba create -y -p ~/.local/envs/pme3100 -c conda-forge \
    python=3.12 numpy scipy matplotlib jinja2 pytest tectonic mscorefonts
PY=~/.local/envs/pme3100/bin/python

cd optativa-9

# Testes (cerca de 1 min)
$PY -m pytest -q

# Um conjunto de dados próprio: entradas a-g do enunciado
$PY -m codigo --m 1 --k1 -1 --k2 1 --c 0.3 --A 0.37 --omega 1.2 --tmax 314.16 --x0 0.084 --v0 0

# Um caso pronto: A, B, C, D ou E
$PY -m codigo --caso A

# Tudo do zero: casos, análises, figuras e PDF (vários minutos na primeira vez)
$PY -m codigo --todos

# Só refaz figuras e PDF, usando as análises em cache/
$PY -m codigo --relatorio
```

Na primeira compilação, o tectonic baixa os pacotes LaTeX. Sem `--saida`, cada execução grava em
`resultado/`: `a_x_t.png`, `b_v_t.png`, `c_espaco_de_fases.png`, `painel.png` e `trajetoria.csv`.

## Opções

| opção | significado |
|---|---|
| `--m`, `--k1`, `--k2`, `--c` | massa [kg], constantes da mola [N/m, N/m³], amortecimento [N·s/m] |
| `--A`, `--omega` | amplitude [N] e frequência [rad/s] da força |
| `--tmax`, `--x0`, `--v0` | tempo máximo [s] e condições iniciais [m, m/s] |
| `--h` | passo [s]; o padrão é T/200 ou menor, se a mola exigir |
| `--saida` | pasta de saída |

## Casos prontos

Todos com m = 1 kg, k2 = 1 N/m³, c = 0,3 N·s/m e ω = 1,2 rad/s.

| caso | k1 [N/m] | A [N] | regime |
|---|---|---|---|
| A (obrigatório) | −1 | 0,37 | período 5, não caótico |
| B (obrigatório) | −1 | 0 | repouso em x = ±1 |
| C | −1 | 0,50 | caos |
| D | +1 | 0,37 | período 1 |
| E | −1 | 0,20 | dois atratores de período 1 |

O enunciado não fixa α = k1/m no conjunto A. Foi adotado α = −1, valor clássico para esses parâmetros.

## Organização

- `codigo/modelo.py`: modelo, RK4, seção de Poincaré e expoentes de Lyapunov.
- `codigo/casos.py`: os quatro conjuntos de dados.
- `codigo/analise.py`: medidas longas, com cache em `cache/`.
- `codigo/verificacao.py`: valores da tabela de verificação do relatório.
- `codigo/figuras.py`, `codigo/estilo.py`: figuras.
- `codigo/recursos/`: brasões da capa. A Times New Roman vem do pacote `mscorefonts`, fora do repositório.
- `codigo/relatorio.py`, `codigo/templates/`: PDF. A geração para se um resultado deixar de
  sustentar uma afirmação do texto (`conferir_afirmacoes`).
- `tests/`: cada teste é uma afirmação física ou numérica.
