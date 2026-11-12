// Expression parser for ω(t) and v(t), with the same whitelist as modelo.interpretar:
// numbers, t, + - * / ^ ** ( ), pi, E and a fixed list of functions. Nothing is passed to eval.
// The parser builds a syntax tree, so α = dω/dt and v̇ = dv/dt come out exact, as in sympy.

export const FUNCTIONS = {
  sin: Math.sin, sen: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, ln: Math.log, sqrt: Math.sqrt,
  abs: Math.abs, Abs: Math.abs,
};
const CANONICAL = { sen: "sin", tg: "tan", ln: "log", Abs: "abs" };
const CONSTANTS = { pi: Math.PI, E: Math.E };
const ALLOWED = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS)].sort().join(", ");

import { decimal, t as tr } from "./i18n.js";

const latexDecimal = () => (decimal() === "," ? "{,}" : ".");

const FIELDS = { "ω": "omega", v: "v", R: "R", "φ₀": "phi0" };

/** Input error; the message follows the page language, field names the input it came from. */
export class ExpressionError extends Error {
  constructor(key, vars = {}, field = null) {
    super(tr(key, vars));
    this.key = key;
    this.vars = vars;
    this.field = field;
  }
}

// ------------------------------------------------------------------------- tree builders
// Small constant folding keeps derivative trees short (d/dt of 0.5 is 0, not 0*1 + 0.5*0).
const num = (v) => ({ k: "num", v });
const T = { k: "t" };
const isNum = (n, v) => n.k === "num" && (v === undefined || n.v === v);

function neg(a) {
  if (isNum(a)) return num(-a.v);
  if (a.k === "neg") return a.a;
  return { k: "neg", a };
}
function add(a, b) {
  if (isNum(a, 0)) return b;
  if (isNum(b, 0)) return a;
  if (isNum(a) && isNum(b)) return num(a.v + b.v);
  return { k: "bin", op: "+", a, b };
}
function sub(a, b) {
  if (isNum(b, 0)) return a;
  if (isNum(a, 0)) return neg(b);
  if (isNum(a) && isNum(b)) return num(a.v - b.v);
  return { k: "bin", op: "-", a, b };
}
function mul(a, b) {
  if (isNum(a, 0) || isNum(b, 0)) return num(0);
  if (isNum(a, 1)) return b;
  if (isNum(b, 1)) return a;
  if (isNum(a) && isNum(b)) return num(a.v * b.v);
  return { k: "bin", op: "*", a, b };
}
function div(a, b) {
  if (isNum(a, 0)) return num(0);
  if (isNum(b, 1)) return a;
  return { k: "bin", op: "/", a, b };
}
function pow(a, b) {
  if (isNum(b, 0)) return num(1);
  if (isNum(b, 1)) return a;
  return { k: "bin", op: "^", a, b };
}
const call = (f, a) => ({ k: "call", f, a });

// --------------------------------------------------------------------------------- parse
const TOKEN = /\s*(?:((?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*/^()]))/y;

function tokenize(text, label, field) {
  const tokens = [];
  let pos = 0;
  while (pos < text.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) {
      const rest = text.slice(pos).trim();
      if (!rest) break;
      throw new ExpressionError("err.token", { label, text, piece: rest.slice(0, 6) }, field);
    }
    pos = TOKEN.lastIndex;
    if (m[1]) tokens.push({ k: "num", v: parseFloat(m[1]) });
    else if (m[2]) tokens.push({ k: "name", v: m[2] });
    else tokens.push({ k: "op", v: m[3] === "**" ? "^" : m[3] });
  }
  return tokens;
}

/** Parses ``text``; with allowT = false the expression must be a constant (R, φ₀). */
export function parse(text, name, allowT = true) {
  const label = allowT ? `${name}(t)` : name;
  text = String(text ?? "").trim();
  const field = FIELDS[name] ?? null;
  if (!text) throw new ExpressionError("err.empty", { label }, field);
  const tokens = tokenize(text, label, field);
  for (const tok of tokens) {
    if (tok.k !== "name") continue;
    if ((tok.v === "t" && allowT) || tok.v in FUNCTIONS || tok.v in CONSTANTS) continue;
    const extra = allowT ? "t, " : "";
    throw new ExpressionError("err.name", { label, text, name: tok.v, extra, allowed: ALLOWED }, field);
  }
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v) => peek() && peek().k === "op" && peek().v === v;
  const fail = (whyKey, vars = {}) => {
    throw new ExpressionError("err.invalid", { label, text, why: tr(whyKey, vars) }, field);
  };
  const expect = (v) => (isOp(v) ? i++ : fail("why.expected", { v }));

  // sum := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)*
  // unary := ('+'|'-') unary | power ; power := atom ('^' unary)?   (right-associative, -t^2 = -(t^2))
  function sum() {
    let node = term();
    while (isOp("+") || isOp("-")) {
      const op = tokens[i++].v;
      const right = term();
      node = { k: "bin", op, a: node, b: right };
    }
    return node;
  }
  function term() {
    let node = unary();
    while (isOp("*") || isOp("/")) {
      const op = tokens[i++].v;
      const right = unary();
      node = { k: "bin", op, a: node, b: right };
    }
    return node;
  }
  function unary() {
    if (isOp("-")) {
      i++;
      return { k: "neg", a: unary() };
    }
    if (isOp("+")) {
      i++;
      return unary();
    }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp("^")) {
      i++;
      return { k: "bin", op: "^", a: base, b: unary() };
    }
    return base;
  }
  function atom() {
    const tok = tokens[i++];
    if (!tok) fail("why.early");
    if (tok.k === "num") return num(tok.v);
    if (tok.k === "name") {
      if (tok.v === "t") return T;
      if (tok.v in CONSTANTS) return { k: "const", name: tok.v, v: CONSTANTS[tok.v] };
      expect("(");
      const arg = sum();
      expect(")");
      return call(CANONICAL[tok.v] ?? tok.v, arg);
    }
    if (tok.v === "(") {
      const inner = sum();
      expect(")");
      return { k: "group", a: inner };
    }
    return fail("why.misplaced", { v: tok.v });
  }

  const tree = sum();
  if (i < tokens.length) {
    const next = tokens[i];
    const implicit = next.k !== "op" || next.v === "(";
    if (implicit) fail("why.implicit");
    fail("why.misplaced", { v: next.v });
  }
  return tree;
}

// ------------------------------------------------------------------------------ evaluate
export function compile(node) {
  switch (node.k) {
    case "num":
    case "const": {
      const v = node.v;
      return () => v;
    }
    case "t":
      return (t) => t;
    case "group":
      return compile(node.a);
    case "neg": {
      const a = compile(node.a);
      return (t) => -a(t);
    }
    case "call": {
      const f = FUNCTIONS[node.f];
      const a = compile(node.a);
      return (t) => f(a(t));
    }
    case "bin": {
      const a = compile(node.a);
      const b = compile(node.b);
      switch (node.op) {
        case "+": return (t) => a(t) + b(t);
        case "-": return (t) => a(t) - b(t);
        case "*": return (t) => a(t) * b(t);
        case "/": return (t) => a(t) / b(t);
        default: return (t) => a(t) ** b(t);
      }
    }
  }
  throw new Error(`unknown node ${node.k}`);
}

export function hasT(node) {
  if (node.k === "t") return true;
  if (node.k === "num" || node.k === "const") return false;
  if (node.k === "bin") return hasT(node.a) || hasT(node.b);
  return hasT(node.a);
}

// ---------------------------------------------------------------------------- derivative
export function derive(node) {
  if (!hasT(node)) return num(0);
  switch (node.k) {
    case "t":
      return num(1);
    case "group":
      return derive(node.a);
    case "neg":
      return neg(derive(node.a));
    case "bin": {
      const { a, b } = node;
      const da = derive(a);
      const db = derive(b);
      switch (node.op) {
        case "+": return add(da, db);
        case "-": return sub(da, db);
        case "*": return add(mul(da, b), mul(a, db));
        case "/": return div(sub(mul(da, b), mul(a, db)), pow(b, num(2)));
        default:
          if (!hasT(b)) return mul(mul(b, pow(a, sub(b, num(1)))), da);
          // d(a^b) = a^b (b' ln a + b a'/a)
          return mul(node, add(mul(db, call("log", a)), div(mul(b, da), a)));
      }
    }
    case "call": {
      const u = node.a;
      const du = derive(u);
      let outer;
      switch (node.f) {
        case "sin": outer = call("cos", u); break;
        case "cos": outer = neg(call("sin", u)); break;
        case "tan": outer = div(num(1), pow(call("cos", u), num(2))); break;
        case "asin": outer = div(num(1), call("sqrt", sub(num(1), pow(u, num(2))))); break;
        case "acos": outer = neg(div(num(1), call("sqrt", sub(num(1), pow(u, num(2)))))); break;
        case "atan": outer = div(num(1), add(num(1), pow(u, num(2)))); break;
        case "sinh": outer = call("cosh", u); break;
        case "cosh": outer = call("sinh", u); break;
        case "tanh": outer = sub(num(1), pow(call("tanh", u), num(2))); break;
        case "exp": outer = node; break;
        case "log": outer = div(num(1), u); break;
        case "sqrt": outer = div(num(1), mul(num(2), node)); break;
        default: outer = div(u, node); break; // abs: d|u| = u/|u|
      }
      return mul(outer, du);
    }
  }
  throw new Error(`unknown node ${node.k}`);
}

// --------------------------------------------------------------------------------- LaTeX
// Mirrors formatacao.latex_decimal closely enough to show what the user typed: decimal comma,
// implicit products, \sin{\left(...\right)}.
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 2, "^": 4 };

function latexNumber(v) {
  const text = Number.isInteger(v) ? String(v) : String(+v.toPrecision(12));
  if (text.includes("e")) {
    const [mantissa, exponent] = text.split("e");
    return `${mantissa.replace(".", latexDecimal())} \\cdot 10^{${Number(exponent)}}`;
  }
  return text.replace(".", latexDecimal());
}

export function toLatex(node, parent = 0) {
  const wrap = (text, prec) => (prec < parent ? `\\left(${text}\\right)` : text);
  switch (node.k) {
    case "num": return latexNumber(node.v);
    case "const": return node.name === "pi" ? "\\pi" : "e";
    case "t": return "t";
    case "group": return toLatex(node.a, parent);
    case "neg": return wrap(`-${toLatex(node.a, PREC.neg + 1)}`, PREC.neg);
    case "call": {
      const arg = toLatex(node.a, 0);
      if (node.f === "sqrt") return `\\sqrt{${arg}}`;
      if (node.f === "abs") return `\\left|${arg}\\right|`;
      if (node.f === "exp") return `e^{${arg}}`;
      const name = { asin: "\\arcsin", acos: "\\arccos", atan: "\\arctan" }[node.f] ?? `\\${node.f}`;
      return `${name}{\\left(${arg}\\right)}`;
    }
    case "bin": {
      const p = PREC[node.op];
      if (node.op === "/") return wrap(`\\frac{${toLatex(node.a)}}{${toLatex(node.b)}}`, p);
      if (node.op === "^") return wrap(`${toLatex(node.a, p + 1)}^{${toLatex(node.b)}}`, p);
      if (node.op === "*") {
        const left = toLatex(node.a, p);
        const right = toLatex(node.b, p + 1);
        const needsDot = /^[\d-]/.test(right);
        return wrap(`${left}${needsDot ? " \\cdot " : " "}${right}`, p);
      }
      const right = toLatex(node.b, p + 1);
      return wrap(`${toLatex(node.a, p)} ${node.op} ${right}`, p);
    }
  }
  return "";
}
