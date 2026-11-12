// Portuguese and English. Static text carries data-i18n keys (innerHTML), data-i18n-aria
// (aria-label) or data-i18n-content (meta content); modules call t() for dynamic text.
// The language comes from ?lang=, then the saved choice, then the browser.

const PT = {
  "doc.title": "Hipocicloide",
  "doc.description": "Um disco rola por dentro de um aro e um ponto dele desenha a hipocicloide. Curvatura, versores, velocidade, aceleração e o triedro de Frenet, calculados no navegador.",
  "og.description": "Geometria diferencial ao vivo: o disco que rola, o círculo osculador, a lei horária e o triedro de Frenet.",
  skip: "Ir para o laboratório",
  "nav.back": "Voltar ao portfólio de Vinicius Castelli",
  "nav.backLabel": "Portfólio",
  "nav.brand": "Hipo<em>cicloide</em>",
  "nav.sections": "Seções",
  "nav.lab": "Laboratório",
  "nav.ratios": "Razões",
  "nav.curvature": "Curvatura",
  "nav.frame": "Versores",
  "nav.motion": "Lei horária",
  "nav.frenet": "Frenet",
  "nav.check": "Conferência",
  "nav.report": "Relatório<span class=\"wide-only\"> em PDF</span>",
  "nav.lang": "Idioma",
  "theme.toLight": "Tema claro",
  "theme.toDark": "Tema escuro",
  "theme.aria": "Alternar entre tema claro e escuro",

  "hero.eyebrow": "Mecânica I · Optativa 5 · Cinemática do ponto",
  "hero.title": "Um disco que rola <em>por dentro</em> de outro",
  "hero.lede": "Um ponto da borda do disco desenha a hipocicloide: arcos que se encontram em bicos onde o ponto para. Curvatura, versores, velocidade e o triedro de Frenet, calculados ao vivo no seu navegador.",
  "hero.open": "Abrir o laboratório",
  "hero.frenet": "Ir para o 3D",
  "hero.speedUnit": "por rad",
  "hero.rhoUnit": "raio",
  "hero.aria": "Um disco rola por dentro de um aro e um ponto da sua borda desenha a hipocicloide; a razão R/r muda a cada volta completa",
  "hero.caption": "R/r = {frac}: {p} bicos, fecha em {q} {turns}.",

  turn: "volta",
  turns: "voltas",

  "lab.items": "itens 1.1 · 1.2 · 1.3",
  "lab.title": "O disco que <em>rola</em>",
  "lab.lede": "Escolha os raios e veja a curva nascer. Rolar sem escorregar quer dizer que o ponto de contato I está parado naquele instante: o disco inteiro gira em torno dele, e por isso a velocidade de P é perpendicular a IP.",
  "lab.ring": "· aro",
  "lab.disk": "· disco",
  "lab.contact": "Centro instantâneo I",
  "lab.velocity": "Velocidade de P",
  "lab.cusps": "Bicos",
  "lab.sceneAria": "O aro, o disco rolando, o ponto P e o traço da hipocicloide",
  "lab.restart": "Recomeçar",
  "lab.speed": "Velocidade da animação",
  "lab.pause": "Pausar",
  "lab.play": "Animar",
  "lab.errRr": "R precisa ser maior que r: o disco tem de caber dentro do aro.",
  "lab.degenerate": "Com R = 2r a hipocicloide degenera num diâmetro do aro (o par de Tusi): ρ é infinito.",
  "lab.fraction": "R/r",
  "lab.cuspsFact": "bicos",
  "lab.turnsFact": "voltas até fechar",
  "lab.lengthFact": "comprimento",
  "lab.rhoMaxFact": "ρ máximo",
  "lab.caption": "θ = {theta} rad · P = {P}",
  "lab.snapTitle": "Instantâneos",
  "lab.snapLede": "Fotografe o instante atual, ou gere os seis instantâneos igualmente espaçados do relatório.",
  "lab.snapNow": "Fotografar agora",
  "lab.snapSix": "Seis instantâneos",
  "lab.snapClear": "Limpar",
  "lab.snapAria": "Instantâneo em θ = {theta} rad",
  "lab.snapEmpty": "Nenhum instantâneo ainda.",

  "ratios.items": "item 1.4",
  "ratios.title": "A razão <em>R/r</em> decide a forma",
  "ratios.lede": "Se R/r = p/q em fração irredutível, a curva tem p bicos e fecha depois de q voltas do centro do disco. Se a razão é irracional, ela nunca fecha e vai preenchendo um anel.",
  "ratios.aria": "Hipocicloide para a razão escolhida, desenhada volta a volta",
  "ratios.presets": "Razões prontas",
  "ratios.draw": "Desenhar de novo",
  "ratios.note": "Comprimento de um arco entre bicos: 8r(R − r)/R. A curva fechada tem p arcos.",
  "ratios.galleryCaption": "<b>R/r = {k}</b> · {p} bicos · {q} {turns}",
  "ratios.galleryAria": "Hipocicloide com R/r = {k}",
  "ratios.fraction": "fração",
  "ratios.irrational": "nenhuma com q ≤ 1000",
  "ratios.cusps": "bicos",
  "ratios.closes": "fecha em",
  "ratios.never": "nunca",
  "ratios.length": "comprimento (r = 1)",
  "ratios.caption": "{n} {turns} desenhadas",
  "ratios.from": "do relatório",

  "curv.items": "item 1.5",
  "curv.title": "O círculo que <em>beija</em> a curva",
  "curv.lede": "Arraste o ponto ao longo da curva. O círculo osculador é o que melhor a acompanha ali; o seu raio é o raio de curvatura ρ. Ele é máximo no meio de cada arco e vai a zero nos bicos.",
  "curv.aria": "Hipocicloide com o círculo osculador no ponto escolhido; arraste para mover o ponto",
  "curv.caption": "Arraste sobre a curva",
  "curv.evolute": "Evoluta (lugar dos centros)",
  "curv.points": "Pontos do relatório",
  "curv.chart": "ρ(θ) num período <span>arraste aqui também</span>",
  "curv.chartAria": "Gráfico do raio de curvatura em função de θ",
  "curv.table": "Raio de curvatura nos pontos do relatório",
  "curv.rhoClosed": "ρ (forma fechada)",
  "curv.rhoGeneral": "ρ (fórmula geral)",
  "curv.kappa": "κ = 1/ρ",
  "curv.cusp": "bico: ρ = 0, τ e n não existem",

  "frame.items": "item 1.6",
  "frame.title": "Tangente e <em>normal</em> ao longo do caminho",
  "frame.lede": "τ aponta para onde o ponto vai; n aponta para o centro de curvatura. Nos bicos τ inverte o sentido, porque o ponto para e volta, e nenhum dos dois versores existe.",
  "frame.count": "Pontos",
  "frame.mode": "O que desenhar",
  "frame.unit": "Versores τ e n",
  "frame.comb": "Pente de curvatura (ρn)",
  "frame.play": "Deslizar",
  "frame.stop": "Parar",
  "frame.aria": "Versores tangente e normal em pontos da hipocicloide",
  "frame.captionUnit": "{n} pontos espalhados entre os bicos · setas de comprimento fixo",
  "frame.captionComb": "Cada seta vai de P ao centro de curvatura: as pontas desenham a evoluta",

  "motion.items": "item 1.7",
  "motion.title": "Velocidade e aceleração com <em>θ = ωt</em>",
  "motion.lede": "Com ω = π/60 rad/s, o centro do disco dá uma volta em 120 s. A aceleração se decompõe em a<sub>t</sub>τ, que muda a rapidez, e a<sub>n</sub>n = (ṡ²/ρ)n, que muda a direção.",
  "motion.aria": "O ponto P com os vetores velocidade e aceleração e a decomposição intrínseca",
  "motion.parts": "a<sub>t</sub>τ e a<sub>n</sub>n",
  "motion.instants": "Três instantes do relatório",
  "motion.chart": "ṡ, a<sub>t</sub> e a<sub>n</sub> ao longo de um período <span>arraste para mudar t</span>",
  "motion.chartAria": "Rapidez e componentes intrínsecas da aceleração em função do tempo",
  "motion.instantsLabel": "Instantes [s]",
  "motion.kind": "Forma",
  "motion.cart": "Cartesiana",
  "motion.intr": "Intrínseca",
  "motion.tableCart": "Forma cartesiana <span>componentes em i e j; v em m/s, a em m/s²</span>",
  "motion.tableIntr": "Forma intrínseca <span>v = ṡτ, a = a<sub>t</sub>τ + a<sub>n</sub>n</span>",
  "motion.caption": "Setas em escalas próprias: o maior |v| e o maior |a| do período valem 0,3R",
  "motion.cusp": "num bico: v = 0",
  "motion.badInstant": "Instante inválido",

  "frenet.items": "itens 2.1 · 2.2 · 2.3",
  "frenet.title": "Um triedro que <em>viaja</em> pela curva",
  "frenet.lede": "A cúbica reversa r(λ) = (λ, λ², λ³) não cabe num plano. Em cada ponto, τ, n e b formam um triedro direto; o plano de τ e n é o plano osculador, onde fica o círculo osculador. Arraste para girar.",
  "frenet.aria": "A cúbica reversa em 3D com o triedro de Frenet; arraste para girar",
  "frenet.caption": "Arraste para girar · sombras nos planos coordenados",
  "frenet.plane": "Plano e círculo osculadores",
  "frenet.shadows": "Projeções",
  "frenet.points": "Três pontos do relatório",
  "frenet.view": "Vista",
  "frenet.table": "Curvatura e triedro nos pontos do relatório",
  "frenet.torsion": "torção",
  "frenet.kappa": "curvatura κ",

  "check.items": "verificação",
  "check.title": "O navegador <em>confere</em> o relatório",
  "check.lede": "O relatório foi calculado em Python. Aqui o navegador refaz as mesmas contas, com as mesmas checagens (derivadas numéricas, Frenet–Serret, rolamento sem escorregar, comprimento por quadratura), e compara número a número.",
  "check.run": "Recalcular agora",
  "check.valuesCaption": "Valores das tabelas",
  "check.rowsCaption": "Verificações",
  "check.quantity": "Grandeza",
  "check.report": "Relatório",
  "check.browser": "Navegador",
  "check.difference": "Diferença",
  "check.check": "Verificação",
  "check.tolerance": "Tolerância",
  "check.ok": "Tudo confere: {n} valores e {m} verificações, em {ms} ms.",
  "check.fail": "Algo não confere: veja as linhas em vermelho.",
  "check.rhoPoint": "ρ no ponto {i}",
  "check.speedAt": "ṡ em t = {t} s",
  "check.atAt": "a<sub>t</sub> em t = {t} s",
  "check.anAt": "a<sub>n</sub> em t = {t} s",
  "check.rhoLambda": "ρ em λ = {l}",
  "check.torsionLambda": "torção em λ = {l}",
  "check.length": "comprimento da curva",

  "footer.credit": "Vinicius Castelli, NUSP 17864509. Mecânica I, Escola Politécnica da USP, 2026.",
  "footer.report": "Relatório em PDF",
  "footer.python": "Código em Python",
  "footer.site": "Código deste site",
};

const EN = {
  "doc.title": "Hypocycloid",
  "doc.description": "A disk rolls inside a ring and a point on it draws the hypocycloid. Curvature, unit vectors, velocity, acceleration and the Frenet frame, computed in the browser.",
  "og.description": "Live differential geometry: the rolling disk, the osculating circle, the law of motion and the Frenet frame.",
  skip: "Skip to the lab",
  "nav.back": "Back to Vinicius Castelli's portfolio",
  "nav.backLabel": "Portfolio",
  "nav.brand": "Hypo<em>cycloid</em>",
  "nav.sections": "Sections",
  "nav.lab": "Lab",
  "nav.ratios": "Ratios",
  "nav.curvature": "Curvature",
  "nav.frame": "Unit vectors",
  "nav.motion": "Motion",
  "nav.frenet": "Frenet",
  "nav.check": "Check",
  "nav.report": "Report<span class=\"wide-only\"> (PDF, PT)</span>",
  "nav.lang": "Language",
  "theme.toLight": "Light theme",
  "theme.toDark": "Dark theme",
  "theme.aria": "Switch between light and dark theme",

  "hero.eyebrow": "Mechanics I · Elective 5 · Kinematics of a point",
  "hero.title": "A disk rolling <em>inside</em> another",
  "hero.lede": "A point on the rim of the disk draws the hypocycloid: arcs that meet at cusps where the point stops. Curvature, unit vectors, velocity and the Frenet frame, computed live in your browser.",
  "hero.open": "Open the lab",
  "hero.frenet": "Jump to 3D",
  "hero.speedUnit": "per rad",
  "hero.rhoUnit": "radius",
  "hero.aria": "A disk rolls inside a ring and a point on its rim draws the hypocycloid; the ratio R/r changes after each closed curve",
  "hero.caption": "R/r = {frac}: {p} cusps, closes after {q} {turns}.",

  turn: "turn",
  turns: "turns",

  "lab.items": "items 1.1 · 1.2 · 1.3",
  "lab.title": "The <em>rolling</em> disk",
  "lab.lede": "Pick the radii and watch the curve being born. Rolling without slipping means the contact point I is at rest at that instant: the whole disk turns about it, which is why the velocity of P is perpendicular to IP.",
  "lab.ring": "· ring",
  "lab.disk": "· disk",
  "lab.contact": "Instant centre I",
  "lab.velocity": "Velocity of P",
  "lab.cusps": "Cusps",
  "lab.sceneAria": "The ring, the rolling disk, the point P and the trace of the hypocycloid",
  "lab.restart": "Restart",
  "lab.speed": "Animation speed",
  "lab.pause": "Pause",
  "lab.play": "Play",
  "lab.errRr": "R must be larger than r: the disk has to fit inside the ring.",
  "lab.degenerate": "With R = 2r the hypocycloid degenerates into a diameter of the ring (the Tusi couple): ρ is infinite.",
  "lab.fraction": "R/r",
  "lab.cuspsFact": "cusps",
  "lab.turnsFact": "turns to close",
  "lab.lengthFact": "length",
  "lab.rhoMaxFact": "largest ρ",
  "lab.caption": "θ = {theta} rad · P = {P}",
  "lab.snapTitle": "Snapshots",
  "lab.snapLede": "Capture the current instant, or generate the report's six evenly spaced snapshots.",
  "lab.snapNow": "Capture now",
  "lab.snapSix": "Six snapshots",
  "lab.snapClear": "Clear",
  "lab.snapAria": "Snapshot at θ = {theta} rad",
  "lab.snapEmpty": "No snapshots yet.",

  "ratios.items": "item 1.4",
  "ratios.title": "The ratio <em>R/r</em> decides the shape",
  "ratios.lede": "If R/r = p/q in lowest terms, the curve has p cusps and closes after q turns of the disk's centre. If the ratio is irrational it never closes, and slowly fills an annulus.",
  "ratios.aria": "Hypocycloid for the chosen ratio, drawn turn by turn",
  "ratios.presets": "Preset ratios",
  "ratios.draw": "Draw again",
  "ratios.note": "Length of one arc between cusps: 8r(R − r)/R. The closed curve has p arcs.",
  "ratios.galleryCaption": "<b>R/r = {k}</b> · {p} cusps · {q} {turns}",
  "ratios.galleryAria": "Hypocycloid with R/r = {k}",
  "ratios.fraction": "fraction",
  "ratios.irrational": "none with q ≤ 1000",
  "ratios.cusps": "cusps",
  "ratios.closes": "closes after",
  "ratios.never": "never",
  "ratios.length": "length (r = 1)",
  "ratios.caption": "{n} {turns} drawn",
  "ratios.from": "from the report",

  "curv.items": "item 1.5",
  "curv.title": "The circle that <em>kisses</em> the curve",
  "curv.lede": "Drag the point along the curve. The osculating circle is the one that follows it best there; its radius is the radius of curvature ρ. It peaks in the middle of each arc and drops to zero at the cusps.",
  "curv.aria": "Hypocycloid with the osculating circle at the chosen point; drag to move the point",
  "curv.caption": "Drag along the curve",
  "curv.evolute": "Evolute (locus of centres)",
  "curv.points": "Report points",
  "curv.chart": "ρ(θ) over one period <span>drag here too</span>",
  "curv.chartAria": "Radius of curvature as a function of θ",
  "curv.table": "Radius of curvature at the report's points",
  "curv.rhoClosed": "ρ (closed form)",
  "curv.rhoGeneral": "ρ (general formula)",
  "curv.kappa": "κ = 1/ρ",
  "curv.cusp": "cusp: ρ = 0, τ and n do not exist",

  "frame.items": "item 1.6",
  "frame.title": "Tangent and <em>normal</em> along the path",
  "frame.lede": "τ points where the point is going; n points to the centre of curvature. At the cusps τ flips, because the point stops and turns back, and neither vector exists.",
  "frame.count": "Points",
  "frame.mode": "What to draw",
  "frame.unit": "Unit vectors τ and n",
  "frame.comb": "Curvature comb (ρn)",
  "frame.play": "Slide",
  "frame.stop": "Stop",
  "frame.aria": "Tangent and normal unit vectors at points of the hypocycloid",
  "frame.captionUnit": "{n} points spread between the cusps · fixed-length arrows",
  "frame.captionComb": "Each arrow runs from P to its centre of curvature: the tips trace the evolute",

  "motion.items": "item 1.7",
  "motion.title": "Velocity and acceleration with <em>θ = ωt</em>",
  "motion.lede": "With ω = π/60 rad/s the disk's centre goes round once in 120 s. The acceleration splits into a<sub>t</sub>τ, which changes the speed, and a<sub>n</sub>n = (ṡ²/ρ)n, which changes the direction.",
  "motion.aria": "The point P with its velocity and acceleration vectors and the intrinsic decomposition",
  "motion.parts": "a<sub>t</sub>τ and a<sub>n</sub>n",
  "motion.instants": "The report's three instants",
  "motion.chart": "ṡ, a<sub>t</sub> and a<sub>n</sub> over one period <span>drag to change t</span>",
  "motion.chartAria": "Speed and intrinsic acceleration components against time",
  "motion.instantsLabel": "Instants [s]",
  "motion.kind": "Form",
  "motion.cart": "Cartesian",
  "motion.intr": "Intrinsic",
  "motion.tableCart": "Cartesian form <span>components along i and j; v in m/s, a in m/s²</span>",
  "motion.tableIntr": "Intrinsic form <span>v = ṡτ, a = a<sub>t</sub>τ + a<sub>n</sub>n</span>",
  "motion.caption": "Arrows on their own scales: the largest |v| and |a| of the period are 0.3R long",
  "motion.cusp": "at a cusp: v = 0",
  "motion.badInstant": "Invalid instant",

  "frenet.items": "items 2.1 · 2.2 · 2.3",
  "frenet.title": "A frame that <em>travels</em> along the curve",
  "frenet.lede": "The twisted cubic r(λ) = (λ, λ², λ³) does not fit in a plane. At each point τ, n and b form a right-handed frame; the plane of τ and n is the osculating plane, home of the osculating circle. Drag to rotate.",
  "frenet.aria": "The twisted cubic in 3D with the Frenet frame; drag to rotate",
  "frenet.caption": "Drag to rotate · shadows on the coordinate planes",
  "frenet.plane": "Osculating plane and circle",
  "frenet.shadows": "Projections",
  "frenet.points": "The report's three points",
  "frenet.view": "View",
  "frenet.table": "Curvature and frame at the report's points",
  "frenet.torsion": "torsion",
  "frenet.kappa": "curvature κ",

  "check.items": "verification",
  "check.title": "The browser <em>checks</em> the report",
  "check.lede": "The report was computed in Python. Here the browser redoes the same work, with the same checks (numerical derivatives, Frenet–Serret, rolling without slipping, length by quadrature), and compares number by number.",
  "check.run": "Recompute now",
  "check.valuesCaption": "Table values",
  "check.rowsCaption": "Checks",
  "check.quantity": "Quantity",
  "check.report": "Report",
  "check.browser": "Browser",
  "check.difference": "Difference",
  "check.check": "Check",
  "check.tolerance": "Tolerance",
  "check.ok": "Everything matches: {n} values and {m} checks, in {ms} ms.",
  "check.fail": "Something does not match: see the rows in red.",
  "check.rhoPoint": "ρ at point {i}",
  "check.speedAt": "ṡ at t = {t} s",
  "check.atAt": "a<sub>t</sub> at t = {t} s",
  "check.anAt": "a<sub>n</sub> at t = {t} s",
  "check.rhoLambda": "ρ at λ = {l}",
  "check.torsionLambda": "torsion at λ = {l}",
  "check.length": "length of the curve",

  "footer.credit": "Vinicius Castelli. Mechanics I, Escola Politécnica, University of São Paulo, 2026.",
  "footer.report": "Report (PDF, in Portuguese)",
  "footer.python": "Python code",
  "footer.site": "Source of this site",
};

// English versions of the LaTeX descriptions exported by verificacao.py.
const CHECKS_EN = {
  fecha: "Curve closes after $2\\pi q$: $|P(2\\pi q) - P(0)|/R$",
  comprimento: "Length: quadrature of $\\int|\\mathbf{r}'|\\,d\\theta$ against $8pr(R-r)/R$ (relative error)",
  tau_unitario: "$\\max\\,\\bigl||\\boldsymbol{\\tau}| - 1\\bigr|$",
  tau_n: "$\\max\\,|\\boldsymbol{\\tau}\\cdot\\mathbf{n}|$",
  rho_fechado: "General $\\rho = |\\mathbf{r}'|^3/|x'y''-y'x''|$ against $\\frac{4r(R-r)}{|R-2r|}\\,|\\sin\\frac{R\\theta}{2r}|$ (relative error)",
  frenet_plano: "$d\\boldsymbol{\\tau}/ds = \\mathbf{n}/\\rho$ by numerical derivative (relative error)",
  rolamento: "Rolling without slipping: $\\mathbf{v}\\perp\\overline{IP}$ and $|\\mathbf{v}| = |\\Omega|\\,\\overline{IP}$ (relative error)",
  derivada_v: "Numerical $d\\mathbf{r}/dt$ against $\\mathbf{v} = \\omega\\,\\mathbf{r}'(\\theta)$ (relative error)",
  derivada_a: "Numerical $d\\mathbf{v}/dt$ against $\\mathbf{a} = \\omega^2\\,\\mathbf{r}''(\\theta)$ (relative error)",
  intrinseca: "$a_t\\boldsymbol{\\tau} + a_n\\mathbf{n} = \\mathbf{a}$ (relative error)",
  an_rho: "$a_n = |\\mathbf{v}|^2/\\rho$ (relative error)",
  frenet_ortonormal: "Orthonormal frame: $\\max|MM^{\\mathsf T} - I|$, $M = [\\boldsymbol{\\tau}\\ \\mathbf{n}\\ \\mathbf{b}]$",
  frenet_direto: "Right-handed frame: $|\\boldsymbol{\\tau}\\times\\mathbf{n} - \\mathbf{b}|$",
  rho_3d: "$\\rho = |\\mathbf{r}'|^3/|\\mathbf{r}'\\times\\mathbf{r}''|$ against the closed form in $\\lambda$ (relative error)",
  torcao: "Torsion $(\\mathbf{r}'\\times\\mathbf{r}'')\\cdot\\mathbf{r}'''/|\\mathbf{r}'\\times\\mathbf{r}''|^2$ against $3/(1+9\\lambda^2+9\\lambda^4)$",
  serret_tau: "Frenet–Serret: $d\\boldsymbol{\\tau}/ds = \\kappa\\,\\mathbf{n}$ (numerical derivative)",
  serret_b: "Frenet–Serret: $d\\mathbf{b}/ds = -\\tau_\\mathrm{tor}\\,\\mathbf{n}$ (numerical derivative)",
};

const DICT = { pt: PT, en: EN };
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

/** "volta"/"voltas" (or "turn"/"turns") for a count. */
export const turns = (n) => t(n === 1 ? "turn" : "turns");

/** Description of a report check in the current language (LaTeX mixed with text). */
export function checkDescription(key, portuguese) {
  return current === "en" ? CHECKS_EN[key] ?? portuguese : portuguese;
}

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
  if (typeof document !== "undefined") document.addEventListener("langchange", callback);
}
