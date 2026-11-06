"""Relatório em PDF: resultados → números formatados → template LaTeX (jinja2) → tectonic.

Todo número do texto sai deste módulo. As asserções de ``conferir_afirmacoes`` param a geração
se um resultado deixar de sustentar uma frase escrita no template.
"""

from __future__ import annotations

import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from . import analise, figuras, verificacao
from .casos import CASOS
from .estilo import COR_CASO

RAIZ = Path(__file__).resolve().parent.parent
BUILD = RAIZ / "build"


def M(x: float, n: int = 3) -> str:
    """Número para modo matemático, com n algarismos significativos e vírgula decimal."""
    x = float(x)
    if x == 0:
        return "0"
    exp = math.floor(math.log10(abs(x)))
    if -4 <= exp < 6:
        casas = max(n - 1 - exp, 0)
        texto = f"{x:.{casas}f}".replace(".", "{,}")
        return texto
    mant, expo = f"{x:.{max(n - 1, 0)}e}".split("e")  # deixa o printf decidir o arredondamento
    return rf"{mant.replace('.', '{,}')}\times 10^{{{int(expo)}}}"


def F(x: float, casas: int) -> str:
    """Número com um total fixo de casas decimais, para colunas e contas passo a passo."""
    return f"{float(x):.{casas}f}".replace(".", "{,}")


def P(x: float, casas: int = 1) -> str:
    """Fração como porcentagem (sem o sinal de %)."""
    return F(100 * x, casas)


def primeiro_acima(t: np.ndarray, d: np.ndarray, limite: float = 0.1) -> float:
    i = np.flatnonzero(d > limite)
    return float(t[i[0]]) if i.size else math.inf


def fracao_ws_na_fronteira(res: dict) -> float:
    """Fração dos pontos de W^s (gamma = 0,20) a até 2 pixels de uma troca de bacia no mapa do caso E."""
    from scipy import ndimage

    rot, vd = res["bacias_e"]["rotulo"], res["variedades"]
    n = rot.shape[0]
    borda = (ndimage.maximum_filter(rot, size=5) != ndimage.minimum_filter(rot, size=5))
    pts = np.concatenate([vd[k] for k in vd if k.startswith("S20_")])
    pts = pts[np.isfinite(pts).all(axis=1) & (np.abs(pts) < 1.99).all(axis=1)]
    ix = np.round((pts[:, 0] + 2) / 4 * (n - 1)).astype(int)
    iy = np.round((pts[:, 1] + 2) / 4 * (n - 1)).astype(int)
    return float(np.mean(borda[iy, ix]))


def montar_numeros(res: dict, info: dict) -> dict:
    A, B, C, D, E = (CASOS[k].p for k in "ABCDE")
    T = A.T
    exp, inc, sen, aut, und, atr, bif, cic, con = (res[k] for k in (
        "expoentes", "incerteza_a", "sensibilidade", "autonomo", "poco_unico", "atrator_c", "bifurcacao",
        "ciclo_a", "convergencia"))
    r: dict = {}
    r["T"] = M(T, 4)
    r["T5"] = M(5 * T, 4)
    r["h"] = M(T / 200, 4)
    # Lyapunov
    for k in "ACD":
        l1, l2 = exp[f"l1_{k}"], exp[f"l2_{k}"]
        r[f"l1_{k}"] = M(np.mean(l1), 3)
        r[f"l2_{k}"] = M(np.mean(l2), 3)
        r[f"l1_{k}_dp"] = M(np.std(l1), 1)
        r[f"soma_{k}"] = M(np.mean(l1 + l2), 4)
        r[f"n_{k}"] = l1.size
    l1c, l2c = float(np.mean(exp["l1_C"])), float(np.mean(exp["l2_C"]))
    r["dky"] = M(1 + l1c / abs(l2c), 3)
    r["t_pred"] = M(math.log(1e16) / l1c, 2)
    r["t_dobra"] = M(math.log(2) / l1c, 2)
    r["lam_ens"] = M(sen["lam_ens"], 3)
    r["t_h"] = M(sen["t_h"], 2)
    # Caso A
    r["t_trans_A"] = M(info["t_trans_A"], 2)
    tau = inc["tau"]
    r["tau_mediana"] = M(np.median(tau), 2)
    r["tau_mediana_s"] = M(np.median(tau) * T, 3)
    r["tau_p99"] = M(np.percentile(tau, 99), 2)
    r["tau_max"] = M(np.max(tau), 2)
    r["kappa"] = M(inc["kappa"], 2)
    r["vida"] = M(1 / float(inc["kappa"]), 2)
    r["n_pares"] = f"{int(inc['n_pares']):_}".replace("_", r"\,")
    eps, fr = inc["epsilons"], inc["fracao"]
    for e, f in zip(eps, fr):
        r[f"f{int(round(-math.log10(e)))}"] = P(f)
    r["tabela_inc"] = [(int(round(math.log10(e))), P(f)) for e, f in zip(eps, fr)]
    r["phi"] = M(inc["phi"], 2)
    r["dim"] = M(2 - float(inc["phi"]), 2)
    r["fator_f"] = M(10 ** (8 * float(inc["phi"])), 2)
    r["nao_class"] = P(inc["nao_classificados"], 2)
    cf = inc["contagem_finais"] / np.sum(inc["contagem_finais"])
    r["fase_min"], r["fase_max"] = P(cf.min()), P(cf.max())
    r["dist_espelho"] = M(cic["dist_espelho"], 1)
    r["x_sep"] = f"{float(sen['x_sep']):g}".replace(".", "{,}")
    r["frac_varredura"] = P(sen["frac_varredura"])
    r["ta_sep"] = M(primeiro_acima(sen["t"], sen["a_d"]), 2)
    r["a_d_fim"] = M(np.mean(sen["a_d"][sen["t"] > 200]), 2)
    r["a_d_max"] = M(np.max(sen["a_d"]), 2)
    r["b_d_max"] = M(np.max(sen["b_d"]), 1)
    r["b_d_fim"] = M(max(float(sen["b_d"][-1]), 1e-16), 1)
    # Caso B
    lim = aut["limiares"]
    r["n_lim"] = lim.size
    r["lim"] = [M(v, 4) for v in lim[:6]]
    r["v_c"] = M(lim[0], 6)
    r["v_barreira"] = M(math.sqrt(0.5), 3)
    r["larguras"] = [M(b - a, 3) for a, b in zip(lim[:5], lim[1:6])]
    r["finais_B"] = ["+1" if v > 0 else "-1" for v in info["finais_B"]]
    r["tabela_B"] = [dict(v0=F(v0, 1), E0=F(B.energia(x0, v0), 3), fim=f)
                     for (x0, v0), f in zip(CASOS["B"].condicoes, r["finais_B"])]
    r["E_lim"] = F(B.energia(1.0, lim[0]), 3)
    r["mu"] = M((-0.3 + math.sqrt(4.09)) / 2, 3)
    r["mu_neg"] = M((-0.3 - math.sqrt(4.09)) / 2, 3)
    r["wd"] = M(math.sqrt(8 - 0.09) / 2, 3)
    r["tau_poco"] = M(1 / 0.15, 3)
    perm, el = aut["permanencia"], aut["eps_lista"]
    inc_perm = np.polyfit(np.log(1 / el), perm, 1)[0]
    r["perm_inc"] = M(inc_perm, 3)
    r["perm_teo"] = M(1 / ((-0.3 + math.sqrt(4.09)) / 2), 3)
    r["perm8"] = M(perm[np.argmin(np.abs(el - aut["eps"]))], 2)
    r["frac_dir_B"] = P(aut["fracao_direita"])
    # Caso C
    r["tc_sep"] = M(primeiro_acima(sen["t"], sen["c_d"]), 2)
    r["c_d_fim"] = M(np.mean(sen["c_d"][sen["t"] > 200]), 2)
    r["frac_dir_C"] = P(atr["fracao_direita"])
    r["frac_todos_C"] = P(atr["fracao_todos"])
    r["dif_x2"] = F(100 * abs(float(atr["media_x2"]) - float(atr["media_x2_fina"])) / float(atr["media_x2_fina"]), 1)
    r["dif_lam"] = F(100 * abs(float(np.mean(exp["l1_C"])) - float(sen["lam_ens"])) / float(np.mean(exp["l1_C"])), 0)
    r["x2_h"], r["x2_h2"] = M(atr["media_x2"], 4), M(atr["media_x2_fina"], 4)
    r["v2_h"], r["v2_h2"] = M(atr["media_v2"], 4), M(atr["media_v2_fina"], 4)
    # Caso D
    r["amp"], r["amp_bh"] = M(und["amp"], 4), M(und["amp_bh"][0], 4)
    r["n_d"] = int(und["n_ics"])
    r["disp_d"] = M(und["dispersao_final"], 1)
    r["t_trans_D"] = M(info["t_trans_D"], 2)
    # Verificação
    r["ordem"] = M(con["ordens"][-1], 3)
    r["erro_h"] = M(math.exp(np.interp(np.log(T / 200), np.log(con["hs"][::-1]), np.log(con["erro"][::-1]))), 1)
    r["linhas"] = [dict(afirmacao=l.afirmacao, medido=M(l.medido, 3 if i == 0 else 2), limite=M(l.limite, 1), unidade=l.unidade)
                   for i, l in enumerate(verificacao.linhas(con["ordens"]))]
    r["literatura"] = [dict(gamma=F(g, 2), alvo=a, medido=m) for g, a, m in verificacao.periodos_da_literatura()]
    passo = verificacao.passo_a_mao()
    r["passo"] = {k: F(v, 8) for k, v in passo.items()}
    # Bifurcação
    g, lam = bif["gammas"], bif["lam"]
    r["frac_caos"] = P(np.mean(np.max(lam, axis=1) > 0.01), 0)
    i37 = np.argmin(np.abs(g - 0.37))
    # Janela periódica contínua ao redor de 0,37 em que todas as condições iniciais dão período 5.
    p5 = np.all(bif["periodo"] == 5, axis=1)
    a, b = i37, i37
    while a > 0 and p5[a - 1]:
        a -= 1
    while b < g.size - 1 and p5[b + 1]:
        b += 1
    r["janela_a"], r["janela_b"] = F(g[a], 3), F(g[b], 3)
    r["lam_bif_37"] = M(np.median(lam[i37]), 3)
    r["ws_ok"] = F(100 * fracao_ws_na_fronteira(res), 1)
    # Revisão: Floquet, janela, variedades, controle, transiente, integridade, espectros
    flo, jan, rota, vd, var, ctl, tra, be, ib, lp, esp = (res[k] for k in (
        "floquet_casos", "janela_p5", "rota_janela", "variedades", "varredura", "controle_incerteza", "transiente_a",
        "bacias_e", "integridade_b", "lambda_passos", "espectros"))
    mu = np.sort(np.abs(flo["muA"]))
    r["mu1"], r["mu2"] = M(mu[1], 4), M(mu[0], 3)
    r["res_A"] = M(flo["resA"], 1)
    r["mod_muD"] = M(abs(flo["muD"][0]), 4)
    r["e_dT"] = M(math.exp(-0.15 * T), 4)
    r["lam_E"] = M(math.log(abs(flo["muE0"][0])) / T, 3)
    r["l1_D_exato"] = M(math.log(abs(flo["muD"][0])) / T, 4)
    r["g_baixo"], r["g_alto"] = F(jan["g_baixo"], 4), F(jan["g_alto"], 4)
    r["esp_jan"] = M(jan["espelho_max"], 1)
    tab = rota["tabela"]
    linha = lambda g: tab[np.argmin(np.abs(tab[:, 0] - g))]  # noqa: E731
    r["rota"] = [dict(g=F(l[0], 4), p=("caos" if l[1] == 0 else f"{int(l[1])}"), mu=(r"\text{--}" if l[1] == 0 else F(l[3], 3)),
                      esp=("--" if l[1] == 0 else ("S" if l[4] < 1e-9 else "A")))
                 for l in tab if round(float(l[0]), 4) in (0.3440, 0.3485, 0.3495, 0.3515, 0.3525, 0.3700, 0.3740, 0.3755, 0.3785, 0.3810, 0.3815)]
    p5_sim = F(linha(0.37)[3], 3)
    r["mu_rota_37"] = p5_sim
    r["var_dif"] = P(np.mean(var["per_sobe"] != var["per_desce"]))
    r["var_n"] = int(np.sum(var["per_sobe"] != var["per_desce"]))
    r["var_total"] = var["gammas"].size
    g_c = float(vd["g_c"])
    r["g_c"] = F(g_c, 4)
    gs, nn = vd["gammas"], vd["n"]
    i = np.flatnonzero(nn > 0)[0]
    r["g_ult0"], r["g_prim"] = F(gs[i - 1], 3), F(gs[i], 3)
    r["mel_dif"] = F(100 * abs(gs[i] - g_c) / g_c, 0)
    r["n_prim"], r["n_37"], r["n_20"] = int(nn[i]), int(nn[gs == 0.37][0]), int(nn[gs == 0.20][0])
    r["cosh_mel"] = M(math.cosh(math.pi * 0.6), 4)
    r["mult_sela"] = M(vd["multiplicador"][-1], 3)
    n_ctl = int(ctl["n"])
    r["n_ctl"] = f"{n_ctl:_}".replace("_", r"\,")
    r["phi15"], r["phi20"] = M(ctl["phi15"], 3), M(ctl["phi20"], 3)
    c2, c3 = ctl["f20"][0] * n_ctl, ctl["f20"][1] * n_ctl
    r["cont20_2"], r["cont20_3"] = int(round(c2)), int(round(c3))
    r["ep_phi20"] = M(math.sqrt(1 / c2 + 1 / c3) / math.log(10), 1)
    lt, ep = float(tra["lam"]), float(tra["ep"])
    r["lam_trans"], r["ep_trans"] = M(lt, 3), M(ep, 1)
    r["n_trans"] = int(tra["n"])
    r["kl"] = M(float(inc["kappa"]) / lt, 3)
    r["kl_dif"] = F(100 * abs(float(inc["kappa"]) / lt - float(inc["phi"])) / float(inc["phi"]), 1)
    # incerteza do ajuste de phi
    faixa = eps <= 1e-3
    rng = np.random.default_rng(analise.SEMENTE)
    n_inc = int(inc["n_pares"])
    boot = [np.polyfit(np.log(eps[faixa]), np.log(rng.binomial(n_inc, fr)[faixa] / n_inc), 1)[0] for _ in range(2000)]
    ic = np.percentile(boot, [2.5, 97.5])
    r["phi3"], r["phi_ic0"], r["phi_ic1"] = M(inc["phi"], 3), M(ic[0], 3), M(ic[1], 3)
    fx = []
    for a_, b_ in ((1e-3, 1e-8), (1e-5, 1e-12), (1e-8, 1e-12)):
        m_ = (eps <= a_) & (eps >= b_)
        fx.append(np.polyfit(np.log(eps[m_]), np.log(fr[m_]), 1)[0])
    r["phi_fx0"], r["phi_fx1"] = M(min(fx), 3), M(max(fx), 3)
    r["ep_l1_C"] = M(np.std(exp["l1_C"]) / math.sqrt(exp["l1_C"].size), 1)
    r["ic_ens0"], r["ic_ens1"] = M(sen["ic_ens"][0], 3), M(sen["ic_ens"][1], 3)
    r["jan_ens0"], r["jan_ens1"] = M(np.min(sen["janelas_ens"]), 3), M(np.max(sen["janelas_ens"]), 3)
    r["lp"] = [dict(spp=int(a), m=M(b, 4), ep=F(c, 4)) for a, b, c in zip(lp["passos"], lp["media"], lp["ep"])]
    r["x_v"] = f"{float(sen['x_v']):g}".replace(".", "{,}")
    r["frac_v"] = P(sen["frac_v"])
    r["tv_sep"] = M(primeiro_acima(sen["t"], sen["v_d"]), 2)
    r["tcv_sep"] = M(primeiro_acima(sen["t"], sen["c_d_v"]), 2)
    h = und["harm"]
    r["a1"], r["a3"], r["a5"] = M(h[0], 4), M(h[2], 3), M(h[3], 2)
    r["amp_err"] = F(100 * abs(float(h[0]) - float(und["amp_bh"][0])) / float(h[0]), 1)
    fa, aa = esp["fA"], esp["aA"]
    amp_em = lambda x: float(aa[np.argmin(np.abs(fa - x))])  # noqa: E731
    r["esp_1"], r["esp_3"], r["esp_5"] = M(amp_em(0.2), 3), M(amp_em(0.6), 3), M(amp_em(1.0), 3)
    r["esp_pares"] = M(max(amp_em(k / 5) for k in (2, 4, 6, 8)), 1)
    bm = be["medidas"]
    r["be"] = [dict(a=P(bm[i, 0]), l=F(bm[i, 1], 2), v=F(bm[i, 2], 2)) for i in range(2)]
    r["ib_area"], r["ib_local"] = P(ib["area"]), F(ib["local"], 2)
    r["ib_sobe"], r["ib_desce"] = F(ib["v_sobe"], 2), F(ib["v_desce"], 2)
    return r


def conferir_afirmacoes(res: dict, info: dict) -> None:
    """Cada asserção sustenta uma afirmação escrita no texto do relatório."""
    exp, inc, sen, aut, und, cic, atr = (res[k] for k in (
        "expoentes", "incerteza_a", "sensibilidade", "autonomo", "poco_unico", "ciclo_a", "atrator_c"))
    flo, jan, rota, vd, ctl, tra, esp, lp, be = (res[k] for k in (
        "floquet_casos", "janela_p5", "rota_janela", "variedades", "controle_incerteza", "transiente_a", "espectros",
        "lambda_passos", "bacias_e"))
    assert np.max(np.abs(flo["muA"])) < 1 and np.all(np.abs(flo["muA"].imag) < 1e-12) and np.all(flo["muA"].real > 0)
    assert float(flo["resA"]) < 1e-11
    assert abs(flo["muD"][0].imag) > 0 and abs(flo["muE0"][0].imag) > 0
    assert 0.35 < float(jan["g_baixo"]) < 0.37 < float(jan["g_alto"]) < 0.38 and float(jan["espelho_max"]) < 1e-9
    assert fracao_ws_na_fronteira(res) > 0.97, "a fronteira do caso E precisa coincidir com W^s"
    jt = jan["tabela"]
    pontas = jt[np.abs(jt[:, 2] - 1) < 0.5]
    assert np.all(np.isfinite(pontas[:, 1])) and np.all(pontas[:, 1] > 0), "o multiplicador sai por +1"
    tab = rota["tabela"]
    lin = lambda g: tab[np.argmin(np.abs(tab[:, 0] - g))]  # noqa: E731
    assert lin(0.37)[1] == 5 and lin(0.37)[4] < 1e-9 and lin(0.3755)[1] == 5 and lin(0.3755)[4] > 1e-3
    assert lin(0.3515)[1] == 5 and lin(0.3515)[4] > 1e-3 and lin(0.3485)[1] == 10 and lin(0.3815)[1] == 0
    g, nn = vd["gammas"], vd["n"]
    i = np.flatnonzero(nn > 0)[0]
    assert np.all(nn[:i] == 0) and abs(g[i] - float(vd["g_c"])) / float(vd["g_c"]) < 0.02, "cruzamentos perto do limiar de Melnikov"
    assert float(ctl["phi20"]) > 0.8 and float(ctl["nao_class20"]) == 0
    assert abs(float(inc["kappa"]) / float(tra["lam"]) - float(inc["phi"])) / float(inc["phi"]) < 0.15
    fa, aa = esp["fA"], esp["aA"]
    em = lambda x: float(aa[np.argmin(np.abs(fa - x))])  # noqa: E731
    assert em(0.2) > 0.5 and max(em(k / 5) for k in (2, 4, 6, 8)) < 1e-10, "só múltiplos ímpares de omega/5"
    assert np.all(be["rotulo"] >= 0) and len(set(np.round(be["pontos"].ravel(), 3))) == 4
    assert np.ptp(lp["media"]) < 0.01
    assert abs(float(und["harm"][0]) - float(und["amp_bh"][0])) < abs(float(und["amp"]) - float(und["amp_bh"][0]))
    assert und["harm"][1] < 1e-10
    assert int(cic["periodo"]) == 5
    assert np.all(exp["l1_A"] < 0) and np.ptp(exp["l1_A"]) < 1e-2
    assert np.all(exp["l1_C"] > 0)
    assert np.all(exp["l1_D"] < 0)
    for k in "ACD":
        assert np.max(np.abs(exp[f"l1_{k}"] + exp[f"l2_{k}"] + 0.3)) < 1e-5
    assert float(cic["dist_espelho"]) < 1e-9
    assert np.all(inc["contagem_finais"] > 0)
    assert float(inc["nao_classificados"]) == 0, "o texto afirma que todas chegaram ao ciclo"
    assert np.all(res["bacias_a"]["rotulo_geral"] >= 0) and np.all(res["bacias_a"]["rotulo_zoom"] >= 0)
    assert np.all(np.diff(inc["fracao"]) < 0)
    assert float(inc["phi"]) > 0 and float(inc["phi"]) < 1
    assert float(sen["a_d"][sen["t"] > 200].mean()) > 0.5, "o par do caso A precisa ficar separado"
    assert float(np.max(sen["b_d"])) < 1e-3, "o par de x(0) = 1 precisa convergir"
    assert float(sen["b_d"][-1]) < 1e-6
    assert float(sen["c_d"][sen["t"] > 200].mean()) > 0.5
    assert abs(float(exp["l1_C"].mean()) - float(sen["lam_ens"])) < 0.02, "as duas medidas de λ precisam concordar"
    assert aut["limiares"].size >= 3
    assert float(aut["limiares"][0]) > math.sqrt(0.5), "o amortecimento exige mais que a barreira sem atrito"
    assert abs(float(aut["fracao_direita"]) - 0.5) < 0.01
    assert aut["x1"][-1] * aut["x2"][-1] < 0
    assert und["amp_bh"].size == 1 and np.all(und["periodo"] == 1)
    assert abs(float(und["amp"]) - float(und["amp_bh"][0])) / float(und["amp"]) < 0.03
    assert info["finais_E"][0] * info["finais_E"][1] < 0
    finais = info["finais_B"]
    b = CASOS["B"]
    assert b.p.energia(*b.condicoes[0]) < 0 and finais[0] > 0, "E(0) < 0: preso no poço de partida"
    assert all(b.p.energia(*c) > 0 for c in b.condicoes[1:])
    assert all(abs(abs(v) - 1) < 0.05 for v in finais)
    assert abs(float(atr["fracao_todos"]) - 0.5) < 0.02, "por simetria, x > 0 em metade do tempo"
    assert abs(float(atr["fracao_direita"]) - 0.5) > 0.1, "o texto afirma que a seção t = nT não é simétrica"
    assert float(aut["limiares"][1] - aut["limiares"][0]) < float(aut["limiares"][2] - aut["limiares"][1])
    perm = aut["permanencia"]
    assert np.all(np.diff(perm) > 0), "a permanência precisa crescer ao se aproximar do limiar"


_AVISO = re.compile(r"(LaTeX Warning|Package \S+ Warning|Overfull \\hbox \((\d+\.?\d*)pt|"
                    r"Overfull \\vbox|Missing character)")


# A Times New Roman não tem recursos OpenType de matemática; o aviso do fontspec é esperado e inofensivo.
_ESPERADO = re.compile(r"fontspec Warning: (Font \"times|OpenType feature 'Style=MathScript)")


def ferramenta(nome: str) -> str:
    caminho = shutil.which(nome) or shutil.which(nome, path=str(Path(sys.prefix) / "bin"))
    if caminho is None:
        raise RuntimeError(f"'{nome}' não encontrado. Instale-o (ex.: micromamba install {nome}).")
    return caminho


def compilar(tex: Path) -> list[str]:
    proc = subprocess.run([ferramenta("tectonic"), "--keep-logs", "--chatter", "minimal", tex.name],
                          cwd=tex.parent, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Falha ao compilar {tex.name}:\n{proc.stdout[-4000:]}\n{proc.stderr[-4000:]}")
    avisos = [l.strip() for l in proc.stderr.splitlines() if l.lower().startswith("warning")]
    for linha in tex.with_suffix(".log").read_text(errors="replace").splitlines():
        m = _AVISO.search(linha)
        if m and not (m.group(2) and float(m.group(2)) <= 1.0) and not _ESPERADO.search(linha):
            avisos.append(linha.strip())
    return avisos


def gerar_relatorio(destino: Path, refazer_figuras: bool = True) -> Path:
    res = analise.tudo()
    figs = BUILD / "figs"
    if refazer_figuras:
        info = figuras.gerar(res, figs)
    conferir_afirmacoes(res, info)
    r = montar_numeros(res, info)
    env = Environment(loader=FileSystemLoader(RAIZ / "codigo" / "templates"), undefined=StrictUndefined,
                      block_start_string=r"\BLOCK{", block_end_string="}", variable_start_string=r"\VAR{",
                      variable_end_string="}", comment_start_string=r"\#{", comment_end_string="}",
                      line_comment_prefix="%#", trim_blocks=True, autoescape=False)
    corpo = env.get_template("relatorio.tex.j2").render(r=r, casos=CASOS, cores={k: c[1:] for k, c in COR_CASO.items()})
    BUILD.mkdir(exist_ok=True)
    shutil.copy(RAIZ / "codigo" / "modelo.py", BUILD / "modelo_listagem.py")
    for recurso in (RAIZ / "codigo" / "recursos").iterdir():  # brasões da capa
        shutil.copy(recurso, BUILD / recurso.name)
    fontes = list((Path(sys.prefix) / "fonts").glob("times*.ttf"))  # licença da Microsoft: fora do repositório
    if len(fontes) < 4:
        raise RuntimeError("Times New Roman não encontrada. Instale-a: micromamba install -c conda-forge mscorefonts")
    for fonte in fontes:
        shutil.copy(fonte, BUILD / fonte.name)
    tex = BUILD / "relatorio_duffing.tex"
    tex.write_text(corpo, encoding="utf-8")
    avisos = compilar(tex)
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(tex.with_suffix(".pdf"), destino)
    print(f"PDF: {destino}")
    for a in avisos:
        print("aviso:", a)
    return destino
