"""Formatação de números em português (vírgula decimal, sinal de menos tipográfico)."""

from __future__ import annotations

import math


def num(x: float, sig: int = 4) -> str:
    """``x`` com ``sig`` algarismos significativos, vírgula decimal e "−" (U+2212).

    Mantém zeros à direita (0,2500) para que colunas e painéis não "pulem".
    """
    x = float(x)
    if not math.isfinite(x):
        return "—"
    if x == 0.0:
        return "0"  # também descarta −0
    texto = f"{x:#.{sig}g}"
    if "e" in texto:
        mant, exp = texto.split("e")
        texto = f"{mant.rstrip('.')}×10^{int(exp)}"
    return texto.rstrip(".").replace(".", ",").replace("-", "−")


def limpar(x: float, escala: float, rel: float = 1e-12) -> float:
    """Zera resíduos de arredondamento (|x| < rel·escala) para não exibir 1e-17."""
    return 0.0 if abs(x) < rel * max(abs(escala), 1e-300) else float(x)


def latex_num(x: float, escala: float | None = None) -> str:
    r"""Número para o siunitx (``\num{...}``), já sem resíduos; o arredondamento é do siunitx."""
    x = limpar(x, abs(x) if escala is None else escala)
    return rf"\num{{{x:.10g}}}"


def bruto(x: float, escala: float | None = None) -> str:
    """Número cru para colunas S do siunitx (que arredondam e alinham pela vírgula)."""
    return f"{limpar(x, abs(x) if escala is None else escala):.10g}"


def mat(x: float, sig: int = 4) -> str:
    """``num`` para dentro de $...$ (mathtext/LaTeX): vírgula sem espaço de pontuação."""
    return num(x, sig).replace(",", "{,}")


def sig(x: float, n: int = 4, escala: float | None = None) -> str:
    """``n`` algarismos significativos, ponto decimal, para colunas S (round-mode=none)."""
    x = limpar(x, abs(x) if escala is None else escala)
    return "0" if x == 0 else f"{x:#.{n}g}".rstrip(".")


def formato_s(valores: list[str]) -> str:
    """``table-format`` do siunitx que acomoda todos os ``valores`` (saídas de ``sig``)."""
    mant = [v.lstrip("-").split("e")[0] for v in valores]
    inteiros = max(len(m.split(".")[0]) for m in mant)
    decimais = max(len(m.split(".")[1]) if "." in m else 0 for m in mant)
    fmt = f"{'-' if any(v.startswith('-') for v in valores) else ''}{inteiros}.{decimais}"
    expoentes = [int(v.split("e")[1]) for v in valores if "e" in v]
    if expoentes:
        fmt += f"e{'-' if min(expoentes) < 0 else ''}{max(len(str(abs(e))) for e in expoentes)}"
    return fmt
