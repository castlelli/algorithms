// Portuguese and English. Static text carries data-i18n keys (innerHTML), data-i18n-aria
// (aria-label) or data-i18n-content (meta content); modules call t() for dynamic text.
// The language comes from ?lang=, then the saved choice, then the browser.

const PT = {
  "doc.title": "Carrossel e formiga",
  "doc.description": "Movimento relativo ao vivo: uma formiga anda até o centro de um carrossel que gira. Velocidades, acelerações e Coriolis calculados no navegador.",
  "og.description": "Cinemática do movimento relativo calculada no navegador: arrastamento, Coriolis e a soma vetorial.",
  skip: "Ir para o laboratório",
  "nav.back": "Voltar ao portfólio de Vinicius Castelli",
  "nav.backLabel": "Portfólio",
  "nav.brand": "<em>Carrossel</em>",
  "nav.sections": "Seções",
  "nav.lab": "<span>01</span>Laboratório",
  "nav.sum": "<span>02</span>Soma vetorial",
  "nav.coriolis": "<span>03</span>Coriolis",
  "nav.check": "<span>04</span>Conferência",
  "nav.report": "Relatório<span class=\"wide-only\"> em PDF</span>",
  "nav.lang": "Idioma",
  "theme.toLight": "Tema claro",
  "theme.toDark": "Tema escuro",
  "theme.aria": "Alternar entre tema claro e escuro",
  "hero.eyebrow": "Mecânica I · Optativa 6",
  "hero.title": "Uma formiga num <em>carrossel</em> que gira",
  "hero.lede": "A formiga anda da borda até o centro enquanto o disco gira. Velocidades, acelerações e Coriolis, calculados ao vivo no seu navegador.",
  "hero.open": "Abrir o laboratório",
  "hero.report": "Relatório em PDF",
  "hero.aria": "Vista de topo do caso 3: o carrossel gira, para e inverte o sentido enquanto a formiga anda até o centro",
  "hero.caption": "Caso 3, calculado agora. O carrossel para e inverte o sentido em t ≈ 4,49 s; a formiga desenha a sua trajetória absoluta.",
  "lab.title": "Laboratório",
  "lab.lede": "Escolha ω(t) e v(t) e veja o movimento. A cada Δt as setas trocam de grupo, como no relatório: velocidades nos múltiplos pares de Δt, acelerações nos ímpares.",
  "lab.cases": "Casos",
  "lab.hint": "Vale t, números, + − * / ^, pi, E e sin, cos, tan, exp, log, sqrt, abs… A multiplicação precisa de *: 2*t.",
  "lab.frame": "Referencial",
  "lab.ground": "Visto do chão",
  "lab.carousel": "Visto do carrossel",
  "lab.vectors": "Vetores exibidos",
  "lab.alt": "Alternar a cada Δt",
  "lab.vel": "Velocidades",
  "lab.acc": "Acelerações",
  "lab.sceneAria": "Vista de topo do carrossel, da formiga e dos vetores",
  "lab.restart": "Reiniciar",
  "lab.time": "Tempo",
  "lab.speed": "Velocidade da animação",
  "lab.tableCaption": "Velocidades e acelerações no instante t <span>componentes em m/s e m/s²</span>",
  "lab.vector": "Vetor",
  "lab.magnitude": "Módulo",
  "lab.play": "Reproduzir",
  "lab.pause": "Pausar",
  "lab.replay": "Repetir",
  "lab.badgeVel": "VELOCIDADES",
  "lab.badgeAcc": "ACELERAÇÕES",
  "lab.noArrival": " (não chega)",
  "lab.timeOf": "{t} s de {tf} s",
  "lab.scale": "seta de 1 R ≙ {v} m/s\nseta de 1 R ≙ {a} m/s²",
  "lab.lawsExact": "Leis exatas deduzidas pelo sympy no relatório.",
  "lab.lawsNumeric": "Integração numérica no navegador (sem forma fechada).",
  "lab.custom": "Personalizado",
  "lab.customLabel": "suas funções ω(t) e v(t)",
  "lab.frameGround": "Visto do chão, a formiga descreve uma espiral: é a trajetória absoluta.",
  "lab.frameCarousel": "Visto do carrossel, a formiga anda em linha reta até o centro e é o chão que gira. Quem anda no carrossel mede <i>v</i><sub>rel</sub> e <i>a</i><sub>rel</sub>; as outras setas ficam apagadas.",
  "case.title": "Caso {n}",
  "case.label.1": "ω e v constantes",
  "case.label.2": "ω crescendo linearmente, v constante",
  "case.label.3": "ω senoidal (inverte o sentido), v variável",
  "case.note.1": "Referência que se confere à mão: α = 0 e v̇ = 0, então a aceleração relativa e a parcela tangencial somem. |<i>a</i><sub>cor</sub>| = 2<i>ωv</i> fica constante e <i>t</i><sub>f</sub> = <i>R</i>/<i>v</i>.",
  "case.note.2": "O carrossel acelera com α constante: surge a parcela tangencial α∧OF da aceleração de arrastamento. A centrípeta cresce com ω² enquanto r diminui.",
  "case.note.3": "ω troca de sinal em t = π/0,7 ≈ 4,49 s: o carrossel para e passa a girar no sentido horário. Com v variável, todas as parcelas são não nulas.",
  "case.note.custom": "Caso personalizado. As leis r(t) e φ(t) saem da integração numérica feita aqui, e α e v̇ da derivada exata das expressões digitadas.",
  "case.fromLab": "Do laboratório",
  "vec.v_rel": "relativa",
  "vec.v_arr": "de arrastamento",
  "vec.v_abs": "absoluta",
  "vec.a_rel": "relativa",
  "vec.a_arr": "de arrastamento",
  "vec.a_arr_t": "parcela tangencial",
  "vec.a_arr_n": "parcela centrípeta",
  "vec.a_cor": "de Coriolis",
  "vec.a_abs": "absoluta",
  "sum.title": "A soma vetorial, parcela por parcela",
  "sum.lede": "Cada seta começa onde a anterior termina. Desligue uma parcela e a soma deixa de chegar à aceleração absoluta: o que falta aparece tracejado.",
  "sum.case": "Caso",
  "sum.build": "Montar a soma",
  "sum.velocity": "Velocidade",
  "sum.velocityCaption": "Velocidade <span>base polar: e<sub>r</sub> para a direita, e<sub>φ</sub> para cima</span>",
  "sum.acceleration": "Aceleração",
  "sum.accelerationCaption": "Aceleração <span>mesma base</span>",
  "sum.vAria": "Soma das velocidades relativa e de arrastamento",
  "sum.aAria": "Soma das acelerações relativa, tangencial, centrípeta e de Coriolis",
  "sum.instant": "Instante",
  "sum.grid": "grade",
  "sum.missing": "falta",
  "sum.zeroOne": "Neste instante {list} é nula.",
  "sum.zeroMany": "Neste instante {list} são nulas.",
  "sum.and": " e ",
  "sum.open": "Com parcelas desligadas, a soma não fecha: o tracejado é exatamente o que elas valem.",
  "sum.closed": "Com todas as parcelas, o polígono fecha na aceleração absoluta.",
  "cor.title": "O que a aceleração de Coriolis faz",
  "cor.lede": "Integramos a formiga duas vezes a partir do mesmo estado inicial: uma com todas as parcelas, outra sem a de Coriolis. Sem ela, a formiga não fica sobre a sua reta.",
  "cor.play": "Soltar as duas formigas",
  "cor.groundAria": "Trajetórias com e sem Coriolis vistas do chão",
  "cor.carouselAria": "Trajetórias com e sem Coriolis vistas de cima do carrossel",
  "cor.with": "Com todas as parcelas: a solução exata",
  "cor.without": "Sem a parcela de Coriolis",
  "cor.drift": "Afastamento da reta ao fim",
  "cor.driftNote": "distância entre as duas formigas em t<sub>f</sub>",
  "cor.max": "Maior |a<sub>cor</sub>|",
  "cor.maxAt": "em t = {t} s",
  "cor.share": "Coriolis na aceleração absoluta",
  "cor.shareNote": "média de |a<sub>cor</sub>| / |a<sub>abs</sub>| no movimento",
  "cor.chart": "Módulos das parcelas da aceleração <span>passe o cursor para ler os valores</span>",
  "cor.chartAria": "Módulos das parcelas da aceleração ao longo do tempo",
  "check.title": "O navegador confere o relatório",
  "check.lede": "O relatório deduziu as leis com o sympy e verificou tudo em Python. Aqui o navegador refaz as mesmas contas com outro método (quadratura de Gauss–Legendre) e compara.",
  "check.run": "Recalcular agora",
  "check.valuesCaption": "Valores no instante dos itens (b) e (c)",
  "check.rowsCaption": "Verificações da seção 7 do relatório",
  "check.quantity": "Grandeza",
  "check.report": "Relatório",
  "check.browser": "Navegador",
  "check.difference": "Diferença",
  "check.check": "Verificação",
  "check.tolerance": "Tolerância",
  "check.at": "em <i>t</i> = {t} s",
  "check.status": "{case}: recalculado em {ms} ms. Maior diferença {worst}. ",
  "check.allOk": "Todas as verificações passam nos dois lados.",
  "check.someBad": "Há verificação reprovada.",
  "footer.credit": "Vinicius Castelli, NUSP 17864509. Mecânica I, Escola Politécnica da USP, 2026.",
  "footer.report": "Relatório em PDF",
  "footer.python": "Código em Python",
  "footer.site": "Código deste site",
  // Errors (same wording as the Python program).
  "err.empty": "{label}: expressão vazia.",
  "err.token": "{label} = \"{text}\": trecho \"{piece}\" não permitido.",
  "err.name": "{label} = \"{text}\": nome \"{name}\" não permitido. Use {extra}números, + - * / ** ^ ( ) e: {allowed}.",
  "err.invalid": "{label} = \"{text}\": expressão inválida ({why}).",
  "why.expected": "esperava \"{v}\"",
  "why.early": "terminou cedo",
  "why.implicit": "multiplicação exige *, ex.: 2*t",
  "why.misplaced": "\"{v}\" fora do lugar",
  "err.finiteConst": "{name} = {value}: deve ser um número finito.",
  "err.R": "R = {value}: o raio do carrossel deve ser positivo.",
  "err.dt": "Δt = {value}: o intervalo de exibição deve ser positivo.",
  "err.notFinite": "{name} não é finita/real em t ≈ {t} s; revise a expressão.",
  "err.vNegative": "v(t) = \"{text}\" fica negativa em t ≈ {t} s (v = {v} m/s). v é o módulo da velocidade da formiga rumo ao centro e precisa ser ≥ 0 até ela chegar lá.",
  "err.tOut": "t = {value} s fora do movimento: use 0 ≤ t ≤ t_f = {tf} s.",
};

const EN = {
  "doc.title": "Carousel and ant",
  "doc.description": "Relative motion, live: an ant walks to the centre of a spinning carousel. Velocities, accelerations and Coriolis computed in your browser.",
  "og.description": "Relative-motion kinematics computed in the browser: transport terms, Coriolis and the vector sum.",
  skip: "Skip to the lab",
  "nav.back": "Back to Vinicius Castelli's portfolio",
  "nav.backLabel": "Portfolio",
  "nav.brand": "<em>Carousel</em>",
  "nav.sections": "Sections",
  "nav.lab": "<span>01</span>Lab",
  "nav.sum": "<span>02</span>Vector sum",
  "nav.coriolis": "<span>03</span>Coriolis",
  "nav.check": "<span>04</span>Cross-check",
  "nav.report": "Report<span class=\"wide-only\"> (PDF)</span>",
  "nav.lang": "Language",
  "theme.toLight": "Light theme",
  "theme.toDark": "Dark theme",
  "theme.aria": "Switch between light and dark theme",
  "hero.eyebrow": "Mechanics I · Elective assignment 6",
  "hero.title": "An ant on a <em>spinning</em> carousel",
  "hero.lede": "The ant walks from the rim to the centre while the disc spins. Velocities, accelerations and Coriolis, computed live in your browser.",
  "hero.open": "Open the lab",
  "hero.report": "Report (PDF, in Portuguese)",
  "hero.aria": "Top view of case 3: the carousel spins, stops and reverses while the ant walks to the centre",
  "hero.caption": "Case 3, computed now. The carousel stops and reverses at t ≈ 4.49 s; the ant draws its absolute path.",
  "lab.title": "Lab",
  "lab.lede": "Pick ω(t) and v(t) and watch the motion. Every Δt the arrows switch group, as in the report: velocities on even multiples of Δt, accelerations on odd ones.",
  "lab.cases": "Cases",
  "lab.hint": "Allowed: t, numbers, + − * / ^, pi, E and sin, cos, tan, exp, log, sqrt, abs… Multiplication needs *: 2*t.",
  "lab.frame": "Reference frame",
  "lab.ground": "From the ground",
  "lab.carousel": "Riding the carousel",
  "lab.vectors": "Vectors shown",
  "lab.alt": "Alternate every Δt",
  "lab.vel": "Velocities",
  "lab.acc": "Accelerations",
  "lab.sceneAria": "Top view of the carousel, the ant and the vectors",
  "lab.restart": "Restart",
  "lab.time": "Time",
  "lab.speed": "Animation speed",
  "lab.tableCaption": "Velocities and accelerations at time t <span>components in m/s and m/s²</span>",
  "lab.vector": "Vector",
  "lab.magnitude": "Magnitude",
  "lab.play": "Play",
  "lab.pause": "Pause",
  "lab.replay": "Replay",
  "lab.badgeVel": "VELOCITIES",
  "lab.badgeAcc": "ACCELERATIONS",
  "lab.noArrival": " (never arrives)",
  "lab.timeOf": "{t} s of {tf} s",
  "lab.scale": "arrow of 1 R ≙ {v} m/s\narrow of 1 R ≙ {a} m/s²",
  "lab.lawsExact": "Exact laws derived with sympy in the report.",
  "lab.lawsNumeric": "Numerical integration in the browser (no closed form).",
  "lab.custom": "Custom",
  "lab.customLabel": "your own ω(t) and v(t)",
  "lab.frameGround": "From the ground, the ant traces a spiral: its absolute path.",
  "lab.frameCarousel": "Riding the carousel, the ant walks straight to the centre and it is the ground that turns. Someone on the carousel measures <i>v</i><sub>rel</sub> and <i>a</i><sub>rel</sub>; the other arrows are dimmed.",
  "case.title": "Case {n}",
  "case.label.1": "constant ω and v",
  "case.label.2": "ω growing linearly, constant v",
  "case.label.3": "sinusoidal ω (reverses), varying v",
  "case.note.1": "A reference you can check by hand: α = 0 and v̇ = 0, so the relative acceleration and the tangential term vanish. |<i>a</i><sub>cor</sub>| = 2<i>ωv</i> stays constant and <i>t</i><sub>f</sub> = <i>R</i>/<i>v</i>.",
  "case.note.2": "The carousel speeds up with constant α: the tangential term α∧OF of the transport acceleration appears. The centripetal term grows with ω² while r shrinks.",
  "case.note.3": "ω changes sign at t = π/0.7 ≈ 4.49 s: the carousel stops and turns clockwise. With varying v, every term is non-zero.",
  "case.note.custom": "Custom case. The laws r(t) and φ(t) come from numerical integration done here, and α and v̇ from the exact derivative of what you typed.",
  "case.fromLab": "From the lab",
  "vec.v_rel": "relative",
  "vec.v_arr": "transport",
  "vec.v_abs": "absolute",
  "vec.a_rel": "relative",
  "vec.a_arr": "transport",
  "vec.a_arr_t": "tangential term",
  "vec.a_arr_n": "centripetal term",
  "vec.a_cor": "Coriolis",
  "vec.a_abs": "absolute",
  "sum.title": "The vector sum, term by term",
  "sum.lede": "Each arrow starts where the previous one ends. Switch a term off and the sum no longer reaches the absolute acceleration: what is missing shows dashed.",
  "sum.case": "Case",
  "sum.build": "Build the sum",
  "sum.velocity": "Velocity",
  "sum.velocityCaption": "Velocity <span>polar basis: e<sub>r</sub> to the right, e<sub>φ</sub> up</span>",
  "sum.acceleration": "Acceleration",
  "sum.accelerationCaption": "Acceleration <span>same basis</span>",
  "sum.vAria": "Sum of the relative and transport velocities",
  "sum.aAria": "Sum of the relative, tangential, centripetal and Coriolis accelerations",
  "sum.instant": "Instant",
  "sum.grid": "grid",
  "sum.missing": "missing",
  "sum.zeroOne": "At this instant {list} is zero.",
  "sum.zeroMany": "At this instant {list} are zero.",
  "sum.and": " and ",
  "sum.open": "With terms switched off the sum does not close: the dashed line is exactly what they are worth.",
  "sum.closed": "With every term, the polygon closes on the absolute acceleration.",
  "cor.title": "What the Coriolis acceleration does",
  "cor.lede": "We integrate the ant twice from the same initial state: once with every term, once without the Coriolis term. Without it, the ant does not stay on its line.",
  "cor.play": "Release both ants",
  "cor.groundAria": "Paths with and without Coriolis, seen from the ground",
  "cor.carouselAria": "Paths with and without Coriolis, seen riding the carousel",
  "cor.with": "With every term: the exact solution",
  "cor.without": "Without the Coriolis term",
  "cor.drift": "Drift off the line at the end",
  "cor.driftNote": "distance between the two ants at t<sub>f</sub>",
  "cor.max": "Largest |a<sub>cor</sub>|",
  "cor.maxAt": "at t = {t} s",
  "cor.share": "Coriolis in the absolute acceleration",
  "cor.shareNote": "mean of |a<sub>cor</sub>| / |a<sub>abs</sub>| over the motion",
  "cor.chart": "Magnitude of each acceleration term <span>hover to read the values</span>",
  "cor.chartAria": "Magnitude of each acceleration term over time",
  "check.title": "The browser checks the report",
  "check.lede": "The report derived the laws with sympy and checked everything in Python. Here the browser redoes the same computations with another method (Gauss–Legendre quadrature) and compares.",
  "check.run": "Recompute now",
  "check.valuesCaption": "Values at the instant of items (b) and (c)",
  "check.rowsCaption": "Checks from section 7 of the report",
  "check.quantity": "Quantity",
  "check.report": "Report",
  "check.browser": "Browser",
  "check.difference": "Difference",
  "check.check": "Check",
  "check.tolerance": "Tolerance",
  "check.at": "at <i>t</i> = {t} s",
  "check.status": "{case}: recomputed in {ms} ms. Largest difference {worst}. ",
  "check.allOk": "Every check passes on both sides.",
  "check.someBad": "A check failed.",
  "footer.credit": "Vinicius Castelli. Mechanics I, Escola Politécnica, University of São Paulo, 2026.",
  "footer.report": "Report (PDF, in Portuguese)",
  "footer.python": "Python code",
  "footer.site": "Site source",
  "err.empty": "{label}: empty expression.",
  "err.token": "{label} = \"{text}\": \"{piece}\" is not allowed.",
  "err.name": "{label} = \"{text}\": name \"{name}\" is not allowed. Use {extra}numbers, + - * / ** ^ ( ) and: {allowed}.",
  "err.invalid": "{label} = \"{text}\": invalid expression ({why}).",
  "why.expected": "expected \"{v}\"",
  "why.early": "ended too early",
  "why.implicit": "multiplication needs *, e.g. 2*t",
  "why.misplaced": "\"{v}\" out of place",
  "err.finiteConst": "{name} = {value}: must be a finite number.",
  "err.R": "R = {value}: the carousel radius must be positive.",
  "err.dt": "Δt = {value}: the display interval must be positive.",
  "err.notFinite": "{name} is not finite/real at t ≈ {t} s; check the expression.",
  "err.vNegative": "v(t) = \"{text}\" becomes negative at t ≈ {t} s (v = {v} m/s). v is the speed of the ant towards the centre and must stay ≥ 0 until it gets there.",
  "err.tOut": "t = {value} s is outside the motion: use 0 ≤ t ≤ t_f = {tf} s.",
};

// The report's check descriptions are in Portuguese LaTeX; these are their English versions.
const CHECKS_EN = {
  composicao_v: "$\\max_t \\lVert \\mathbf{v}_{\\mathrm{rel}}+\\mathbf{v}_{\\mathrm{arr}} - \\dot{\\mathbf{r}}_F\\rVert$, with $\\dot{\\mathbf{r}}_F$ the analytic derivative of $x(t),\\,y(t)$",
  composicao_a: "$\\max_t \\lVert \\mathbf{a}_{\\mathrm{rel}}+\\mathbf{a}_{\\mathrm{arr}}+\\mathbf{a}_{\\mathrm{cor}} - \\ddot{\\mathbf{r}}_F\\rVert$, analytic derivative of $x(t),\\,y(t)$",
  derivada_v: "largest relative error between the numerical $\\mathrm{d}\\mathbf{OF}/\\mathrm{d}t$ and $\\mathbf{v}_{\\mathrm{abs}}$",
  derivada_a: "largest relative error between the numerical $\\mathrm{d}\\mathbf{v}_{\\mathrm{abs}}/\\mathrm{d}t$ and $\\mathbf{a}_{\\mathrm{abs}}$",
  v_nao_negativa: "$\\min\\{0,\\ \\min_t v(t)\\}$ (v is a speed: it cannot be negative)",
  t_f: "$|r(t_f)|$ at the instant the ant reaches the centre",
  const_cor: "$\\max_t \\bigl|\\,|\\mathbf{a}_{\\mathrm{cor}}| - 2|\\omega| v\\,\\bigr|$",
  const_arr: "$\\max_t \\lVert \\mathbf{a}_{\\mathrm{arr}} + \\omega^2 r\\,\\mathbf{e}_r\\rVert$",
  const_rel: "$\\max_t \\lVert \\mathbf{a}_{\\mathrm{rel}}\\rVert$",
  const_tf: "$|t_f - R/v|$",
};

const DICT = { pt: PT, en: EN };
const hasDom = typeof document !== "undefined";
let current = detect();

function detect() {
  if (typeof window === "undefined") return "pt";
  const param = new URLSearchParams(window.location.search).get("lang");
  if (param === "en" || param === "pt") return param;
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "pt") return saved;
  } catch (error) {
    // Storage can be blocked.
  }
  return (navigator.language || "pt").toLowerCase().startsWith("pt") ? "pt" : "en";
}

export const lang = () => current;
export const decimal = () => (current === "en" ? "." : ",");

export function t(key, vars = {}) {
  const text = DICT[current][key] ?? PT[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

/** Description of a report check in the current language (LaTeX mixed with text). */
export function checkDescription(key, portuguese) {
  return current === "en" ? CHECKS_EN[key] ?? portuguese : portuguese;
}

/** LaTeX exported by sympy uses {,} as the decimal comma; English wants a point. */
export const localLatex = (latex) => (current === "en" ? latex.replaceAll("{,}", ".") : latex);

export function applyStatic(root = document) {
  document.documentElement.lang = current === "en" ? "en" : "pt-BR";
  document.title = t("doc.title");
  for (const el of root.querySelectorAll("[data-i18n]")) el.innerHTML = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll("[data-i18n-content]")) el.setAttribute("content", t(el.dataset.i18nContent));
  for (const el of root.querySelectorAll("[data-i18n-href]")) el.setAttribute("href", el.dataset[`href${current === "en" ? "En" : "Pt"}`]);
  for (const b of root.querySelectorAll("[data-lang-toggle] button")) b.setAttribute("aria-pressed", String(b.dataset.value === current));
  document.documentElement.classList.remove("i18n-wait");
}

export function setLang(next) {
  if (next !== "en" && next !== "pt") return;
  current = next;
  try {
    localStorage.setItem("lang", next);
  } catch (error) {
    // The choice then lasts for this visit only.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", next);
  history.replaceState(null, "", url);
  applyStatic();
  document.dispatchEvent(new Event("langchange"));
}

export function onLangChange(callback) {
  if (hasDom) document.addEventListener("langchange", callback);
}
