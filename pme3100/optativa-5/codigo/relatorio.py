"""Relatório em PDF: figuras (matplotlib) + template LaTeX (jinja2) → tectonic."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
from jinja2 import Environment, FileSystemLoader, StrictUndefined

from . import figuras as fg
from .animacao import ferramenta
from .casos import Entradas
from .estilo import CORES
from .formatacao import latex_num
from .modelo import CurvaEspacial, Hipocicloide, instante
from .site import URL_SITE
from .verificacao import verificar

TEMPLATES = Path(__file__).parent / "templates"


def _ambiente() -> Environment:
    return Environment(
        loader=FileSystemLoader(TEMPLATES), undefined=StrictUndefined, autoescape=False,
        block_start_string=r"\BLOCK{", block_end_string="}", variable_start_string=r"\VAR{",
        variable_end_string="}", comment_start_string=r"\#{", comment_end_string="}",
        line_statement_prefix="%%", line_comment_prefix="%#", trim_blocks=True, lstrip_blocks=True,
    )


def _avisos_do_log(log: Path) -> list[str]:
    if not log.exists():
        return []
    texto = log.read_text(encoding="utf-8", errors="replace")
    padroes = (r"Overfull \\hbox.*", r"Underfull \\hbox.*badness 10000.*", r"LaTeX Warning:.*",
               r"Package \w+ Warning:.*", r"Missing character:.*")
    return [m.group(0).strip() for p in padroes for m in re.finditer(p, texto)]


def compilar(tex: Path) -> list[str]:
    """Compila com tectonic (baixa sob demanda os pacotes que faltarem) e devolve os avisos."""
    proc = subprocess.run([ferramenta("tectonic"), "--keep-logs", "--chatter", "minimal", tex.name],
                          cwd=tex.parent, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Falha ao compilar {tex.name}:\n{proc.stdout[-4000:]}\n{proc.stderr[-4000:]}")
    avisos = [l.strip() for l in proc.stderr.splitlines() if l.lower().startswith("warning")]
    return avisos + _avisos_do_log(tex.with_suffix(".log"))


def _lista(xs) -> str:  # noqa: ANN001
    return ";\\ ".join(latex_num(x) for x in xs)


def _vet(v) -> str:  # noqa: ANN001
    return ",\\ ".join(latex_num(x, 1.0) for x in v)


def contexto(e: Entradas, build: Path, tex_dir: Path) -> dict:
    """Gera as figuras em ``build`` e monta o contexto do template."""
    h = Hipocicloide(e.R, e.r)
    th15 = h.pontos_seguros(e.pontos_rho)
    th16 = h.pontos_seguros(e.pontos_versores)
    inst = [instante(h, e.omega, t) for t in e.instantes]

    fg.fig_curva(h, build / "curva.pdf")
    fg.fig_quadros(h, np.linspace(0, h.theta_max, 12, endpoint=False), build / "quadros.pdf", 4, False)
    # Instantâneos no meio de cada fatia de θ: nenhum cai exatamente num bico.
    fg.fig_quadros(h, h.theta_max * (np.arange(e.quadros) + 0.5) / e.quadros, build / "instantaneos.pdf", 3, True)
    fg.fig_razoes(e.razoes, build / "razoes.pdf")
    fg.fig_rho(h, th15, build / "rho.pdf")
    fg.fig_versores(h, th16, build / "versores.pdf")
    fg.fig_lei(h, e.omega, inst, build / "lei.pdf")
    fg.fig_espacial(e.lambdas, build / "espacial.pdf", frenet=False)
    fg.fig_espacial(e.lambdas, build / "frenet.pdf", frenet=True)

    n = latex_num
    tau16, n16 = h.tangente_normal(th16)
    razoes = []
    for k in e.razoes:
        hk = Hipocicloide(k, 1.0)
        razoes.append({"razao": n(k), "frac": f"${hk.p}/{hk.q}$" if hk.fecha else "irracional",
                       "p": hk.p if hk.fecha else "—", "comp": n(hk.comprimento) if hk.fecha else "—"})
    checagens = [dict(c.__dict__, valor_txt=f"{c.valor:.3e}" if c.valor else "0") for c in verificar(e)]
    frenet = []
    for lam in e.lambdas:
        f = CurvaEspacial.frenet(lam)
        frenet.append({"lam": n(lam), "P": _vet(f.posicao), "kappa": n(f.curvatura), "rho": n(f.rho),
                       "tor": n(f.torcao), "tau": _vet(f.tau), "n": _vet(f.n), "b": _vet(f.b)})
    return {
        "dir": Path(os.path.relpath(build, tex_dir)).as_posix(),
        "cores": CORES, "n": n, "url_site": URL_SITE,
        "R": e.R, "r": e.r, "p": h.p, "q": h.q,
        "razoes_txt": _lista(e.razoes), "instantes_txt": _lista(e.instantes), "lambdas_txt": _lista(e.lambdas),
        "arco_bico": h.arco_bico, "comprimento": h.comprimento,
        "rho_max": float("inf") if h.degenerada else 4 * h.r * h.a / abs(h.R - 2 * h.r),
        "periodo": h.theta_max / e.omega,
        "tab_razoes": razoes,
        "tab_rho": [{"theta": n(t), "x": n(P[0], h.R), "y": n(P[1], h.R), "rho": n(rr)}
                    for t, P, rr in zip(th15, h.posicao(th15), h.rho_fechado(th15))],
        "tab_vers": [{"theta": n(t), "tx": n(a[0], 1), "ty": n(a[1], 1), "nx": n(b[0], 1), "ny": n(b[1], 1)}
                     for t, a, b in zip(th16, tau16, n16)],
        "tab_lei": [{"t": n(i.t), "theta": n(i.theta), "x": n(i.posicao[0], h.R), "y": n(i.posicao[1], h.R),
                     "vx": n(i.v[0], i.rapidez), "vy": n(i.v[1], i.rapidez),
                     "ax": n(i.a[0], np.linalg.norm(i.a)), "ay": n(i.a[1], np.linalg.norm(i.a)),
                     "s": n(i.rapidez), "at": n(i.a_t, np.linalg.norm(i.a)), "an": n(i.a_n),
                     "rho": n(i.rho), "tau": _vet(i.tau), "n": _vet(i.n)} for i in inst],
        "tab_frenet": frenet,
        "checagens": checagens,
    }


def gerar(e: Entradas, pdf: Path, build: Path) -> list[str]:
    """Escreve o .tex em ``build``, compila e copia o PDF para ``pdf``. Devolve os avisos do LaTeX."""
    build.mkdir(parents=True, exist_ok=True)
    tex = build / "relatorio.tex"
    ctx = contexto(e, build, tex.parent)
    tex.write_text(_ambiente().get_template("relatorio.tex.j2").render(**ctx), encoding="utf-8")
    avisos = compilar(tex)
    pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(tex.with_suffix(".pdf"), pdf)
    return avisos
