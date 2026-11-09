"""Exporta os resultados em cache para o site interativo (docs/pme3100/optativa-9/data).

O site refaz as integrações no navegador; daqui saem só os mapas caros (bacias, diagrama de
bifurcação, atrator) e os números do relatório usados na conferência.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from . import analise
from .casos import CASOS
from .estilo import COR_CASO
from .modelo import gamma_melnikov, integrar

ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT.parent.parent / "docs" / "pme3100" / "optativa-9"
X_RANGE = (-1.6, 1.6)  # faixa de x quantizada em 16 bits nos diagramas de bifurcação
CLOUD_POINTS = 60_000


def quantize(x: np.ndarray) -> np.ndarray:
    lo, hi = X_RANGE
    scaled = (np.clip(x, lo, hi) - lo) / (hi - lo) * 65535
    return np.round(scaled).astype("<u2")


def save_labels(labels: np.ndarray, path: Path) -> None:
    """Grava o mapa de rótulos como PNG em tons de cinza: rótulo no valor do pixel, 255 = sem rótulo."""
    from PIL import Image

    image = np.where(labels < 0, 255, labels.astype(np.int16)).astype(np.uint8)[::-1]  # linha 0 = maior velocidade
    Image.fromarray(np.ascontiguousarray(image)).save(path, optimize=True)


def rounded(values, digits: int = 5) -> list:
    return [round(float(v), digits) for v in np.asarray(values).ravel()]


def export_site(target: Path = SITE_DIR) -> Path:
    data = target / "data"
    data.mkdir(parents=True, exist_ok=True)

    attractor = analise.atrator_c()["densa"]
    step = attractor.shape[0] // CLOUD_POINTS
    attractor[::step][:CLOUD_POINTS].astype("<f4").tofile(data / "attractor_c.bin")

    bif = analise.bifurcacao()
    n_keep, n_gamma, n_ic = bif["x"].shape
    quantize(bif["x"].transpose(1, 0, 2).reshape(n_gamma, n_keep * n_ic)).tofile(data / "bifurcation.bin")
    zoom = analise.zoom_bifurcacao()
    zx = zoom["s"][..., 0]
    quantize(zx.transpose(1, 0, 2).reshape(zx.shape[1], -1)).tofile(data / "bifurcation_zoom.bin")

    basins_a = analise.bacias_a()
    save_labels(basins_a["rotulo_geral"], data / "basin_a.png")
    save_labels(basins_a["rotulo_zoom"], data / "basin_a_zoom.png")
    basins_e = analise.bacias_e()
    save_labels(basins_e["rotulo"], data / "basin_e.png")
    autonomous = analise.autonomo()
    save_labels((autonomous["poco"] > 0).astype(np.int8), data / "basin_b.png")

    exponents = analise.expoentes()
    floquet = analise.floquet_casos()
    cycle = analise.ciclo_a()
    single_well = analise.poco_unico()
    convergence = analise.convergencia()
    window = analise.janela_p5()
    sensitivity = analise.sensibilidade()
    transient = analise.transiente_a()
    case_a = CASOS["A"]
    end_a = integrar(case_a.p, *case_a.condicoes[0], case_a.tmax)
    period_e = CASOS["E"].p.T
    delta = CASOS["A"].p.coef.delta

    cases = {}
    for key, case in CASOS.items():
        p = case.p
        cases[key] = {"title": case.titulo, "color": COR_CASO[key],
                      "m": p.m, "k1": p.k1, "k2": p.k2, "c": p.c, "A": p.A, "omega": p.omega,
                      "tmax": case.tmax, "initial": [list(ic) for ic in case.condicoes]}

    report = {
        "cases": cases,
        "x_range": list(X_RANGE),
        "cloud_points": CLOUD_POINTS,
        "bifurcation": {"gamma": [float(bif["gammas"][0]), float(bif["gammas"][-1])],
                        "count": int(n_gamma), "per_gamma": int(n_keep * n_ic),
                        "lyapunov": rounded(bif["lam"].max(axis=1), 4)},
        "bifurcation_zoom": {"gamma": [float(zoom["gammas"][0]), float(zoom["gammas"][-1])],
                             "count": int(zx.shape[1]), "per_gamma": int(zx.shape[0] * zx.shape[2]),
                             "lyapunov": rounded(zoom["lam"].max(axis=1), 4)},
        "basins": {
            "A": {"file": "basin_a.png", "window": rounded(basins_a["janela_geral"]),
                  "points": [rounded(p, 8) for p in cycle["pontos"]], "periods": 160},
            "A_zoom": {"file": "basin_a_zoom.png", "window": rounded(basins_a["janela_zoom"]),
                       "points": [rounded(p, 8) for p in cycle["pontos"]], "periods": 160},
            "E": {"file": "basin_e.png", "window": [-2, 2, -2, 2],
                  "points": [rounded(p, 8) for p in basins_e["pontos"]], "periods": 120},
            "B": {"file": "basin_b.png", "window": [-2.2, 2.2, -2.2, 2.2],
                  "points": [[-1, 0], [1, 0]], "periods": 0},
        },
        "numbers": {
            "lyapunov": {"A": float(np.mean(exponents["l1_A"])), "C": float(np.mean(exponents["l1_C"])),
                         "D": float(np.mean(exponents["l1_D"])),
                         "E": float(math.log(abs(floquet["muE0"][0])) / period_e)},
            "period_A": int(cycle["periodo"]),
            "transient_lyapunov_A": float(transient["lam"]),
            "endpoint_A": [float(end_a.x[-1]), float(end_a.v[-1])],
            "map_steps_per_period": analise.SPP_MAPA,
            "amplitude_D": float(single_well["amp"]),
            "fixed_points_E": [rounded(p, 8) for p in floquet["pontosE"]],
            "fixed_point_D": rounded(floquet["zD"], 8),
            "melnikov": float(gamma_melnikov(delta, CASOS["A"].p.omega)),
            "window_p5": [float(window["g_baixo"]), float(window["g_alto"])],
            "lyapunov_ensemble_C": float(sensitivity["lam_ens"]),
            "impulse_thresholds_B": rounded(autonomous["limiares"], 6),
            "convergence": {"h": rounded(convergence["hs"], 6), "error": [float(e) for e in convergence["erro"]],
                            "orders": rounded(convergence["ordens"], 3)},
        },
    }
    (data / "report.json").write_text(json.dumps(report, separators=(",", ":")), encoding="utf-8")
    return target
