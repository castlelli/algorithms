"""Exportação dos números para o site interativo."""

from __future__ import annotations

import json

import numpy as np

from codigo.casos import CASOS
from codigo.cli import main
from codigo.modelo import Movimento
from codigo.site import LINHAS, dados_site


def test_esquema_e_valores() -> None:
    dados = dados_site()
    assert dados["url"].startswith("https://")
    assert [c["numero"] for c in dados["casos"]] == sorted(CASOS)
    for c in dados["casos"]:
        mov = Movimento(CASOS[c["numero"]].p)
        assert c["t_f"] == float(f"{mov.t_f:.15g}")
        assert set(c["tabela"]) == set(LINHAS)
        e = mov.estado(np.array([c["params"]["t"]]))
        for nome in LINHAS:
            np.testing.assert_allclose(c["tabela"][nome]["cart"], e.cartesiano(nome)[0], atol=1e-14)
        assert c["checagens"] and all(k["aprovado"] for k in c["checagens"])
        assert {"omega", "v", "r", "phi"} <= set(c["latex"])
        assert len(c["serie"]["t"]) == len(c["serie"]["r"]) == len(c["serie"]["phi"])


def test_cli_site(tmp_path, monkeypatch) -> None:  # noqa: ANN001
    alvo = tmp_path / "site"
    monkeypatch.setattr("codigo.site.SITE_DIR", alvo)
    assert main(["--site"]) == 0
    dados = json.loads((alvo / "data" / "report.json").read_text(encoding="utf-8"))
    assert len(dados["casos"]) == len(CASOS)
