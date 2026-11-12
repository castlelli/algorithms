"""Verificações numéricas, usadas pelo pytest, pelo relatório e (repetidas em JavaScript) pelo site.

Cada checagem mede um erro que deveria ser zero. As fórmulas fechadas do módulo ``modelo``
são confrontadas com a definição (derivadas, produto vetorial) e com derivadas numéricas,
que não usam fórmula nenhuma: só passam se as contas estiverem certas.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .casos import Entradas
from .modelo import CurvaEspacial, Hipocicloide

TOL_IDENTIDADE = 1e-9   # identidades exatas, só arredondamento
TOL_DERIVADA = 1e-6     # diferença central de 5 pontos, O(h⁴)
TOL_INTEGRAL = 1e-6     # comprimento de arco por quadratura
FOLGA_BICO = 1e-2       # longe dos bicos: |sin(Rθ/2r)| > FOLGA_BICO


@dataclass(frozen=True)
class Checagem:
    chave: str
    descricao: str     # LaTeX (vai direto para a tabela do relatório; o site traduz pela chave)
    valor: float
    tolerancia: float
    aprovado: bool


def derivada_numerica(f, x: np.ndarray, h: float) -> np.ndarray:  # noqa: ANN001
    """Diferença central de 5 pontos, O(h⁴)."""
    x = np.asarray(x, dtype=float)
    cols = [f(x + s * h) for s in (-2, -1, 1, 2)]
    return (cols[0] - 8 * cols[1] + 8 * cols[2] - cols[3]) / (12 * h)


def grade(h: Hipocicloide, n: int = 2000) -> np.ndarray:
    """θ num período (ou em 4 voltas, se não fecha), sem os arredores dos bicos."""
    tm = h.theta_max if h.fecha else 8 * math.pi
    th = np.linspace(0, tm, n)
    return th[np.abs(h.seno_meio(th)) > FOLGA_BICO]


def _maxnorm(x: np.ndarray) -> float:
    return float(np.max(np.linalg.norm(x, axis=-1)))


def medidas_hipocicloide(h: Hipocicloide, omega: float) -> dict[str, float]:
    th = grade(h)
    tau, n = h.tangente_normal(th)
    out: dict[str, float] = {}
    out["tau_unitario"] = float(np.max(np.abs(np.linalg.norm(tau, axis=-1) - 1)))
    out["tau_n"] = float(np.max(np.abs(np.sum(tau * n, axis=-1))))

    if not h.degenerada:
        rho_g, rho_f = h.rho(th), h.rho_fechado(th)
        out["rho_fechado"] = float(np.max(np.abs(rho_g - rho_f) / rho_f))
        # dτ/ds = n/ρ, com dτ/ds = (dτ/dθ)/|r'| por derivada numérica.
        dth = 1e-4
        dtau = derivada_numerica(lambda x: h.tangente_normal(x)[0], th, dth)
        dtau_ds = dtau / np.linalg.norm(h.d1(th), axis=-1)[:, None]
        alvo = n / rho_f[:, None]
        out["frenet_plano"] = float(np.max(np.linalg.norm(dtau_ds - alvo, axis=-1) * rho_f))

    # Rolamento sem escorregar: P gira em torno do ponto de contato I, então v ⟂ IP
    # e |v| = |Ω|·|IP|, com Ω = −kθ̇ (a rotação absoluta do disco).
    ip = h.posicao(th) - h.contato(th)
    v = h.d1(th)  # θ̇ = 1
    escala = _maxnorm(v) * h.R
    giro = h.k * np.linalg.norm(ip, axis=-1) - np.linalg.norm(v, axis=-1)
    out["rolamento"] = max(float(np.max(np.abs(np.sum(ip * v, axis=-1)))) / escala,
                           float(np.max(np.abs(giro))) / _maxnorm(v))

    # Lei horária θ = ωt: derivar a posição no tempo e reencontrar v e a.
    t = th / omega
    # Passo em t tal que o termo mais rápido, cos(kθ), ande 10⁻³ rad por passo.
    T = 1e-3 / (omega * max(h.k, 1.0))
    pos = lambda tt: h.posicao(omega * tt)  # noqa: E731
    vel = lambda tt: omega * h.d1(omega * tt)  # noqa: E731
    v_num = derivada_numerica(pos, t, T)
    a_num = derivada_numerica(vel, t, T)
    v_an, a_an = omega * h.d1(th), omega**2 * h.d2(th)
    out["derivada_v"] = _maxnorm(v_num - v_an) / _maxnorm(v_an)
    out["derivada_a"] = _maxnorm(a_num - a_an) / _maxnorm(a_an)

    # a = a_t τ + a_n n, e a_n = |v|²/ρ.
    a_t = np.sum(a_an * tau, axis=-1)
    a_n = np.sum(a_an * n, axis=-1)
    out["intrinseca"] = _maxnorm(a_t[:, None] * tau + a_n[:, None] * n - a_an) / _maxnorm(a_an)
    if not h.degenerada:
        rap = np.linalg.norm(v_an, axis=-1)
        out["an_rho"] = float(np.max(np.abs(a_n - rap**2 / h.rho_fechado(th)))) / _maxnorm(a_an)

    if h.fecha:
        out["fecha"] = float(np.linalg.norm(h.posicao(h.theta_max) - h.posicao(0.0))) / h.R
        # Comprimento: ∫|r'| dθ por Gauss–Legendre em cada arco (|r'| é suave entre bicos).
        x, w = np.polynomial.legendre.leggauss(40)
        bicos = h.bicos()
        total = 0.0
        for a, b in zip(bicos[:-1], bicos[1:]):
            tt = 0.5 * (b - a) * x + 0.5 * (a + b)
            total += 0.5 * (b - a) * float(w @ np.linalg.norm(h.d1(tt), axis=-1))
        out["comprimento"] = abs(total - h.comprimento) / h.comprimento
    return out


def medidas_espacial(lambdas: tuple[float, ...]) -> dict[str, float]:
    c = CurvaEspacial
    pts = list(lambdas) + list(np.linspace(-1.5, 1.5, 31))
    orto = direto = rho = tor = ser_t = ser_b = 0.0
    h = 1e-3
    for lam in pts:
        f = c.frenet(lam)
        M = np.array([f.tau, f.n, f.b])
        orto = max(orto, float(np.max(np.abs(M @ M.T - np.eye(3)))))
        direto = max(direto, float(np.linalg.norm(np.cross(f.tau, f.n) - f.b)))
        rho = max(rho, abs(f.rho - float(c.rho_fechado(lam))) / f.rho)
        tor = max(tor, abs(f.torcao - float(c.torcao_fechada(lam))) / max(abs(f.torcao), 1e-300))
        # Frenet–Serret: dτ/ds = κn e db/ds = −(torção)n, com d/ds = (d/dλ)/|r'|.
        ds = float(np.linalg.norm(c.d1(lam)))
        dtau = derivada_numerica(lambda x: np.array([c.frenet(xi).tau for xi in np.atleast_1d(x)]), np.array([lam]), h)[0] / ds
        db = derivada_numerica(lambda x: np.array([c.frenet(xi).b for xi in np.atleast_1d(x)]), np.array([lam]), h)[0] / ds
        ser_t = max(ser_t, float(np.linalg.norm(dtau - f.curvatura * f.n)) / f.curvatura)
        ser_b = max(ser_b, float(np.linalg.norm(db + f.torcao * f.n)) / max(f.torcao, f.curvatura))
    return {"frenet_ortonormal": orto, "frenet_direto": direto, "rho_3d": rho, "torcao": tor,
            "serret_tau": ser_t, "serret_b": ser_b}


# chave → (descrição em LaTeX, tolerância)
DESCRICOES: dict[str, tuple[str, float]] = {
    "fecha": (r"Curva fecha após $2\pi q$: $|P(2\pi q) - P(0)|/R$", TOL_IDENTIDADE),
    "comprimento": (r"Comprimento: quadratura de $\int|\mathbf{r}'|\,d\theta$ contra $8pr(R-r)/R$ (erro relativo)", TOL_INTEGRAL),
    "tau_unitario": (r"$\max\,\bigl||\boldsymbol{\tau}| - 1\bigr|$", TOL_IDENTIDADE),
    "tau_n": (r"$\max\,|\boldsymbol{\tau}\cdot\mathbf{n}|$", TOL_IDENTIDADE),
    "rho_fechado": (r"$\rho$ geral $|\mathbf{r}'|^3/|x'y''-y'x''|$ contra $\frac{4r(R-r)}{|R-2r|}\,|\sin\frac{R\theta}{2r}|$ (erro relativo)", TOL_IDENTIDADE),
    "frenet_plano": (r"$d\boldsymbol{\tau}/ds = \mathbf{n}/\rho$ por derivada numérica (erro relativo)", TOL_DERIVADA),
    "rolamento": (r"Rolamento sem escorregar: $\mathbf{v}\perp\overline{IP}$ e $|\mathbf{v}| = |\Omega|\,\overline{IP}$ (erro relativo)", TOL_IDENTIDADE),
    "derivada_v": (r"$d\mathbf{r}/dt$ numérica contra $\mathbf{v} = \omega\,\mathbf{r}'(\theta)$ (erro relativo)", TOL_DERIVADA),
    "derivada_a": (r"$d\mathbf{v}/dt$ numérica contra $\mathbf{a} = \omega^2\,\mathbf{r}''(\theta)$ (erro relativo)", TOL_DERIVADA),
    "intrinseca": (r"$a_t\boldsymbol{\tau} + a_n\mathbf{n} = \mathbf{a}$ (erro relativo)", TOL_IDENTIDADE),
    "an_rho": (r"$a_n = |\mathbf{v}|^2/\rho$ (erro relativo)", TOL_IDENTIDADE),
    "frenet_ortonormal": (r"Triedro ortonormal: $\max|MM^{\mathsf T} - I|$, $M = [\boldsymbol{\tau}\ \mathbf{n}\ \mathbf{b}]$", TOL_IDENTIDADE),
    "frenet_direto": (r"Triedro direto: $|\boldsymbol{\tau}\times\mathbf{n} - \mathbf{b}|$", TOL_IDENTIDADE),
    "rho_3d": (r"$\rho = |\mathbf{r}'|^3/|\mathbf{r}'\times\mathbf{r}''|$ contra a forma fechada em $\lambda$ (erro relativo)", TOL_IDENTIDADE),
    "torcao": (r"Torção $(\mathbf{r}'\times\mathbf{r}'')\cdot\mathbf{r}'''/|\mathbf{r}'\times\mathbf{r}''|^2$ contra $3/(1+9\lambda^2+9\lambda^4)$", TOL_IDENTIDADE),
    "serret_tau": (r"Frenet–Serret: $d\boldsymbol{\tau}/ds = \kappa\,\mathbf{n}$ (derivada numérica)", TOL_DERIVADA),
    "serret_b": (r"Frenet–Serret: $d\mathbf{b}/ds = -\tau_\mathrm{tor}\,\mathbf{n}$ (derivada numérica)", TOL_DERIVADA),
}


def verificar(e: Entradas) -> list[Checagem]:
    h = Hipocicloide(e.R, e.r)
    medidas = {**medidas_hipocicloide(h, e.omega), **medidas_espacial(e.lambdas)}
    out = []
    for chave, (descricao, tol) in DESCRICOES.items():
        if chave in medidas:
            valor = medidas[chave]
            out.append(Checagem(chave, descricao, valor, tol, bool(math.isfinite(valor) and valor <= tol)))
    return out
