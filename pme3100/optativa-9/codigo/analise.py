"""Medidas longas sobre os casos. Cada função grava seu resultado em cache/ para não recalcular."""

from __future__ import annotations

import math
import os
from concurrent.futures import ProcessPoolExecutor
from functools import wraps
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import numpy as np

from .casos import CASOS
from .modelo import (
    PASSOS_POR_PERIODO, Coef, Parametros, _campo_tangente, amplitude_harmonica, estroboscopico,
    gamma_melnikov, integrar, lyapunov, mapa_e_jacobiana, orbita_periodica, passo_rk4,
    periodo_detectado, separatriz,
)

CACHE = Path(__file__).resolve().parent.parent / "cache"
SEMENTE = 20261105
SPP_MAPA = 100  # passos por período nos mapas de muitas trajetórias
JANELA_BACIA = (-2.0, 2.0, -2.0, 2.0)
JANELA_ZOOM = (1.2, 1.5, -0.7, -0.4)
OPERARIOS = min(16, os.cpu_count() or 1)

A, B, C, D, E = (CASOS[k].p for k in "ABCDE")


def em_cache(func):
    """Guarda em cache/<nome>.npz o dicionário de arrays e números devolvido pela função."""
    @wraps(func)
    def envolvida(*args, **kwargs):
        CACHE.mkdir(exist_ok=True)
        arquivo = CACHE / f"{func.__name__}.npz"
        if arquivo.exists():
            with np.load(arquivo) as dados:
                return {k: dados[k] for k in dados.files}
        resultado = func(*args, **kwargs)
        np.savez_compressed(arquivo, **resultado)
        return {k: np.asarray(v) for k, v in resultado.items()}
    return envolvida


def fatias(n: int, partes: int) -> list[slice]:
    limites = np.linspace(0, n, partes + 1).astype(int)
    return [slice(a, b) for a, b in zip(limites[:-1], limites[1:]) if b > a]


@em_cache
def ciclo_a() -> dict:
    """Órbita de período 5: os 5 pontos da seção, em ordem de visita, e o teste de simetria."""
    s = estroboscopico(A.coef, 1.0, 0.0, 800)
    per = int(periodo_detectado(s[-200:]))
    if per != 5:
        raise RuntimeError(f"esperava período 5 no caso A, obtive {per}")
    pontos = s[-5:].copy()
    # A órbita meio período depois, espelhada, cai sobre os mesmos 5 pontos? Se sim, é o próprio espelho.
    tr = integrar(A, pontos[0, 0], pontos[0, 1], 5.5 * A.T, h=A.T / PASSOS_POR_PERIODO)
    meio = PASSOS_POR_PERIODO // 2
    espelho = -np.array([[tr.x[meio + PASSOS_POR_PERIODO * k], tr.v[meio + PASSOS_POR_PERIODO * k]] for k in range(5)])
    dist = [np.min(np.hypot(pontos[:, 0] - a, pontos[:, 1] - b)) for a, b in espelho]
    return {"pontos": pontos, "dist_espelho": float(np.max(dist)), "periodo": per}


def _classifica(args):
    """Rótulo final (índice do ponto ou -1) e duração do transiente de cada condição inicial."""
    x, v, pontos, n, spp, c = args
    T = 2 * math.pi / c.omega
    h = T / spp
    tau = np.zeros(x.shape, dtype=np.int32)
    px, pv = pontos[:, 0][:, None], pontos[:, 1][:, None]
    for m in range(n):
        for k in range(spp):
            x, v = passo_rk4((m + k / spp) * T, x, v, h, c)
        d = np.min(np.hypot(px - x.ravel(), pv - v.ravel()), axis=0).reshape(x.shape)
        tau[d > 0.05] = m + 1
    dist = np.hypot(px - x.ravel(), pv - v.ravel())
    rotulo = np.argmin(dist, axis=0).reshape(x.shape)
    rotulo[np.min(dist, axis=0).reshape(x.shape) > 1e-3] = -1
    return rotulo, tau


def classificar(x: np.ndarray, v: np.ndarray, pontos: np.ndarray, n: int = 200,
                spp: int = SPP_MAPA, c: Coef = A.coef) -> tuple[np.ndarray, np.ndarray]:
    forma = x.shape
    x, v = x.ravel(), v.ravel()
    partes = fatias(x.size, OPERARIOS * 4)
    with ProcessPoolExecutor(OPERARIOS) as ex:
        res = list(ex.map(_classifica, [(x[s], v[s], pontos, n, spp, c) for s in partes]))
    return (np.concatenate([r[0] for r in res]).reshape(forma),
            np.concatenate([r[1] for r in res]).reshape(forma))


@em_cache
def bacias_a() -> dict:
    """Mapa do estado final do caso A (qual fase do ciclo) sobre uma grade de condições iniciais."""
    pontos = ciclo_a()["pontos"]
    saida = {}
    for nome, janela, n in (("geral", JANELA_BACIA, 900), ("zoom", JANELA_ZOOM, 700)):
        x, v = np.meshgrid(np.linspace(janela[0], janela[1], n), np.linspace(janela[2], janela[3], n))
        rotulo, _ = classificar(x, v, pontos, n=160)
        saida[f"rotulo_{nome}"] = rotulo.astype(np.int8)
        saida[f"janela_{nome}"] = np.array(janela)
    return saida


@em_cache
def incerteza_a() -> dict:
    """Fração de pares próximos com estado final diferente, em função da distância ε."""
    pontos = ciclo_a()["pontos"]
    rng = np.random.default_rng(SEMENTE)
    n = 40_000
    x = rng.uniform(-2, 2, n)
    v = rng.uniform(-2, 2, n)
    ang = rng.uniform(0, 2 * np.pi, n)
    rot0, tau = classificar(x, v, pontos)
    epsilons = 10.0 ** np.arange(-2, -13, -1)
    fracao, nao_class = [], [float(np.mean(rot0 < 0))]
    for eps in epsilons:
        rot1, _ = classificar(x + eps * np.cos(ang), v + eps * np.sin(ang), pontos)
        validos = (rot0 >= 0) & (rot1 >= 0)
        fracao.append(float(np.mean(rot0[validos] != rot1[validos])))
        nao_class.append(float(np.mean(rot1 < 0)))
    fracao = np.array(fracao)
    # f(ε) ~ ε^φ; ajuste só nas ε abaixo de 1e-3, região de escala.
    faixa = epsilons <= 1e-3
    phi, ln_f0 = np.polyfit(np.log(epsilons[faixa]), np.log(fracao[faixa]), 1)
    # Sobrevivência do transiente: P(τ > t) ~ exp(−κ t), ajustada na cauda.
    tempos = np.sort(tau)
    ts = np.arange(0, int(tau.max()) + 1)
    sobrev = 1 - np.searchsorted(tempos, ts, side="right") / tau.size
    cauda = (sobrev < 0.3) & (sobrev > 1e-3)
    kappa = -np.polyfit(ts[cauda] * A.T, np.log(sobrev[cauda]), 1)[0]
    return {"epsilons": epsilons, "fracao": fracao, "phi": phi, "f0": math.exp(ln_f0),
            "n_pares": n, "nao_classificados": max(nao_class), "tau": tau, "sobrev": sobrev,
            "kappa": kappa, "contagem_finais": np.bincount(rot0[rot0 >= 0], minlength=5)}


def _lyap(args):
    c, x, v, nd, nm, spp = args
    return lyapunov(c, x, v, nd, nm, spp)


@em_cache
def expoentes() -> dict:
    """λ1 e λ2 de cada caso forçado, com dispersão entre condições iniciais."""
    rng = np.random.default_rng(SEMENTE)
    saida = {}
    tarefas = []
    for chave, nd, nm, n in (("A", 400, 2000, 16), ("C", 400, 6000, 32), ("D", 200, 800, 8)):
        c = CASOS[chave].p.coef
        x, v = rng.uniform(-1.5, 1.5, n), rng.uniform(-1.5, 1.5, n)
        for s in fatias(n, 16):
            tarefas.append((chave, (c, x[s], v[s], nd, nm, PASSOS_POR_PERIODO)))
    with ProcessPoolExecutor(OPERARIOS) as ex:
        res = list(ex.map(_lyap, [t[1] for t in tarefas]))
    for chave in "ACD":
        l1 = np.concatenate([r[0] for r, t in zip(res, tarefas) if t[0] == chave])
        l2 = np.concatenate([r[1] for r, t in zip(res, tarefas) if t[0] == chave])
        saida[f"l1_{chave}"], saida[f"l2_{chave}"] = l1, l2
    return saida


def _bif(args):
    gam, x0, v0 = args
    c = Coef(0.3, -1.0, 1.0, gam, 1.2)
    s = estroboscopico(c, x0, v0, 500, spp=SPP_MAPA)[-120:]
    l1, _ = lyapunov(c, x0, v0, 200, 400, spp=SPP_MAPA)
    return s[..., 0].astype(np.float32), l1, periodo_detectado(s, tol=1e-4)


@em_cache
def bifurcacao() -> dict:
    gammas = np.linspace(0.20, 0.65, 901)
    ics = np.array([[1.0, 0.0], [-1.0, 0.0], [0.2, 0.8], [-0.6, -1.0]])
    gam = gammas[:, None]
    x0 = np.broadcast_to(ics[:, 0], (gammas.size, 4)).copy()
    v0 = np.broadcast_to(ics[:, 1], (gammas.size, 4)).copy()
    partes = fatias(gammas.size, OPERARIOS * 3)
    with ProcessPoolExecutor(OPERARIOS) as ex:
        res = list(ex.map(_bif, [(gam[s], x0[s], v0[s]) for s in partes]))
    return {"gammas": gammas, "x": np.concatenate([r[0] for r in res], axis=1),
            "lam": np.concatenate([r[1] for r in res]), "periodo": np.concatenate([r[2] for r in res])}


def _secao_longa(args):
    x, v = args
    return estroboscopico(C.coef, x, v, 1200, spp=100)[200:].reshape(-1, 2)


@em_cache
def atrator_c() -> dict:
    """Seção de Poincaré do caso C e o teste de que ela não depende de h."""
    rng = np.random.default_rng(SEMENTE)
    n = 1000
    x, v = rng.uniform(-1, 1, n), rng.uniform(-1, 1, n)
    # Fração em x > 0 considerando todos os instantes, não só t = nT.
    continua = integrar(C, x[:300], v[:300], 200 * C.T, h=C.T / 100, guardar_cada=7)
    fracao_todos = float(np.mean(continua.x[continua.t > 50 * C.T] > 0))
    grossa = estroboscopico(C.coef, x, v, 300, spp=100)[200:]
    partes = fatias(n, OPERARIOS)
    with ProcessPoolExecutor(OPERARIOS) as ex:
        densa = np.concatenate(list(ex.map(_secao_longa, [(x[s], v[s]) for s in partes]))).astype(np.float32)
    fina = estroboscopico(C.coef, x, v, 300, spp=200)[200:]
    return {"secao": grossa.reshape(-1, 2).astype(np.float32),
            "secao_fina": fina.reshape(-1, 2).astype(np.float32),
            "media_x2": float(np.mean(grossa[..., 0] ** 2)), "media_x2_fina": float(np.mean(fina[..., 0] ** 2)),
            "media_v2": float(np.mean(grossa[..., 1] ** 2)), "media_v2_fina": float(np.mean(fina[..., 1] ** 2)),
            "fracao_direita": float(np.mean(grossa[..., 0] > 0)), "fracao_todos": fracao_todos,
            "densa": densa}


@em_cache
def sensibilidade() -> dict:
    """Pares de trajetórias: o que diverge em A, o que converge em A, e o ensaio em C."""
    pontos = ciclo_a()["pontos"]
    eps_a = 1e-6
    # Varre x0 com v0 = 0, procurando pares que acabem em fases diferentes.
    x0 = np.round(np.arange(-2.0, 2.0 + 1e-9, 1e-3), 3)
    v0 = np.zeros_like(x0)
    r0, _ = classificar(x0, v0, pontos)
    r1, _ = classificar(x0 + eps_a, v0, pontos)
    separam = np.flatnonzero((r0 != r1) & (r0 >= 0) & (r1 >= 0))
    frac_varredura = separam.size / x0.size
    if separam.size == 0:
        raise RuntimeError("nenhum par sensível encontrado na varredura")
    # Critério simples e declarado: o primeiro x0 > 0 da varredura que separa.
    positivos = separam[x0[separam] > 0]
    i_sep = positivos[0] if positivos.size else separam[0]
    x_a = float(x0[i_sep])
    # O mesmo teste perturbando a velocidade inicial.
    r2, _ = classificar(x0, v0 + eps_a, pontos)
    separam_v = np.flatnonzero((r0 != r2) & (r0 >= 0) & (r2 >= 0))
    frac_v = separam_v.size / x0.size
    pos_v = separam_v[x0[separam_v] > 0]
    x_v = float(x0[pos_v[0] if pos_v.size else separam_v[0]])
    tmax = 60 * A.T
    h = A.T / PASSOS_POR_PERIODO
    v1, v2 = integrar(A, x_v, 0.0, tmax, h=h), integrar(A, x_v, eps_a, tmax, h=h)
    a1, a2 = integrar(A, x_a, 0.0, tmax, h=h), integrar(A, x_a + eps_a, 0.0, tmax, h=h)
    b1, b2 = integrar(A, 1.0, 0.0, tmax, h=h), integrar(A, 1.0 + eps_a, 0.0, tmax, h=h)
    eps_c = 1e-10
    c1, c2 = integrar(C, 1.0, 0.0, tmax, h=h), integrar(C, 1.0 + eps_c, 0.0, tmax, h=h)
    c3 = integrar(C, 1.0, eps_c, tmax, h=h)

    # Conjunto de pares já sobre o atrator de C: <ln Δ(t)> dá λ sem usar a equação variacional.
    rng = np.random.default_rng(SEMENTE)
    n = 4000
    x, v = rng.uniform(-1, 1, n), rng.uniform(-1, 1, n)
    base = estroboscopico(C.coef, x, v, 200, spp=100)[-1]
    ang = rng.uniform(0, 2 * np.pi, n)
    eps_ens = 1e-12
    s1 = estroboscopico(C.coef, base[:, 0], base[:, 1], 120)
    s2 = estroboscopico(C.coef, base[:, 0] + eps_ens * np.cos(ang), base[:, 1] + eps_ens * np.sin(ang), 120)
    d = np.linalg.norm(s1 - s2, axis=-1)
    d[d == 0] = eps_ens
    ln_d = np.mean(np.log(d), axis=1)
    t_ens = np.arange(ln_d.size) * C.T
    faixa = (ln_d > math.log(eps_ens) + 3) & (ln_d < math.log(1e-3))
    lam_ens = float(np.polyfit(t_ens[faixa], ln_d[faixa], 1)[0])
    # Incerteza: reamostragem dos pares e efeito da janela de ajuste.
    ln_todos = np.log(d)
    amostras = []
    for _ in range(400):
        escolha = rng.integers(0, n, n)
        amostras.append(np.polyfit(t_ens[faixa], np.mean(ln_todos[:, escolha], axis=1)[faixa], 1)[0])
    ic_ens = np.percentile(amostras, [2.5, 97.5])
    janelas = []
    for lo, hi in ((1e-11, 1e-3), (1e-10, 1e-4), (1e-9, 1e-5), (1e-8, 1e-3)):
        m = (ln_d > math.log(lo)) & (ln_d < math.log(hi))
        janelas.append(np.polyfit(t_ens[m], ln_d[m], 1)[0])

    # Horizonte numérico: a mesma condição inicial com h e h/2.
    h1 = integrar(C, 1.0, 0.0, tmax, h=h)
    h2 = integrar(C, 1.0, 0.0, tmax, h=h / 2, guardar_cada=2)
    d_h = np.hypot(h1.x - h2.x, h1.v - h2.v)
    t_h = float(h1.t[np.argmax(d_h > 0.1)]) if np.any(d_h > 0.1) else math.inf

    return {"t": a1.t, "eps_a": eps_a, "x_sep": x_a, "frac_varredura": frac_varredura,
            "a1x": a1.x, "a2x": a2.x, "a_d": np.hypot(a1.x - a2.x, a1.v - a2.v),
            "b_d": np.hypot(b1.x - b2.x, b1.v - b2.v),
            "eps_c": eps_c, "c1x": c1.x, "c2x": c2.x, "c_d": np.hypot(c1.x - c2.x, c1.v - c2.v),
            "t_ens": t_ens, "ln_d": ln_d, "lam_ens": lam_ens, "faixa_ens": faixa, "ic_ens": ic_ens,
            "janelas_ens": np.array(janelas), "x_v": x_v, "frac_v": frac_v,
            "v_d": np.hypot(v1.x - v2.x, v1.v - v2.v), "c_d_v": np.hypot(c1.x - c3.x, c1.v - c3.v),
            "eps_ens": eps_ens, "t_h": t_h, "d_h": d_h}


H_B = B.T / PASSOS_POR_PERIODO  # o limiar depende de h: bisseção e ensaios usam o mesmo passo


def _poco_final(x0, v0, tmax: float = 60 * B.T, h: float = H_B):
    """Sinal de x no fim: a qual poço a trajetória chegou. Guarda só o estado inicial e o final."""
    passos = math.ceil(tmax / h - 1e-9)
    return np.sign(integrar(B, x0, v0, tmax, h=h, guardar_cada=passos).x[-1])


def _fim_b(args):
    x, v = args
    return _poco_final(x, v)


@em_cache
def autonomo() -> dict:
    """Bacias dos dois poços, faixas de impulso e sensibilidade na separatriz."""
    n = 700
    xg, vg = np.meshgrid(np.linspace(-2.2, 2.2, n), np.linspace(-2.2, 2.2, n))
    partes = fatias(xg.size, OPERARIOS * 2)
    xr, vr = xg.ravel(), vg.ravel()
    with ProcessPoolExecutor(OPERARIOS) as ex:
        res = list(ex.map(_fim_b, [(xr[s], vr[s]) for s in partes]))
    poco = np.concatenate(res).reshape(xg.shape)

    # Bloco em repouso em x = 1 recebe um impulso J: J/m é a velocidade inicial.
    impulsos = np.linspace(0, 4, 8001)
    finais = _poco_final(np.ones_like(impulsos), impulsos)
    trocas = np.flatnonzero(finais[1:] != finais[:-1])
    limiares = []
    for i in trocas:
        a, b = impulsos[i], impulsos[i + 1]
        fa = _poco_final(1.0, a)
        for _ in range(45):
            m = 0.5 * (a + b)
            if _poco_final(1.0, m) == fa:
                a = m
            else:
                b = m
        limiares.append(0.5 * (a + b))
    limiares = np.array(limiares)
    eps = 1e-8
    v_c = float(limiares[0])
    tmax = 12 * B.T
    t1 = integrar(B, 1.0, v_c - eps, tmax, h=H_B)
    t2 = integrar(B, 1.0, v_c + eps, tmax, h=H_B)
    # Permanência perto da sela: ln(1/ε)/μ cresce devagar conforme o par se aproxima do limiar.
    eps_lista = 10.0 ** np.arange(-2, -11, -1)
    perm = []
    for e in eps_lista:
        tr = integrar(B, 1.0, v_c + e, 16 * B.T, h=H_B)
        perm.append(tr.t[np.flatnonzero(np.abs(tr.x) < 0.1)[-1]] if np.any(np.abs(tr.x) < 0.1) else np.nan)
    ramos = separatriz(B)
    return {"poco": poco.astype(np.int8), "impulsos": impulsos, "finais": finais.astype(np.int8),
            "limiares": limiares, "eps": eps, "t": t1.t, "x1": t1.x, "v1": t1.v, "x2": t2.x, "v2": t2.v,
            "eps_lista": eps_lista, "permanencia": np.array(perm), "sep0": ramos[0], "sep1": ramos[1],
            "fracao_direita": float(np.mean(poco > 0))}


@em_cache
def poco_unico() -> dict:
    """Amplitude do regime permanente de D contra o balanço harmônico de 1a ordem."""
    p = D
    tr = integrar(p, 1.0, 0.0, 80 * p.T, h=p.T / PASSOS_POR_PERIODO)
    regime = tr.t > 300.0
    amp = 0.5 * (tr.x[regime].max() - tr.x[regime].min())
    ultimos = tr.t > tr.t[-1] - 5 * p.T - 1e-9
    t_r, x_r = tr.t[ultimos][:-1], tr.x[ultimos][:-1]
    harm = [amplitude_harmonica(t_r, x_r, n * p.omega) for n in (1, 2, 3, 5)]
    d, a, b, g, w = p.coef
    # y = amplitude²: y[(α + ¾βy − ω²)² + (δω)²] = γ²  é cúbica em y.
    q = 0.75 * b
    s = a - w * w
    raizes = np.roots([q * q, 2 * q * s, s * s + (d * w) ** 2, -g * g])
    reais = raizes[np.abs(raizes.imag) < 1e-9].real
    reais = reais[reais > 0]
    amp_bh = np.sqrt(reais)
    rng = np.random.default_rng(SEMENTE)
    x, v = rng.uniform(-3, 3, 400), rng.uniform(-3, 3, 400)
    s_ = estroboscopico(p.coef, x, v, 300, spp=100)
    finais = s_[-1]
    return {"amp": amp, "amp_bh": amp_bh, "harm": np.array(harm), "dispersao_final": float(np.max(np.std(finais, axis=0))),
            "periodo": periodo_detectado(s_[-64:], tol=1e-5), "n_ics": 400}


@em_cache
def convergencia() -> dict:
    """Erro global contra a referência DOP853 e fechamento do balanço de energia, por passo."""
    from scipy.integrate import simpson, solve_ivp

    d, a, b, g, w = C.coef
    f = lambda t, y: [y[1], g * np.cos(w * t) - d * y[1] - a * y[0] - b * y[0] ** 3]  # noqa: E731
    tmax = 20.0
    ref = solve_ivp(f, (0, tmax), [1.0, 0.0], method="DOP853", rtol=1e-13, atol=1e-14).y[:, -1]
    hs = np.array([0.16, 0.08, 0.04, 0.02, 0.01, 0.005, 0.0025])
    erro, fecho = [], []
    for h in hs:
        tr = integrar(C, 1.0, 0.0, tmax, h=h)
        erro.append(math.hypot(tr.x[-1] - ref[0], tr.v[-1] - ref[1]))
        pot = -C.c * tr.v**2 + C.forca(tr.t) * tr.v
        ctr = C.energia(tr.x[-1], tr.v[-1]) - C.energia(1.0, 0.0) - simpson(pot, x=tr.t)
        fecho.append(abs(ctr))
    erro, fecho = np.array(erro), np.array(fecho)
    return {"hs": hs, "erro": erro, "fecho": fecho, "ordens": np.log2(erro[:-1] / erro[1:]),
            "h_padrao": C.T / PASSOS_POR_PERIODO}


@em_cache
def floquet_casos() -> dict:
    # Os casos D e E têm período 1, e A tem período 5.
    saida = {}
    zA, muA, resA = orbita_periodica(A.coef, *ciclo_a()["pontos"][0], 5, spp=400)
    s = estroboscopico(D.coef, 1.0, 0.0, 200)[-1]
    zD, muD, resD = orbita_periodica(D.coef, s[0], s[1], 1, spp=400)
    saida.update(zA=zA, muA=muA, resA=resA, zD=zD, muD=muD, resD=resD)
    pts = []
    for i, x0 in enumerate((1.0, -1.0)):
        s = estroboscopico(E.coef, x0, 0.0, 200)[-1]
        z, mu, res = orbita_periodica(E.coef, s[0], s[1], 1, spp=400)
        saida[f"zE{i}"], saida[f"muE{i}"], saida[f"resE{i}"] = z, mu, res
        pts.append(z)
    saida["pontosE"] = np.array(pts)
    return saida


def _distancia_espelho(c: Coef, z: np.ndarray, n: int) -> float:
    # Distância entre a órbita em t = nT e a órbita espelhada, meio período depois.
    x, v = float(z[0]), float(z[1])
    h = 2 * math.pi / c.omega / PASSOS_POR_PERIODO
    pontos, espelho = [z.copy()], []
    for k in range(n * PASSOS_POR_PERIODO):
        x, v = passo_rk4(k * h, x, v, h, c)
        if (k + 1) % PASSOS_POR_PERIODO == 0:
            pontos.append(np.array([x, v]))
        if (k + 1) % PASSOS_POR_PERIODO == PASSOS_POR_PERIODO // 2:
            espelho.append(np.array([-x, -v]))
    p = np.array(pontos[:n])
    return max(float(np.min(np.hypot(*(p - s).T))) for s in espelho)


def _continuar(args):
    z0, gs = args
    z, linhas = np.array(z0), []
    for g in gs:
        c = Coef(0.3, -1.0, 1.0, float(g), 1.2)
        z, mu, res = orbita_periodica(c, z[0], z[1], 5)
        linhas.append([g, mu.real.max() if np.all(np.abs(mu.imag) < 1e-12) else np.nan, np.max(np.abs(mu)),
                       res, _distancia_espelho(c, z, 5)])
    return linhas


def _mu_menos_um(g: float, z0: np.ndarray) -> float:
    c = Coef(0.3, -1.0, 1.0, float(g), 1.2)
    z, mu, _ = orbita_periodica(c, z0[0], z0[1], 5)
    return float(np.max(np.abs(mu)) - 1)


@em_cache
def janela_p5() -> dict:
    # Continua a órbita simétrica do caso A em gamma e mede onde ela perde estabilidade.
    from scipy.optimize import brentq

    z0 = np.array(floquet_casos()["zA"])
    desce = np.arange(0.3700, 0.3459, -0.0005)
    sobe = np.arange(0.3700, 0.3861, 0.0005)
    with ProcessPoolExecutor(2) as ex:
        a, b = list(ex.map(_continuar, [(z0, desce), (z0, sobe)]))
    tabela = np.array(a[::-1] + b[1:])
    g, mod = tabela[:, 0], tabela[:, 2]
    def cruzamento(lista):
        arr = np.array(lista)
        i = np.flatnonzero(arr[:, 2] > 1)[0]
        return arr[i - 1, 0], arr[i, 0]
    # Reacha o ponto inicial mais próximo por continuação e refina o cruzamento de |mu| = 1.
    limites = []
    for lista, gs in ((a, desce), (b, sobe)):
        g0, g1 = cruzamento(lista)
        z = z0.copy()
        for gg in gs:
            if (gg - g0) * (gs[1] - gs[0]) > 1e-12:
                break
            z, _, _ = orbita_periodica(Coef(0.3, -1.0, 1.0, float(gg), 1.2), z[0], z[1], 5)
        limites.append(brentq(_mu_menos_um, min(g0, g1), max(g0, g1), args=(z,), xtol=1e-6))
    return {"tabela": tabela, "g_baixo": min(limites), "g_alto": max(limites),
            "espelho_max": float(np.max(tabela[:, 4]))}


def _zoom(args):
    gam = args
    ics = np.array([[1.0, 0.0], [-1.0, 0.0], [0.2, 0.8], [-0.6, -1.0]])
    g = gam[:, None]
    x0 = np.broadcast_to(ics[:, 0], (gam.size, 4)).copy()
    v0 = np.broadcast_to(ics[:, 1], (gam.size, 4)).copy()
    c = Coef(0.3, -1.0, 1.0, g, 1.2)
    s = estroboscopico(c, x0, v0, 1000, spp=SPP_MAPA)[-240:]
    l1, _ = lyapunov(c, s[-1, ..., 0], s[-1, ..., 1], 0, 600, spp=SPP_MAPA)
    return s[-120:].astype(np.float32), l1, periodo_detectado(s, tol=1e-4)


@em_cache
def zoom_bifurcacao() -> dict:
    gammas = np.linspace(0.34, 0.39, 401)
    partes = np.array_split(gammas, OPERARIOS * 2)
    with ProcessPoolExecutor(OPERARIOS) as ex:
        res = list(ex.map(_zoom, partes))
    return {"gammas": gammas, "s": np.concatenate([r[0] for r in res], axis=1),
            "lam": np.concatenate([r[1] for r in res]), "periodo": np.concatenate([r[2] for r in res])}


def _varre(gs):
    x, v = 1.0, 0.0
    saida = []
    for g in gs:
        c = Coef(0.3, -1.0, 1.0, float(g), 1.2)
        s = estroboscopico(c, x, v, 160, spp=SPP_MAPA)
        x, v = float(s[-1, 0]), float(s[-1, 1])
        saida.append((s[-40:, 0].astype(np.float32), int(periodo_detectado(s[-40:], tol=1e-4, maximo=20))))
    return np.array([a for a, _ in saida]), np.array([b for _, b in saida])


@em_cache
def varredura() -> dict:
    # Varre gamma nos dois sentidos carregando o estado: revela histerese e coexistência.
    gs = np.linspace(0.20, 0.65, 451)
    with ProcessPoolExecutor(2) as ex:
        (xs, ps), (xd, pd) = list(ex.map(_varre, [gs, gs[::-1]]))
    return {"gammas": gs, "x_sobe": xs, "per_sobe": ps, "x_desce": xd[::-1], "per_desce": pd[::-1]}


def _sela(c: Coef, z: np.ndarray):
    z2, mu, res = orbita_periodica(c, z[0], z[1], 1, spp=400)
    _, J = mapa_e_jacobiana(c, z2[0], z2[1], 1, spp=400)
    w, V = np.linalg.eig(J)
    return z2, w, V


def _mapa_truncado(c: Coef, x, v, sinal: int, spp: int = PASSOS_POR_PERIODO):
    h = sinal * 2 * math.pi / c.omega / spp
    with np.errstate(all="ignore"):
        for k in range(spp):
            x, v = passo_rk4(k * h, x, v, h, c)
            fora = (np.abs(x) > 5) | (np.abs(v) > 6) | ~np.isfinite(x) | ~np.isfinite(v)
            x, v = np.where(fora, np.nan, x), np.where(fora, np.nan, v)
    return x, v


def _ramos(c: Coef, z, vec, mult: float, iteracoes: int, sinal: int, n: int = 40_000) -> list[np.ndarray]:
    # Itera um domínio fundamental junto à sela. Cada linha é um arco da variedade.
    arcos = []
    for lado in (1, -1):
        p = 1e-4 * mult ** np.linspace(0, 1, n)
        x, v = z[0] + lado * p * vec[0], z[1] + lado * p * vec[1]
        for _ in range(iteracoes):
            x, v = _mapa_truncado(c, x, v, sinal)
            arcos.append(np.column_stack([x, v]))
    return arcos


def _segmentos(arcos: list[np.ndarray], maximo: float = 0.03) -> np.ndarray:
    s = np.concatenate([np.stack([a[:-1], a[1:]], axis=1) for a in arcos])
    comprimento = np.hypot(*(s[:, 1] - s[:, 0]).T)
    return s[np.isfinite(comprimento) & (comprimento < maximo)]


def _cruzamentos(U: np.ndarray, S: np.ndarray) -> np.ndarray:
    from scipy.spatial import cKDTree

    pares = cKDTree(U.mean(axis=1)).query_ball_tree(cKDTree(S.mean(axis=1)), r=0.035)
    ia = np.repeat(np.arange(len(pares)), [len(p) for p in pares])
    if ia.size == 0:
        return np.empty((0, 2))
    ib = np.concatenate([np.array(p, dtype=int) for p in pares])
    p, r, q, s = U[ia, 0], U[ia, 1] - U[ia, 0], S[ib, 0], S[ib, 1] - S[ib, 0]
    d = r[:, 0] * s[:, 1] - r[:, 1] * s[:, 0]
    e = q - p
    with np.errstate(all="ignore"):
        t = (e[:, 0] * s[:, 1] - e[:, 1] * s[:, 0]) / d
        u = (e[:, 0] * r[:, 1] - e[:, 1] * r[:, 0]) / d
    m = (t >= 0) & (t < 1) & (u >= 0) & (u < 1)
    return p[m] + t[m, None] * r[m]


def _variedade(args):
    g, z, w, V = args
    c = Coef(0.3, -1.0, 1.0, g, 1.2)
    iu = int(np.argmax(np.abs(w)))
    U = _ramos(c, z, V[:, iu].real, abs(w[iu]), 2, 1)
    S = _ramos(c, z, V[:, 1 - iu].real, 1 / abs(w[1 - iu]), 2, -1)
    p = _cruzamentos(_segmentos(U), _segmentos(S))
    if len(p):
        p = p[np.hypot(*(p - z).T) > 0.05]
    return g, len(p), U, S, z


@em_cache
def variedades() -> dict:
    gs = [0.05, 0.10, 0.15, 0.18, 0.20, 0.22, 0.24, 0.25, 0.251, 0.252, 0.253, 0.254, 0.255, 0.26, 0.27,
          0.28, 0.30, 0.33, 0.37]
    z = np.zeros(2)
    tarefas = []
    for g in gs:  # continuação: a sela se desloca pouco de um gamma para o outro
        z, w, V = _sela(Coef(0.3, -1.0, 1.0, g, 1.2), z)
        tarefas.append((g, z.copy(), w, V))
    with ProcessPoolExecutor(OPERARIOS) as ex:
        res = list(ex.map(_variedade, tarefas))
    saida = {"gammas": np.array(gs), "n": np.array([r[1] for r in res]),
             "g_c": gamma_melnikov(0.3, 1.2), "multiplicador": np.array([np.max(np.abs(t[2])) for t in tarefas])}
    for r in res:
        if r[0] in (0.20, 0.37):
            chave = f"{int(round(r[0] * 100))}"
            for nome, arcos in (("U", r[2]), ("S", r[3])):
                # Quebra as linhas em saltos, para o gráfico não ligar pontos distantes.
                for i, a in enumerate(arcos):
                    d = np.hypot(*(a[1:] - a[:-1]).T)
                    b = a.copy().astype(np.float32)
                    b[1:][~(d < 0.15)] = np.nan
                    saida[f"{nome}{chave}_{i}"] = b[::4]
            saida[f"z{chave}"] = r[4]
    return saida


@em_cache
def controle_incerteza() -> dict:
    # Fronteira esperada lisa: gamma abaixo do limiar de Melnikov, dois atratores distintos.
    saida = {}
    for rotulo, g in (("15", 0.15), ("20", 0.20)):
        c = Coef(0.3, -1.0, 1.0, g, 1.2)
        pts = np.array([estroboscopico(c, x, 0.0, 300, spp=SPP_MAPA)[-1] for x in (1.0, -1.0)])
        rng = np.random.default_rng(SEMENTE)
        n = 40_000
        x, v, ang = rng.uniform(-2, 2, n), rng.uniform(-2, 2, n), rng.uniform(0, 2 * np.pi, n)
        r0, _ = classificar(x, v, pts, n=120, c=c)
        eps = 10.0 ** np.arange(-2, -7, -1)
        f = []
        for e in eps:
            r1, _ = classificar(x + e * np.cos(ang), v + e * np.sin(ang), pts, n=120, c=c)
            f.append(float(np.mean(r0 != r1)))
        f = np.array(f)
        m = f * n >= 10  # só onde há contagem suficiente
        saida[f"f{rotulo}"], saida[f"phi{rotulo}"] = f, np.polyfit(np.log(eps[m]), np.log(f[m]), 1)[0]
        saida[f"nfit{rotulo}"] = int(m.sum())
        saida[f"nao_class{rotulo}"] = float(np.mean(r0 < 0))
        saida["eps"] = eps
    saida["n"] = 40_000
    return saida


@em_cache
def bacias_e() -> dict:
    # Mapa das bacias dos dois atratores do caso E e medidas de integridade.
    pts = floquet_casos()["pontosE"]
    n = 800
    x, v = np.meshgrid(np.linspace(-2, 2, n), np.linspace(-2, 2, n))
    rotulo, _ = classificar(x, v, pts, n=120, c=E.coef)
    medidas = []
    for i in range(2):
        outro = (rotulo != i)
        d = np.hypot(x - pts[i, 0], v - pts[i, 1])
        coluna = np.argmin(np.abs(x[0] - pts[i, 0]))
        acima = v[:, coluna] > pts[i, 1]
        vel_sobe = np.min(np.abs(v[:, coluna] - pts[i, 1])[acima & outro[:, coluna]])
        vel_desce = np.min(np.abs(v[:, coluna] - pts[i, 1])[~acima & outro[:, coluna]])
        medidas.append([np.mean(rotulo == i), np.min(d[outro]), min(vel_sobe, vel_desce)])
    return {"rotulo": rotulo.astype(np.int8), "medidas": np.array(medidas), "pontos": pts}


@em_cache
def integridade_b() -> dict:
    # Mesmas medidas no caso autônomo: área, distância à fronteira e impulso admissível nos dois sentidos.
    r = autonomo()
    sep = np.concatenate([r["sep0"], r["sep1"]])
    v_negativo = -np.linspace(0, 4, 8001)
    finais = _poco_final(np.ones_like(v_negativo), v_negativo)
    return {"area": float(np.mean(r["poco"] > 0)), "local": float(np.min(np.hypot(sep[:, 0] - 1, sep[:, 1]))),
            "v_sobe": float(r["limiares"][0]), "v_desce": float(-v_negativo[np.argmax(finais < 0)])}


def _lam_passo(args):
    spp, semente = args
    rng = np.random.default_rng(semente)
    return lyapunov(C.coef, rng.uniform(-1, 1, 4), rng.uniform(-1, 1, 4), 300, 2000, spp)[0]


@em_cache
def lambda_passos() -> dict:
    # O lambda do caso C não pode depender do passo.
    passos = (100, 200, 400)
    with ProcessPoolExecutor(OPERARIOS) as ex:
        r = list(ex.map(_lam_passo, [(p, s) for p in passos for s in range(4)]))
    r = np.array(r).reshape(3, -1)
    return {"passos": np.array(passos), "media": r.mean(axis=1), "ep": r.std(axis=1) / math.sqrt(r.shape[1])}


def _sobrevive(semente):
    # Tangente junto com o estado. Usado no caso A para medir lambda só durante o transiente.
    c = A.coef
    pontos = ciclo_a()["pontos"]
    rng = np.random.default_rng(semente)
    n, spp, periodos = 2000, 100, 45
    T, h = A.T, A.T / spp
    y = np.zeros((6, n))
    y[0], y[1], y[2], y[5] = rng.uniform(-2, 2, n), rng.uniform(-2, 2, n), 1.0, 1.0
    logs, dist = np.zeros((periodos, n)), np.zeros((periodos, n))
    for m in range(periodos):
        for k in range(spp):
            t = (m + k / spp) * T
            k1 = _campo_tangente(t, y, c)
            k2 = _campo_tangente(t + h / 2, y + h / 2 * k1, c)
            k3 = _campo_tangente(t + h / 2, y + h / 2 * k2, c)
            k4 = _campo_tangente(t + h, y + h * k3, c)
            y = y + h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        norma = np.hypot(y[2], y[3])
        y[2] /= norma
        y[3] /= norma
        logs[m] = np.log(norma)
        dist[m] = np.min(np.hypot(pontos[:, 0][:, None] - y[0], pontos[:, 1][:, None] - y[1]), axis=0)
    return logs, dist


@em_cache
def transiente_a() -> dict:
    # Maior expoente de Lyapunov das trajetórias ainda fora do ciclo.
    with ProcessPoolExecutor(OPERARIOS) as ex:
        res = list(ex.map(_sobrevive, range(SEMENTE, SEMENTE + 16)))
    logs = np.concatenate([r[0] for r in res], axis=1)
    dist = np.concatenate([r[1] for r in res], axis=1)
    fora = dist > 0.05
    tau = np.where(fora.any(axis=0), fora.shape[0] - np.argmax(fora[::-1], axis=0), 0)
    ini, fim, margem = 5, 25, 3
    vivos = tau >= fim + margem
    val = logs[ini:fim, vivos].sum(axis=0) / ((fim - ini) * A.T)
    return {"lam": float(val.mean()), "ep": float(val.std() / math.sqrt(val.size)), "n": int(vivos.sum()),
            "ini": ini, "fim": fim, "n_total": logs.shape[1]}


@em_cache
def espectros() -> dict:
    # Amplitude de Fourier em regime. Períodos inteiros em A e D; média com janela Hann em C.
    saida = {}
    for chave, p, x0 in (("A", A, 1.0), ("D", D, 1.0)):
        tr = integrar(p, x0, 0.0, 600 * p.T, h=p.T / 256, guardar_cada=2)
        x = tr.x[tr.t > 200 * p.T - 1e-9][:-1]
        amp = 2 * np.abs(np.fft.rfft(x)) / x.size
        saida[f"f{chave}"] = np.fft.rfftfreq(x.size, d=2 * p.T / 256) * p.T
        saida[f"a{chave}"] = amp
    rng = np.random.default_rng(SEMENTE)
    x0, v0 = rng.uniform(-1, 1, 64), rng.uniform(-1, 1, 64)
    tr = integrar(C, x0, v0, 600 * C.T, h=C.T / 256, guardar_cada=2)
    x = tr.x[tr.t > 200 * C.T - 1e-9][:-1]
    janela = np.hanning(x.shape[0])[:, None]
    amp = np.sqrt(np.mean(np.abs(np.fft.rfft(x * janela, axis=0)) ** 2, axis=1)) * 2 / janela.sum()
    saida["fC"] = np.fft.rfftfreq(x.shape[0], d=2 * C.T / 256) * C.T
    saida["aC"] = amp
    return saida


def _rota(g: float) -> list:
    c = Coef(0.3, -1.0, 1.0, g, 1.2)
    s = estroboscopico(c, 1.0, 0.0, 1500, spp=PASSOS_POR_PERIODO)
    p = int(periodo_detectado(s[-300:], tol=1e-5, maximo=64))
    if p == 0:
        return [g, 0, np.nan, np.nan, np.nan]
    z, mu, res = orbita_periodica(c, s[-1, 0], s[-1, 1], p)
    return [g, p, float(np.max(np.abs(mu))), float(mu[np.argmax(np.abs(mu))].real), _distancia_espelho(c, z, p)]


@em_cache
def rota_janela() -> dict:
    # Órbita atratora perto das pontas da janela: período, multiplicador e simetria.
    gs = [0.3440, 0.3470, 0.3485, 0.3495, 0.3505, 0.3515, 0.3525, 0.3600, 0.3700, 0.3740, 0.3755, 0.3770, 0.3785,
          0.3800, 0.3805, 0.3810, 0.3815]
    with ProcessPoolExecutor(OPERARIOS) as ex:
        return {"tabela": np.array(list(ex.map(_rota, gs)))}


def tudo() -> dict:
    return {f.__name__: f() for f in FUNCOES}


FUNCOES = (ciclo_a, floquet_casos, convergencia, poco_unico, expoentes, atrator_c, autonomo, integridade_b,
           bifurcacao, zoom_bifurcacao, janela_p5, rota_janela, varredura, variedades, controle_incerteza, bacias_e,
           transiente_a, espectros, lambda_passos, incerteza_a, sensibilidade, bacias_a)


if __name__ == "__main__":
    import time

    for f in FUNCOES:
        t = time.time()
        f()
        print(f"{f.__name__}: {time.time() - t:.0f} s", flush=True)
