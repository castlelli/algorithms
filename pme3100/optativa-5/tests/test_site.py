"""Exportação dos números para o site interativo."""

from __future__ import annotations

import json

import numpy as np
import pytest

from codigo.casos import PADRAO
from codigo.modelo import CurvaEspacial, Hipocicloide, instante
from codigo.site import SITE_DIR, dados_site, export_site


def test_esquema_e_valores() -> None:
    d = dados_site()
    assert d["url"].startswith("https://") and d["url"].endswith("/hypocycloid/")
    assert d["hipocicloide"]["p"] == 5 and d["hipocicloide"]["q"] == 1
    h = Hipocicloide(PADRAO.R, PADRAO.r)
    assert len(d["rho"]) == PADRAO.pontos_rho
    assert len(d["versores"]) == PADRAO.pontos_versores
    for z in d["rho"]:
        assert z["rho"] == pytest.approx(float(h.rho_fechado(z["theta"])), rel=1e-12)
    for z, t in zip(d["instantes"], PADRAO.instantes):
        i = instante(h, PADRAO.omega, t)
        np.testing.assert_allclose(z["v"], i.v, atol=1e-15)
        np.testing.assert_allclose(z["a"], i.a, atol=1e-15)
    for z in d["frenet"]:
        f = CurvaEspacial.frenet(z["lambda"])
        np.testing.assert_allclose(z["b"], f.b, atol=1e-15)
    assert [r["razao"] for r in d["razoes"]] == list(PADRAO.razoes)
    assert d["checagens"] and all(c["aprovado"] for c in d["checagens"])


def test_json_publicado_esta_em_dia() -> None:
    """O report.json do site é o que --site gera hoje (rode ``python -m codigo --site`` se falhar)."""
    publicado = SITE_DIR / "data" / "report.json"
    assert json.loads(publicado.read_text(encoding="utf-8")) == json.loads(json.dumps(dados_site()))


def test_export(tmp_path) -> None:  # noqa: ANN001
    arq = export_site(tmp_path)
    assert json.loads(arq.read_text(encoding="utf-8"))["entradas"]["R"] == PADRAO.R
