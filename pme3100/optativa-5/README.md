# Hipocicloide e triedro de Frenet · PME3100 Mecânica I (Optativa 5)

**Parte 1.** Um disco de raio r rola sem escorregar por dentro de um aro de raio R > r, e o ponto P
do disco traça a hipocicloide. O programa constrói a curva (1.1), anima (1.2) e fotografa (1.3) o
processo de geração, traça a curva para quatro razões R/r (1.4), calcula o raio de curvatura (1.5),
desenha os versores tangente e normal (1.6) e, com θ = ωt e ω = π/60 rad/s, dá a velocidade e a
aceleração de P nas formas cartesiana e intrínseca em três instantes (1.7).

**Parte 2.** Para a cúbica reversa x = λ, y = λ², z = λ³, calcula o raio de curvatura (2.2) e o
triedro de Frenet τ, n, b (2.3) em três pontos.

O enunciado completo está em [`Tarefa_5.md`](Tarefa_5.md).

Versão interativa: <https://castlelli.github.io/algorithms/hypocycloid/>

## Como rodar

```bash
# 1. Ambiente (uma vez só; sem sudo)
micromamba create -y -p ~/.local/envs/pme3100 -c conda-forge \
    python=3.12 numpy matplotlib jinja2 pillow pytest tectonic ffmpeg
PY=~/.local/envs/pme3100/bin/python

# 2. Entrar na pasta do projeto
cd optativa-5

# 3. Testes
$PY -m pytest -q

# 4. Só as tabelas (1.5, 1.7, 2.2/2.3) no terminal
$PY -m codigo --so-tabela

# 5. Relatório em PDF, GIF e MP4 em resultado/
$PY -m codigo

# Exporta os números para o site (docs/hypocycloid/data)
$PY -m codigo --site

# Opcional: outros dados
$PY -m codigo --R 7 --r 2 --razoes "3 4 5 3.5" --instantes "10 30 50" --lambdas "-1 0.5 1"
```

Na primeira execução, o tectonic baixa os pacotes LaTeX, o que leva cerca de 1 min.

## Opções

| opção | significado | padrão |
|---|---|---|
| `--R`, `--r` | raio do aro e do disco (R > r; R/r racional para a curva fechar) | 5 e 1 |
| `--razoes` | razões R/r do item 1.4 | `"3 4 5 3.5"` |
| `--omega` | ω [rad/s] da lei θ = ωt (aceita `"pi/60"`) | π/60 |
| `--instantes` | instantes do item 1.7 [s] | `"10 30 50"` |
| `--lambdas` | pontos λ ≠ 0 da parte 2 | `"-1 0.5 1"` |
| `--saida` | pasta dos resultados | `resultado/` |
| `--sem-video` | não grava GIF/MP4 | |
| `--so-tabela` | só imprime as tabelas no terminal | |
| `--site` | exporta os números dos dados padrão para o site | |

## O que o programa calcula

- Com a = R − r e k = (R − r)/r, a velocidade escalar é |r′(θ)| = 2a|sin(Rθ/2r)|, e o raio de curvatura
  tem forma fechada, ρ = 4r(R − r)/|R − 2r| · |sin(Rθ/2r)|. Ele vai a zero nos bicos, onde P toca o aro e para.
- Se R/r = p/q (fração irredutível), a curva tem p bicos e fecha depois de q voltas do centro do disco.
- n = sinal(x′y″ − y′x″)·(−τ_y, τ_x) aponta sempre para o centro de curvatura.
- Item 1.7: v = ω r′(θ), a = ω² r″(θ); a_t = a·τ e a_n = a·n = |v|²/ρ.
- Parte 2: κ = |r′ × r″|/|r′|³, torção = 3/(1 + 9λ² + 9λ⁴); τ = r′/|r′|, b = r′ × r″/|r′ × r″|, n = b × τ.

`codigo/verificacao.py` confere tudo com derivadas numéricas e identidades, entre elas Frenet–Serret, o
rolamento sem escorregar (v ⟂ IP) e o comprimento da curva. As mesmas checagens rodam no pytest, saem na
última seção do relatório e são refeitas pelo site no navegador.

## Arquivos

- `codigo/`: o pacote (`modelo.py`, `verificacao.py`, `figuras.py`, `animacao.py`, `relatorio.py` com
  `templates/relatorio.tex.j2`, `site.py`, `cli.py`).
- `resultado/`: relatório em PDF, `hipocicloide.gif` e `hipocicloide.mp4`, gerados por `python -m codigo`.
- `Tarefa5.pdf` e `hipocicloide.gif`: a versão entregue, feita pelo programa original (um script único).
  O novo relatório vai substituí-la.
- `../../docs/hypocycloid/`: o site interativo (HTML, CSS e JavaScript puros, sem etapa de build),
  publicado em <https://castlelli.github.io/algorithms/hypocycloid/>. `js/model.js` repete `modelo.py`, e a
  seção de conferência compara tudo com `data/report.json`, gerado por `--site`. Para ver localmente:
  `python -m http.server` dentro de `docs/`.
