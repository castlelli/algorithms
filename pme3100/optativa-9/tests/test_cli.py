"""O programa recebe os dados a-g e entrega os três gráficos e a tabela."""

from __future__ import annotations

import numpy as np

from codigo.cli import main

BASE = ["--m", "1", "--k1", "-1", "--k2", "1", "--c", "0.3", "--A", "0.37", "--omega", "1.2",
        "--tmax", "20", "--x0", "1", "--v0", "0"]


def test_gera_os_tres_graficos_e_a_tabela(tmp_path) -> None:
    assert main([*BASE, "--saida", str(tmp_path)]) == 0
    for nome in ("a_x_t.png", "b_v_t.png", "c_espaco_de_fases.png", "painel.png", "trajetoria.csv"):
        assert (tmp_path / nome).stat().st_size > 0
    t, x, v = np.loadtxt(tmp_path / "trajetoria.csv", delimiter=",", skiprows=1).T
    assert t[0] == 0 and t[-1] == 20 and x[0] == 1 and v[0] == 0


def test_massa_invalida_sai_com_erro(tmp_path, capsys) -> None:
    args = [*BASE, "--saida", str(tmp_path)]
    args[1] = "-1"
    assert main(args) == 2
    assert "massa" in capsys.readouterr().err


def test_divergencia_sai_com_erro(tmp_path) -> None:
    assert main(["--m", "1", "--k1", "1", "--k2", "-1", "--c", "0", "--A", "0", "--omega", "1", "--tmax", "100",
                 "--x0", "2", "--v0", "1", "--saida", str(tmp_path)]) == 2
