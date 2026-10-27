# Carrossel e formiga · PME3100 Mecânica I

Uma formiga anda, sobre uma reta radial fixa num carrossel que gira com ω(t), da borda até
o centro, com velocidade relativa v(t). O programa calcula (a) a lei de movimento,
(b) as velocidades, (c) as acelerações (incluindo a de Coriolis) e (d) uma animação em vista
de topo. Para cada caso, gera um relatório em PDF com a animação embutida, um MP4 e um GIF.

## Como rodar

```bash
# 1. Ambiente (uma vez só; sem sudo)
micromamba create -y -p ~/.local/envs/pme3100 -c conda-forge \
    python=3.12 numpy scipy sympy matplotlib jinja2 pillow pytest tectonic ffmpeg
PY=~/.local/envs/pme3100/bin/python

# 2. Entrar na pasta do projeto
cd optativa-6

# 3. Testes
$PY -m pytest -q

# 4. Gerar os três casos prontos em resultado/ (~1 min cada)
$PY -m codigo --todos

# Opcional: um caso próprio
$PY -m codigo --omega "0.5+0.2*t" --v "0.3" --R 2 --phi0 0 --dt 0.5 --t 1.7
```

Na primeira execução, o tectonic baixa os pacotes LaTeX, o que leva cerca de 1 min.

## Opções

| opção | significado |
|---|---|
| `--caso N` / `--todos` | caso pronto 1, 2 ou 3 / os três |
| `--omega`, `--v` | ω(t) [rad/s] e v(t) ≥ 0 [m/s], como expressões em `t` |
| `--R`, `--phi0` | raio [m] e ângulo inicial da reta [rad] (aceita `"pi/4"`) |
| `--dt` | Δt de exibição dos vetores [s] (obrigatório sem `--caso`) |
| `--t` | instante dos itens (b) e (c) [s] (padrão: t_f/2) |
| `--sem-video` | não grava MP4/GIF |
| `--so-tabela` | só imprime a tabela de (b) e (c) no terminal |

Nas expressões valem números, `t`, `+ - * / ^ ( )`, `pi`, `E` e as funções `sin cos tan exp log
sqrt abs` (entre outras). A multiplicação precisa ser explícita: `2*t`, e não `2t`.

## Casos prontos

| caso | ω(t) [rad/s] | v(t) [m/s] | o que mostra |
|---|---|---|---|
| 1 | 0,5 | 0,25 | referência conferível à mão (a_rel = 0, \|a_cor\| = 2ωv, t_f = R/v) |
| 2 | 0,2 + 0,15 t | 0,3 | carrossel acelerando: surge a parcela tangencial α∧OF |
| 3 | 0,6 sin(0,7 t) | 0,25 + 0,2 sin(1,2 t) | o carrossel inverte o sentido; todas as parcelas são não nulas |

## Resultados

- `resultado/relatorio_todos.pdf`: os três casos num só documento estático (modelo uma vez,
  uma seção por caso; a animação aparece como grade de quadros-chave).
- `resultado/animacao_todos.mp4`: os três vídeos em sequência, com um cartão de título antes
  de cada caso.
- `resultado/relatorio_casoN.pdf`, `animacao_casoN.mp4` e `.gif`: os mesmos resultados, caso a caso.
- `visualizador.html`: versão interativa, que roda direto no navegador.

Na animação, as setas alternam a cada Δt: velocidades nos múltiplos pares de Δt e
acelerações nos ímpares. O painel lateral mostra sempre os módulos dos dois grupos.

A animação embutida nos relatórios individuais só toca no Adobe Acrobat Reader, no Okular e no PDF-XChange.
Nos outros leitores aparece só o primeiro quadro; nesse caso, use o MP4 ou o GIF.

## Limitações

- v(t) precisa ser ≥ 0 até a formiga chegar ao centro; caso contrário, o programa para e
  indica em que instante isso acontece.
- Se a formiga não chega ao centro em 60 s (`--tmax`), a análise para aí e o PDF avisa.
