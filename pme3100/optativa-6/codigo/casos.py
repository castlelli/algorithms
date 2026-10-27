"""Os três casos prontos pedidos ("distintas funções" ω(t) e v(t))."""

from __future__ import annotations

from dataclasses import dataclass

from .modelo import Parametros


@dataclass(frozen=True)
class Caso:
    nome: str        # usado nos nomes de arquivo
    titulo: str      # "Caso n"
    rotulo: str      # o que varia, em poucas palavras
    descricao: str   # o que o caso mostra, em LaTeX (vai para o resumo do PDF)
    p: Parametros


CASOS: dict[int, Caso] = {
    1: Caso(
        nome="caso1",
        titulo="Caso 1",
        rotulo="ω e v constantes",
        descricao=(
            r"Caso de referência, que pode ser conferido à mão: como $\alpha = 0$ e $\dot v = 0$, "
            r"a aceleração relativa e a parcela tangencial do arrastamento são nulas. Sobram a "
            r"parcela centrípeta $-\omega^2 r\,\vb{e}_r$, que diminui com $r$, e a aceleração de "
            r"Coriolis $-2\omega v\,\vb{e}_\varphi$, de módulo constante. A formiga chega ao "
            r"centro em $t_f = R/v$."
        ),
        p=Parametros(R=2.0, phi0=0.0, omega="0.5", v="0.25", dt=1.0, t_instante=3.0),
    ),
    2: Caso(
        nome="caso2",
        titulo="Caso 2",
        rotulo="ω crescendo linearmente, v constante",
        descricao=(
            r"O carrossel acelera com $\alpha$ constante e não nula, o que faz surgir a parcela "
            r"tangencial $\vb*{\alpha}\wedge\vb{OF}$ da aceleração de arrastamento. A parcela "
            r"centrípeta cresce com $\omega^2$ enquanto $r$ diminui, e a de Coriolis cresce com "
            r"$\omega$."
        ),
        p=Parametros(R=2.0, phi0=0.0, omega="0.2 + 0.15*t", v="0.3", dt=0.75, t_instante=4.0),
    ),
    3: Caso(
        nome="caso3",
        titulo="Caso 3",
        rotulo="ω senoidal (inverte o sentido), v variável",
        descricao=(
            r"$\omega$ troca de sinal em $t = \pi/0{,}7 \approx \qty{4.49}{s}$: o carrossel para e "
            r"passa a girar no sentido horário. Com $v$ variável, todas as parcelas (relativa, "
            r"tangencial, centrípeta e Coriolis) são não nulas, e as que dependem de $\omega$ e de "
            r"$\alpha$ trocam de sinal."
        ),
        p=Parametros(R=2.0, phi0="pi/4", omega="0.6*sin(0.7*t)", v="0.25 + 0.2*sin(1.2*t)",
                     dt=1.0, t_instante=5.5),
    ),
}
