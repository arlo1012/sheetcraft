import {
  serializeEquationDocument,
  type EquationAccentName,
  type EquationDelimiterName,
  type EquationDocument,
  type EquationFractionStyle,
  type EquationLimitName,
  type EquationMatrixBrackets,
  type EquationNaryOperator,
  type EquationNode,
  type EquationSequence,
} from "@sheetcraft/core/equation-document";

export type EquationLocale = "en-US" | "zh-CN";
export type EquationIdFactory = () => string;
export type EquationCatalogOrigin = "observed" | "sheetcraft";
type Label = Record<EquationLocale, string>;
const label = (en: string, zh: string): Label => ({ "en-US": en, "zh-CN": zh });

export const EQUATION_PRESET_IDS = [
  "area-of-circle",
  "binomial-theorem",
  "expansion-of-sum",
  "fourier-series",
  "pythagorean-theorem",
  "quadratic-formula",
  "taylor-expansion",
  "trig-identity-1",
  "trig-identity-2",
  "law-of-sines",
  "law-of-cosines",
  "fundamental-calculus",
  "average",
] as const;
export type EquationPresetId = (typeof EQUATION_PRESET_IDS)[number];
export const EQUATION_STRUCTURE_CATEGORIES = [
  { id: "fraction", label: label("Fraction", "分数") },
  { id: "script", label: label("Script in Equation", "上下标") },
  { id: "radical", label: label("Radical", "根式") },
  { id: "integral", label: label("Integral", "积分") },
  { id: "large-operator", label: label("Large Operator", "大型运算符") },
  { id: "bracket", label: label("Bracket", "括号") },
  { id: "function", label: label("Function", "函数") },
  { id: "accent", label: label("Accent in Equation", "重音符号") },
  { id: "limit-log", label: label("Limit and Log", "极限和对数") },
  { id: "operator", label: label("Operator", "运算符") },
  { id: "matrix", label: label("Matrix in Equation", "矩阵") },
] as const;
export type EquationStructureCategoryId = (typeof EQUATION_STRUCTURE_CATEGORIES)[number]["id"];

/** Public math semantics; every node and every editable slot receives a fresh ID. */
function maker(createId: EquationIdFactory, preview = false) {
  const text = (value: string): EquationNode => ({ id: createId(), kind: "text", value });
  const latex = (value: string): EquationNode => ({ id: createId(), kind: "latex", value });
  const seq = (...children: (EquationNode | string)[]): EquationSequence => ({
    id: createId(),
    kind: "sequence",
    children: children.length
      ? children.map((child) => (typeof child === "string" ? text(child) : child))
      : preview
        ? [text("□")]
        : [],
  });
  const fraction = (
    numerator = seq(),
    denominator = seq(),
    style: EquationFractionStyle = "stacked",
  ): EquationNode => ({ id: createId(), kind: "fraction", numerator, denominator, style });
  const script = (
    base = seq(),
    superscript?: EquationSequence,
    subscript?: EquationSequence,
    presuperscript?: EquationSequence,
    presubscript?: EquationSequence,
  ): EquationNode => ({
    id: createId(),
    kind: "script",
    base,
    ...(superscript ? { superscript } : {}),
    ...(subscript ? { subscript } : {}),
    ...(presuperscript ? { presuperscript } : {}),
    ...(presubscript ? { presubscript } : {}),
  });
  const radical = (radicand = seq(), degree?: EquationSequence): EquationNode => ({
    id: createId(),
    kind: "radical",
    radicand,
    ...(degree ? { degree } : {}),
  });
  const nary = (
    operator: EquationNaryOperator,
    body = seq(),
    lower?: EquationSequence,
    upper?: EquationSequence,
    limits: "auto" | "under-over" | "side" = "auto",
  ): EquationNode => ({
    id: createId(),
    kind: "nary",
    operator,
    body,
    limits,
    ...(lower ? { lower } : {}),
    ...(upper ? { upper } : {}),
  });
  const delimiter = (
    left: EquationDelimiterName,
    right: EquationDelimiterName,
    body = seq(),
  ): EquationNode => ({ id: createId(), kind: "delimiter", left, right, body });
  const func = (name: string, body = seq()): EquationNode => ({
    id: createId(),
    kind: "function",
    name,
    body,
  });
  const accent = (name: EquationAccentName, body = seq()): EquationNode => ({
    id: createId(),
    kind: "accent",
    name,
    body,
  });
  const box = (body = seq()): EquationNode => ({ id: createId(), kind: "box", body });
  const limit = (
    name: EquationLimitName,
    body = seq(),
    subscript?: EquationSequence,
  ): EquationNode => ({
    id: createId(),
    kind: "limit",
    name,
    body,
    ...(subscript ? { subscript } : {}),
  });
  const annotation = (
    position: "over" | "under",
    base = seq(),
    annotation = seq(),
  ): EquationNode => ({ id: createId(), kind: "annotation", position, base, annotation });
  const matrix = (
    rowCount: number,
    columnCount: number,
    brackets: EquationMatrixBrackets = "none",
    identity = false,
    diagonalOnly = false,
  ): EquationNode => ({
    id: createId(),
    kind: "matrix",
    brackets,
    alignment: "center",
    rows: Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) =>
        identity
          ? row === column
            ? seq("1")
            : diagonalOnly
              ? { id: createId(), kind: "sequence", children: [] }
              : seq("0")
          : seq(),
      ),
    ),
  });
  const power = (base: string | EquationNode, exponent: string) => script(seq(base), seq(exponent));
  const sub = (base: string, index: string) => script(seq(base), undefined, seq(index));
  const quadratic = () => fraction(seq("−b±", radical(seq(power("b", "2"), "−4ac"))), seq("2a"));
  return {
    text,
    latex,
    seq,
    fraction,
    script,
    radical,
    nary,
    delimiter,
    func,
    accent,
    box,
    limit,
    annotation,
    matrix,
    power,
    sub,
    quadratic,
  };
}
type Maker = ReturnType<typeof maker>;

function presetBody(id: EquationPresetId, m: Maker): EquationSequence {
  const { seq: s, power: p, sub, fraction: f, func, delimiter: d, nary, accent } = m;
  switch (id) {
    case "area-of-circle":
      return s("A=π", p("r", "2"));
    case "binomial-theorem":
      return s(
        p(d("paren-open", "paren-close", s("x+a")), "n"),
        "=",
        nary(
          "sum",
          s(
            d("paren-open", "paren-close", s(f(s("n"), s("k"), "no-bar"))),
            p("x", "k"),
            p("a", "n−k"),
          ),
          s("k=0"),
          s("n"),
          "under-over",
        ),
      );
    case "expansion-of-sum":
      return s(
        p(d("paren-open", "paren-close", s("1+x")), "n"),
        "=1+",
        f(s("nx"), s("1!")),
        "+",
        f(s("n(n−1)", p("x", "2")), s("2!")),
        "+⋯",
      );
    case "fourier-series":
      return s(
        s("f", d("paren-open", "paren-close", s("x"))),
        "=",
        f(s(sub("a", "0")), s("2")),
        "+",
        nary(
          "sum",
          s(
            d(
              "paren-open",
              "paren-close",
              s(
                sub("a", "n"),
                func("cos", s(f(s("nπx"), s("L")))),
                "+",
                sub("b", "n"),
                func("sin", s(f(s("nπx"), s("L")))),
              ),
            ),
          ),
          s("n=1"),
          s("∞"),
          "under-over",
        ),
      );
    case "pythagorean-theorem":
      return s(p("a", "2"), "+", p("b", "2"), "=", p("c", "2"));
    case "quadratic-formula":
      return s("x=", m.quadratic());
    case "taylor-expansion":
      return s(
        p("e", "x"),
        "=1+",
        f(s("x"), s("1!")),
        "+",
        f(s(p("x", "2")), s("2!")),
        "+",
        f(s(p("x", "3")), s("3!")),
        "+⋯, −∞<x<∞",
      );
    case "trig-identity-1":
      return s(
        func("sin", s("α")),
        "±",
        func("sin", s("β")),
        "=2",
        func("sin", s(f(s("1"), s("2")), d("paren-open", "paren-close", s("α±β")))),
        func("cos", s(f(s("1"), s("2")), d("paren-open", "paren-close", s("α∓β")))),
      );
    case "trig-identity-2":
      return s(
        func("cos", s("α")),
        "+",
        func("cos", s("β")),
        "=2",
        func("cos", s(f(s("1"), s("2")), d("paren-open", "paren-close", s("α+β")))),
        func("cos", s(f(s("1"), s("2")), d("paren-open", "paren-close", s("α−β")))),
      );
    case "law-of-sines":
      return s(
        f(s("a"), s(func("sin", s("A")))),
        "=",
        f(s("b"), s(func("sin", s("B")))),
        "=",
        f(s("c"), s(func("sin", s("C")))),
        "=2R",
      );
    case "law-of-cosines":
      return s(p("c", "2"), "=", p("a", "2"), "+", p("b", "2"), "−2ab", func("cos", s("C")));
    case "fundamental-calculus":
      return s(
        nary("int", s(s("f", d("paren-open", "paren-close", s("x"))), "dx"), s("a"), s("b")),
        "=",
        s("F", d("paren-open", "paren-close", s("b"))),
        "−",
        s("F", d("paren-open", "paren-close", s("a"))),
      );
    case "average":
      return s(
        accent("bar", s("x")),
        "=",
        f(s("1"), s("n")),
        nary("sum", s(sub("x", "i")), s("i=1"), s("n"), "under-over"),
      );
  }
}
const presetLabels: Label[] = [
  label("Area of Circle", "圆的面积"),
  label("Binomial Theorem", "二项式定理"),
  label("Expansion of a Sum", "和的展开式"),
  label("Fourier Series", "傅里叶级数"),
  label("Pythagorean Theorem", "勾股定理"),
  label("Quadratic Formula", "一元二次方程求根公式"),
  label("Taylor Expansion", "泰勒展开式"),
  label("Trig Identity 1", "三角恒等式 1"),
  label("Trig Identity 2", "三角恒等式 2"),
  label("Law of Sines", "正弦定理"),
  label("Law of Cosines", "余弦定理"),
  label("Fundamental Theorem of Calculus", "微积分基本定理"),
  label("Average", "平均值"),
];
export function createEquationPreset(
  id: EquationPresetId,
  createId: EquationIdFactory,
): EquationDocument {
  if (!(EQUATION_PRESET_IDS as readonly string[]).includes(id))
    throw new TypeError("Unknown equation preset.");
  return { kind: "equation-document-v1", body: presetBody(id, maker(createId)) };
}
function previewIdFactory(): EquationIdFactory {
  let id = 0;
  return () => `preview-${++id}`;
}
export const EQUATION_PRESETS = EQUATION_PRESET_IDS.map((id, index) => ({
  id,
  label: presetLabels[index]!,
  source: serializeEquationDocument(createEquationPreset(id, previewIdFactory())),
}));

export type EquationTemplate = {
  id: string;
  category: EquationStructureCategoryId;
  group: Label;
  label: Label;
  source: string;
  origin: EquationCatalogOrigin;
};
type TemplateDefinition = Omit<EquationTemplate, "source"> & { build: (m: Maker) => EquationNode };
const definitions: TemplateDefinition[] = [];
function template(
  id: string,
  category: EquationStructureCategoryId,
  group: Label,
  title: Label,
  build: TemplateDefinition["build"],
  origin: EquationCatalogOrigin = "sheetcraft",
) {
  definitions.push({ id, category, group, label: title, build, origin });
}
const fractionGroup = label("Fraction", "分数");
for (const [style, en, zh] of [
  ["stacked", "Stacked fraction", "上下型分数"],
  ["skewed", "Skewed fraction", "斜式分数"],
  ["linear", "Linear fraction", "线式分数"],
  ["no-bar", "Stacked without bar", "无横线分数"],
] as const)
  template(
    `fraction-${style}`,
    "fraction",
    fractionGroup,
    label(en, zh),
    (m) => m.fraction(undefined, undefined, style),
    "observed",
  );
for (const [id, numerator, denominator, en, zh] of [
  ["derivative", "dy", "dx", "Derivative dy/dx", "导数 dy/dx"],
  ["delta", "Δy", "Δx", "Difference Δy/Δx", "差分 Δy/Δx"],
  ["partial", "∂y", "∂x", "Partial derivative", "偏导数"],
  ["variation", "δy", "δx", "Variation δy/δx", "变分 δy/δx"],
  ["pi-half", "π", "2", "Pi over two", "二分之 π"],
] as const)
  template(
    `fraction-${id}`,
    "fraction",
    label("Common Fraction", "常用分数"),
    label(en, zh),
    (m) => m.fraction(m.seq(numerator), m.seq(denominator)),
    "observed",
  );
for (const [id, en, zh, degree] of [
  ["square", "Square root", "平方根", undefined],
  ["degree", "Root with degree", "带根指数的根式", ""],
  ["degree-2", "Explicit square root", "二次根式", "2"],
  ["degree-3", "Cube root", "立方根", "3"],
] as const)
  template(
    `radical-${id}`,
    "radical",
    label("Radicals", "根式"),
    label(en, zh),
    (m) =>
      m.radical(undefined, degree === undefined ? undefined : degree ? m.seq(degree) : m.seq()),
    "observed",
  );
template(
  "radical-quadratic",
  "radical",
  label("Common Radicals", "常用根式"),
  label("Quadratic formula", "一元二次方程求根公式"),
  (m) => m.quadratic(),
  "observed",
);
template(
  "radical-pythagorean",
  "radical",
  label("Common Radicals", "常用根式"),
  label("Square root of a²+b²", "a²+b² 的平方根"),
  (m) => m.radical(m.seq(m.power("a", "2"), "+", m.power("b", "2"))),
  "observed",
);
for (const [rows, columns] of [
  [1, 2],
  [2, 1],
  [1, 3],
  [3, 1],
  [2, 2],
  [2, 3],
  [3, 2],
  [3, 3],
])
  template(
    `matrix-${rows}x${columns}`,
    "matrix",
    label("Empty Matrices", "空矩阵"),
    label(`${rows} × ${columns} matrix`, `${rows} × ${columns} 矩阵`),
    (m) => m.matrix(rows!, columns!),
    "observed",
  );
for (const [id, glyph, en, zh] of [
  ["horizontal", "⋯", "Horizontal dots", "横向省略号"],
  ["baseline", "…", "Baseline dots", "基线省略号"],
  ["vertical", "⋮", "Vertical dots", "纵向省略号"],
  ["diagonal", "⋱", "Diagonal dots", "对角省略号"],
] as const)
  template(
    `matrix-dots-${id}`,
    "matrix",
    label("Dots", "省略号"),
    label(en, zh),
    (m) => m.text(glyph),
    "observed",
  );
for (const [size, diagonalOnly] of [
  [2, false],
  [2, true],
  [3, false],
  [3, true],
] as const)
  template(
    `matrix-identity-${size}${diagonalOnly ? "-diagonal" : ""}`,
    "matrix",
    label("Identity Matrices", "单位矩阵"),
    label(
      `${size} × ${size} ${diagonalOnly ? "diagonal ones" : "identity"}`,
      `${size} × ${size} ${diagonalOnly ? "对角单位矩阵" : "单位矩阵"}`,
    ),
    (m) => m.matrix(size, size, "none", true, diagonalOnly),
    "observed",
  );
for (const [brackets, en, zh] of [
  ["paren", "Parentheses", "圆括号矩阵"],
  ["bracket", "Square brackets", "方括号矩阵"],
  ["bar", "Determinant bars", "行列式"],
  ["double-bar", "Double bars", "双竖线矩阵"],
] as const)
  template(
    `matrix-${brackets}`,
    "matrix",
    label("Matrices with Brackets", "带括号的矩阵"),
    label(en, zh),
    (m) => m.matrix(2, 2, brackets),
    "observed",
  );
// Names describe public mathematical semantics, not unobserved proprietary tooltips.
const ownGroup = label("Sheetcraft mathematical choices", "Sheetcraft 数学模板");
const scriptGroup = label("Subscripts and Superscripts", "上下标");
template(
  "script-superscript",
  "script",
  scriptGroup,
  label("Superscript", "上标"),
  (m) => m.script(undefined, m.seq()),
  "observed",
);
template(
  "script-subscript",
  "script",
  scriptGroup,
  label("Subscript", "下标"),
  (m) => m.script(undefined, undefined, m.seq()),
  "observed",
);
template(
  "script-both",
  "script",
  scriptGroup,
  label("Subscript and superscript", "上下标"),
  (m) => m.script(undefined, m.seq(), m.seq()),
  "observed",
);
// Leading scripts are first-class slots, independently editable from their base.
template(
  "script-prescript",
  "script",
  scriptGroup,
  label("Leading subscript and superscript", "前置上下标"),
  (m) => m.script(undefined, undefined, undefined, m.seq(), m.seq()),
  "observed",
);
const commonScript = label("Common Subscripts and Superscripts", "常用上下标");
template(
  "script-x-y-square",
  "script",
  commonScript,
  label("x with subscript y and superscript 2", "x 的下标 y 和上标 2"),
  (m) => m.script(m.seq("x"), m.seq("2"), m.seq("y")),
  "observed",
);
template(
  "script-exponential",
  "script",
  commonScript,
  label("Exponential e to −iωt", "指数 e 的 −iωt 次方"),
  (m) => m.power("e", "−iωt"),
  "observed",
);
template(
  "script-square",
  "script",
  commonScript,
  label("Squared", "平方"),
  (m) => m.power("x", "2"),
  "observed",
);
template(
  "script-leading-n",
  "script",
  commonScript,
  label("Leading n and 1 on Y", "Y 的前置 n 和 1"),
  (m) => m.script(m.seq("Y"), undefined, undefined, m.seq("n"), m.seq("1")),
  "observed",
);

/** Fixed operator names are public mathematical semantics; bounds/body remain real slots. */
function operatorWithSlots(m: Maker, command: EquationNaryOperator, variant: number): EquationNode {
  return m.nary(
    command,
    undefined,
    variant ? m.seq() : undefined,
    variant === 1 || variant === 2 ? m.seq() : undefined,
    variant === 1 || variant === 3 ? "under-over" : "side",
  );
}
const limitVariants = [
  label("without bounds", "无上下限"),
  label("with bounds above and below", "上下限位于上下"),
  label("with bounds on the right", "上下限位于右侧"),
  label("with lower bound below", "下限位于下方"),
  label("with lower bound on the right", "下限位于右侧"),
];
for (const [command, en, zh, group] of [
  ["int", "Integral", "积分", "Integrals"],
  ["iint", "Double integral", "二重积分", "Integrals"],
  ["iiint", "Triple integral", "三重积分", "Integrals"],
  ["oint", "Contour integral", "环路积分", "Contour Integrals"],
  ["oiint", "Double contour integral", "二重环路积分", "Contour Integrals"],
  ["oiiint", "Triple contour integral", "三重环路积分", "Contour Integrals"],
] as const) {
  for (let variant = 0; variant < 3; variant++)
    template(
      `integral-${command}${variant === 0 ? "" : variant === 1 ? "-limits" : "-under-over"}`,
      "integral",
      label(group, group === "Integrals" ? "积分" : "环路积分"),
      label(
        `${en} ${limitVariants[variant]!["en-US"]}`,
        `${zh}（${limitVariants[variant]!["zh-CN"]}）`,
      ),
      (m) => operatorWithSlots(m, command, variant === 1 ? 2 : variant === 2 ? 1 : 0),
      "observed",
    );
}
for (const value of ["dx", "dy", "dθ"])
  template(
    `integral-differential-${value}`,
    "integral",
    label("Differentials", "微分"),
    label(value, value),
    (m) => m.text(value),
    "observed",
  );
for (const [command, en, zh, groupEn, groupZh] of [
  ["sum", "Summation", "求和", "Summations", "求和"],
  ["prod", "Product", "连乘", "Products and Co-Products", "连乘和余积"],
  ["coprod", "Coproduct", "余积", "Products and Co-Products", "连乘和余积"],
  ["bigcup", "Union", "并集", "Unions and Intersections", "并集和交集"],
  ["bigcap", "Intersection", "交集", "Unions and Intersections", "并集和交集"],
  ["bigvee", "Large logical or", "大型逻辑或", "Other Large Operators", "其他大型运算符"],
  ["bigwedge", "Large logical and", "大型逻辑与", "Other Large Operators", "其他大型运算符"],
] as const)
  for (let variant = 0; variant < 5; variant++)
    template(
      `large-${command}${variant ? `-${variant}` : ""}`,
      "large-operator",
      label(groupEn, groupZh),
      label(
        `${en} ${limitVariants[variant]!["en-US"]}`,
        `${zh}（${limitVariants[variant]!["zh-CN"]}）`,
      ),
      (m) => operatorWithSlots(m, command, variant),
      "observed",
    );
const commonLarge = label("Common Large Operators", "常用大型运算符");
template(
  "large-binomial-sum",
  "large-operator",
  commonLarge,
  label("Sum of binomial coefficients", "二项式系数的和"),
  (m) =>
    m.nary(
      "sum",
      m.seq(
        m.delimiter(
          "paren-open",
          "paren-close",
          m.seq(m.fraction(m.seq("n"), m.seq("k"), "no-bar")),
        ),
      ),
      m.seq("k"),
      undefined,
      "under-over",
    ),
  "observed",
);
template(
  "large-sum-n",
  "large-operator",
  commonLarge,
  label("Sum from i=0 to n", "i=0 到 n 的和"),
  (m) => m.nary("sum", undefined, m.seq("i=0"), m.seq("n"), "under-over"),
  "observed",
);
template(
  "large-double-condition",
  "large-operator",
  commonLarge,
  label("Sum of P(i,j) with two conditions", "带两个条件的 P(i,j) 求和"),
  (m) => {
    const conditions = m.matrix(2, 1);
    if (conditions.kind === "matrix") conditions.rows = [[m.seq("0≤i≤m")], [m.seq("0<j<n")]];
    return m.nary(
      "sum",
      m.seq("P", m.delimiter("paren-open", "paren-close", m.seq("i,j"))),
      m.seq(conditions),
      undefined,
      "under-over",
    );
  },
  "observed",
);
template(
  "large-product-ak",
  "large-operator",
  commonLarge,
  label("Product of Aₖ from k=1 to n", "k=1 到 n 的 Aₖ 连乘"),
  (m) => m.nary("prod", m.seq(m.sub("A", "k")), m.seq("k=1"), m.seq("n"), "under-over"),
  "observed",
);
template(
  "large-union-intersections",
  "large-operator",
  commonLarge,
  label("Union of intersections", "交集的并集"),
  (m) =>
    m.nary(
      "bigcup",
      m.seq(m.delimiter("paren-open", "paren-close", m.seq(m.sub("X", "n"), "∩", m.sub("Y", "n")))),
      m.seq("n=1"),
      m.seq("m"),
      "under-over",
    ),
  "observed",
);

const pairs: readonly (readonly [
  string,
  EquationDelimiterName,
  EquationDelimiterName,
  string,
  string,
])[] = [
  ["parentheses", "paren-open", "paren-close", "Parentheses", "圆括号"],
  ["square", "bracket-open", "bracket-close", "Square brackets", "方括号"],
  ["braces", "brace-open", "brace-close", "Braces", "花括号"],
  ["angle", "angle-open", "angle-close", "Angle brackets", "角括号"],
  ["floor", "floor-open", "floor-close", "Floor", "向下取整"],
  ["ceiling", "ceil-open", "ceil-close", "Ceiling", "向上取整"],
  ["absolute", "bar", "bar", "Absolute value", "绝对值"],
  ["norm", "double-bar", "double-bar", "Norm", "范数"],
  ["open-square", "bracket-open", "bracket-open", "Two opening square brackets", "双左方括号"],
  ["close-square", "bracket-close", "bracket-close", "Two closing square brackets", "双右方括号"],
  ["outward-square", "bracket-close", "bracket-open", "Outward square brackets", "外向方括号"],
  ["double-square", "bracket-open", "bracket-close", "Nested square brackets", "嵌套方括号"],
];
for (const [id, left, right, en, zh] of pairs)
  template(
    `bracket-${id}`,
    "bracket",
    label("Brackets", "括号"),
    label(en, zh),
    (m) =>
      id === "double-square"
        ? m.delimiter(left, right, m.seq(m.delimiter(left, right)))
        : m.delimiter(left, right),
    "observed",
  );
for (const id of ["parentheses", "braces", "angle", "angle-two"] as const) {
  const angle = id.startsWith("angle"),
    left = angle ? "angle-open" : id === "braces" ? "brace-open" : "paren-open",
    right = angle ? "angle-close" : id === "braces" ? "brace-close" : "paren-close";
  template(
    `bracket-separator-${id}`,
    "bracket",
    label("Brackets with Separators", "带分隔符的括号"),
    label(
      `${id} with separator`,
      `${id === "parentheses" ? "圆括号" : id === "braces" ? "花括号" : "角括号"}内分隔`,
    ),
    (m) =>
      m.delimiter(
        left,
        right,
        m.seq(m.seq(), "|", m.seq(), ...(id === "angle-two" ? [m.text("|"), m.seq()] : [])),
      ),
    "observed",
  );
}
for (const [id, left, right, en, zh] of pairs.slice(0, 8))
  for (const side of ["left", "right"] as const)
    template(
      `bracket-single-${id}-${side}`,
      "bracket",
      label("Single Brackets", "单侧括号"),
      label(`${side} ${en}`, `${side === "left" ? "左" : "右"}${zh}`),
      (m) => m.delimiter(side === "left" ? left : "none", side === "right" ? right : "none"),
      "observed",
    );
for (const side of ["left", "right"] as const)
  template(
    `bracket-single-double-square-${side}`,
    "bracket",
    label("Single Brackets", "单侧括号"),
    label(`${side} nested square brackets`, `${side === "left" ? "左" : "右"}双层方括号`),
    (m) =>
      m.delimiter(
        side === "left" ? "bracket-open" : "none",
        side === "right" ? "bracket-close" : "none",
        m.seq(
          m.delimiter(
            side === "left" ? "bracket-open" : "none",
            side === "right" ? "bracket-close" : "none",
          ),
        ),
      ),
    "observed",
  );
for (const [id, rows, bracket] of [
  ["cases-2", 2, "brace"],
  ["cases-3", 3, "brace"],
  ["stack-2", 2, "none"],
  ["round-stack", 2, "paren"],
] as const)
  template(
    `bracket-${id}`,
    "bracket",
    label("Cases and Stacks", "分段函数和堆叠"),
    label(
      `${rows}-row ${id.startsWith("cases") ? "cases" : "stack"}`,
      `${rows} 行${id.startsWith("cases") ? "分段结构" : "堆叠"}`,
    ),
    (m) =>
      bracket === "brace"
        ? m.delimiter("brace-open", "none", m.seq(m.matrix(rows, 1)))
        : m.matrix(rows, 1, bracket),
    "observed",
  );
const commonBracket = label("Common Brackets", "常用括号");
template(
  "bracket-absolute-piecewise",
  "bracket",
  commonBracket,
  label("Piecewise absolute-value function", "分段绝对值函数"),
  (m) => {
    const matrix = m.matrix(2, 2);
    if (matrix.kind === "matrix")
      matrix.rows = [
        [m.seq("−x"), m.seq("x<0")],
        [m.seq("x"), m.seq("x≥0")],
      ];
    return m.seq(
      m.seq("f", m.delimiter("paren-open", "paren-close", m.seq("x"))),
      "=",
      m.delimiter("brace-open", "none", m.seq(matrix)),
    );
  },
  "observed",
);
for (const [id, left, right] of [
  ["round-binomial", "paren-open", "paren-close"],
  ["angle-binomial", "angle-open", "angle-close"],
] as const)
  template(
    `bracket-${id}`,
    "bracket",
    commonBracket,
    label(
      `${id === "round-binomial" ? "Round" : "Angle"} binomial n over k`,
      `${id === "round-binomial" ? "圆" : "角"}括号二项式 n/k`,
    ),
    (m) => m.delimiter(left, right, m.seq(m.fraction(m.seq("n"), m.seq("k"), "no-bar"))),
    "observed",
  );

for (const [names, inverse, groupEn, groupZh] of [
  [["sin", "cos", "tan", "csc", "sec", "cot"], false, "Trigonometric Functions", "三角函数"],
  [["sin", "cos", "tan", "csc", "sec", "cot"], true, "Inverse Functions", "反三角函数"],
  [["sinh", "cosh", "tanh", "csch", "sech", "coth"], false, "Hyperbolic Functions", "双曲函数"],
  [
    ["sinh", "cosh", "tanh", "csch", "sech", "coth"],
    true,
    "Inverse Hyperbolic Functions",
    "反双曲函数",
  ],
] as const)
  for (const name of names)
    template(
      `function-${name}${inverse ? "-inverse" : ""}`,
      "function",
      label(groupEn, groupZh),
      label(`${name}${inverse ? "⁻¹" : ""}`, `${name}${inverse ? "⁻¹" : ""}`),
      (m) =>
        inverse
          ? m.seq(m.script(m.seq(m.func(name, m.seq(m.latex("{}")))), m.seq("−1")), m.seq())
          : m.func(name),
      "observed",
    );
const commonFunction = label("Common Functions", "常用函数");
template(
  "function-sin-theta",
  "function",
  commonFunction,
  label("sin θ", "sin θ"),
  (m) => m.func("sin", m.seq("θ")),
  "observed",
);
template(
  "function-cos-2x",
  "function",
  commonFunction,
  label("cos 2x", "cos 2x"),
  (m) => m.func("cos", m.seq("2x")),
  "observed",
);
template(
  "function-tan-ratio",
  "function",
  commonFunction,
  label("tan θ = sin θ / cos θ", "tan θ = sin θ / cos θ"),
  (m) =>
    m.seq(
      m.func("tan", m.seq("θ")),
      "=",
      m.fraction(m.seq(m.func("sin", m.seq("θ"))), m.seq(m.func("cos", m.seq("θ")))),
    ),
  "observed",
);
// Keep older public Sheetcraft IDs as explicit additional mathematical choices.
for (const name of ["arcsin", "arccos", "arctan"])
  template(`function-${name}`, "function", ownGroup, label(name, name), (m) => m.func(name));

for (const [name, en, zh] of [
  ["hat", "Hat", "尖音符"],
  ["bar", "Bar", "上划线"],
  ["vec", "Vector", "向量"],
  ["dot", "Dot", "单点"],
  ["ddot", "Double dot", "双点"],
  ["tilde", "Tilde", "波浪线"],
  ["overbrace", "Overbrace", "上花括号"],
  ["underbrace", "Underbrace", "下花括号"],
] as const)
  template(
    `accent-${name}`,
    "accent",
    label("Accents", "重音符号"),
    label(en, zh),
    (m) => m.accent(name),
    "observed",
  );
// These public commands have clear mathematical meaning; unclear desktop tiles are not guessed.
for (const [command, en, zh] of [
  ["acute", "Acute accent", "锐音符"],
  ["grave", "Grave accent", "重音符"],
  ["breve", "Breve", "短音符"],
  ["check", "Check accent", "抑扬符"],
  ["dddot", "Triple dot", "三点"],
  ["ddddot", "Four dots", "四点"],
  ["overleftarrow", "Left arrow above", "上方左箭头"],
  ["overrightarrow", "Right arrow above", "上方右箭头"],
  ["overleftrightarrow", "Two-way arrow above", "上方双向箭头"],
  ["underleftarrow", "Left arrow below", "下方左箭头"],
  ["underrightarrow", "Right arrow below", "下方右箭头"],
  ["underleftrightarrow", "Two-way arrow below", "下方双向箭头"],
] as const)
  template(`accent-${command}`, "accent", ownGroup, label(en, zh), (m) => m.accent(command));
for (const [id, body] of [
  ["empty", ""],
  ["pythagorean", "a²=b²+c²"],
] as const)
  template(
    `accent-boxed-${id}`,
    "accent",
    label("Boxed Formulas", "带框公式"),
    label(body ? "Boxed a²=b²+c²" : "Boxed formula", body ? "带框 a²=b²+c²" : "带框公式"),
    (m) =>
      m.box(
        body ? m.seq(m.power("a", "2"), "=", m.power("b", "2"), "+", m.power("c", "2")) : m.seq(),
      ),
    "observed",
  );
for (const [command, en, zh] of [
  ["overline", "Overbar", "上划线"],
  ["underline", "Underbar", "下划线"],
] as const)
  template(
    `accent-${command}`,
    "accent",
    label("Overbars and Underbars", "上划线和下划线"),
    label(en, zh),
    (m) => m.accent(command),
    "observed",
  );
for (const value of ["A", "ABC", "x⊕y"])
  template(
    `accent-common-${value}`,
    "accent",
    label("Common Accent Objects", "常用重音对象"),
    label(`Overbar ${value}`, `${value} 上划线`),
    (m) => m.accent("overline", m.seq(value)),
    "observed",
  );

for (const name of ["log", "lim", "min", "max", "ln"] as const)
  template(
    `limit-${name}`,
    "limit-log",
    label("Functions", "函数"),
    label(name, name),
    (m) => m.limit(name, undefined, ["lim", "min", "max"].includes(name) ? m.seq() : undefined),
    "observed",
  );
template(
  "limit-log-base",
  "limit-log",
  label("Functions", "函数"),
  label("Logarithm with editable base", "可编辑底数的对数"),
  (m) => m.limit("log", undefined, m.seq()),
  "observed",
);
template(
  "limit-common-e",
  "limit-log",
  label("Common Functions", "常用函数"),
  label("Limit of (1+1/n)ⁿ", "(1+1/n)ⁿ 的极限"),
  (m) =>
    m.limit(
      "lim",
      m.seq(
        m.script(
          m.seq(
            m.delimiter(
              "paren-open",
              "paren-close",
              m.seq("1+", m.fraction(m.seq("1"), m.seq("n"))),
            ),
          ),
          m.seq("n"),
        ),
      ),
      m.seq("n→∞"),
    ),
  "observed",
);
template(
  "limit-common-max",
  "limit-log",
  label("Common Functions", "常用函数"),
  label("Maximum of x e^(−x²)", "x e^(−x²) 的最大值"),
  (m) =>
    m.limit("max", m.seq("x", m.script(m.seq("e"), m.seq("−", m.power("x", "2")))), m.seq("0≤x≤1")),
  "observed",
);

const basicOperators = label("Basic Operators", "基本运算符");
for (const [id, source, en, zh] of [
  ["colon-equals", ":=", "Colon equals", "冒号等号"],
  ["equals-equals", "==", "Double equals", "双等号"],
  ["plus-equals", "+=", "Plus equals", "加等号"],
  ["minus-equals", "−=", "Minus equals", "减等号"],
] as const)
  template(
    `operator-${id}`,
    "operator",
    basicOperators,
    label(en, zh),
    (m) => m.text(source),
    "observed",
  );
for (const [id, value, en, zh] of [
  ["definition", "def", "Definition above equals", "等号上方定义"],
  ["m", "m", "m above equals", "等号上方 m"],
  ["delta", "Δ", "Delta above equals", "等号上方 Δ"],
] as const)
  template(
    `operator-equals-${id}`,
    "operator",
    basicOperators,
    label(en, zh),
    (m) => m.annotation("over", m.seq("="), m.seq(value)),
    "observed",
  );
for (const [id, command, en, zh] of [
  ["left", "leftarrow", "Left arrow", "左箭头"],
  ["right", "rightarrow", "Right arrow", "右箭头"],
  ["double-left", "Leftarrow", "Double left arrow", "双线左箭头"],
  ["double-right", "Rightarrow", "Double right arrow", "双线右箭头"],
  ["both", "leftrightarrow", "Two-way arrow", "双向箭头"],
  ["double-both", "Leftrightarrow", "Double two-way arrow", "双线双向箭头"],
] as const)
  for (const position of ["under", "over"] as const)
    template(
      `operator-${id}-${position}`,
      "operator",
      label("Operator Structures", "运算符结构"),
      label(
        `${en} with ${position} annotation`,
        `${zh}${position === "over" ? "上方" : "下方"}标注`,
      ),
      (m) => m.annotation(position, m.seq(m.latex(`\\${command}`))),
      "observed",
    );
template(
  "operator-yields",
  "operator",
  label("Common Operator Structures", "常用运算符结构"),
  label("Yields above right arrow", "右箭头上方 yields"),
  (m) => m.annotation("over", m.seq(m.latex("\\rightarrow")), m.seq("yields")),
  "observed",
);
template(
  "operator-right-a",
  "operator",
  label("Common Operator Structures", "常用运算符结构"),
  label("A above right arrow", "右箭头上方 A"),
  (m) => m.annotation("over", m.seq(m.latex("\\rightarrow")), m.seq("A")),
  "observed",
);
template("operator-over", "operator", ownGroup, label("Over annotation", "上方标注"), (m) =>
  m.annotation("over"),
);
template("operator-under", "operator", ownGroup, label("Under annotation", "下方标注"), (m) =>
  m.annotation("under"),
);
template(
  "operator-equals",
  "operator",
  ownGroup,
  label("Annotated equality", "等号上方标注"),
  (m) => m.annotation("over", m.seq("=")),
);
for (const brackets of ["paren", "bracket"] as const)
  template(
    `matrix-sparse-${brackets}`,
    "matrix",
    label("Sparse Matrices", "稀疏矩阵"),
    label(
      `${brackets === "paren" ? "Parenthesized" : "Square-bracketed"} matrix with ellipses`,
      `${brackets === "paren" ? "圆" : "方"}括号省略矩阵`,
    ),
    (m) => {
      const matrix = m.matrix(3, 3, brackets);
      if (matrix.kind === "matrix")
        matrix.rows = [
          [m.seq(), m.seq("⋯"), m.seq()],
          [m.seq("⋮"), m.seq("⋱"), m.seq("⋮")],
          [m.seq(), m.seq("⋯"), m.seq()],
        ];
      return matrix;
    },
    "observed",
  );
export const EQUATION_TEMPLATES: readonly EquationTemplate[] = definitions.map(
  ({ build, ...choice }) => {
    const m = maker(previewIdFactory(), true);
    return {
      ...choice,
      source: serializeEquationDocument({ kind: "equation-document-v1", body: m.seq(build(m)) }),
    };
  },
);
export function createEquationTemplate(id: string, createId: EquationIdFactory): EquationNode {
  const definition = definitions.find((choice) => choice.id === id);
  if (!definition) throw new TypeError("Unknown equation template.");
  return definition.build(maker(createId));
}
export function getEquationTemplates(
  category: EquationStructureCategoryId,
): readonly EquationTemplate[] {
  return EQUATION_TEMPLATES.filter((choice) => choice.category === category);
}

/** Controlled public math literals/commands, never user-provided HTML or proprietary sprites. */
export type EquationSymbolInsertion = { kind: "text" | "latex"; value: string };
export type EquationSymbol = {
  id: string;
  label: Label;
  group: Label;
  source: string;
  insertion: EquationSymbolInsertion;
};
export const EQUATION_MATH_SOURCE = {
  renderer: "KaTeX",
  font: "Bundled KaTeX mathematical fonts",
  supportedCommands: "https://katex.org/docs/supported.html",
  unicode: "https://www.unicode.org/charts/",
} as const;
function symbols(
  category: string,
  entries: readonly (readonly [string, string, string, string?])[],
  group: Label = label("Symbols", "符号"),
): EquationSymbol[] {
  return entries.map(([value, en, zh, command], index) => ({
    id: `${category}-${index}`,
    label: label(en, zh),
    group,
    source: command ?? value,
    insertion: { kind: command ? "latex" : "text", value: command ?? value },
  }));
}
export const EQUATION_SYMBOL_CATEGORIES = [
  {
    id: "basic",
    label: label("Basic Math", "基本数学"),
    symbols: symbols("basic", [
      ["±", "Plus-minus", "正负号"],
      ["∞", "Infinity", "无穷大"],
      ["=", "Equals", "等于"],
      ["≠", "Not equal", "不等于"],
      ["≈", "Approximately equal", "约等于"],
      ["~", "Similar", "相似", "\\sim"],
      ["×", "Multiplication", "乘号"],
      ["÷", "Division", "除号"],
      ["!", "Factorial", "阶乘"],
      ["∝", "Proportional", "正比"],
      ["<", "Less than", "小于"],
      ["≪", "Much less than", "远小于"],
      [">", "Greater than", "大于"],
      ["≫", "Much greater than", "远大于"],
      ["≤", "Less than or equal", "小于等于"],
      ["≥", "Greater than or equal", "大于等于"],
      ["∓", "Minus-plus", "负正号"],
      ["≅", "Congruent", "全等"],
      ["≡", "Equivalent", "恒等"],
      ["∀", "For all", "任意"],
      ["∂", "Partial differential", "偏微分"],
      ["√", "Square root sign", "根号", "\\surd"],
      ["∪", "Union", "并集"],
      ["∩", "Intersection", "交集"],
      ["∅", "Empty set", "空集"],
      ["%", "Percent", "百分号", "\\%"],
      ["°", "Degree", "度", "{}^{\\circ}"],
      ["∇", "Nabla", "梯度"],
      ["∃", "Exists", "存在"],
      ["∄", "Does not exist", "不存在", "\\nexists"],
      ["∈", "Element of", "属于"],
      ["∉", "Not an element", "不属于"],
      ["+", "Plus", "加号"],
      ["−", "Minus", "减号"],
      ["¬", "Negation", "否定"],
      ["α", "Alpha", "阿尔法"],
      ["β", "Beta", "贝塔"],
      ["γ", "Gamma", "伽马"],
      ["δ", "Delta", "德尔塔"],
      ["ε", "Epsilon", "艾普西隆"],
      ["θ", "Theta", "西塔"],
      ["μ", "Mu", "缪"],
      ["π", "Pi", "派"],
      ["φ", "Phi", "斐"],
      ["ω", "Omega", "欧米伽"],
      ["⋅", "Dot operator", "点乘"],
      ["⋮", "Vertical ellipsis", "纵向省略号"],
      ["⋯", "Centered ellipsis", "横向省略号"],
      ["⋱", "Diagonal ellipsis", "对角省略号"],
      ["∴", "Therefore", "所以"],
      ["∵", "Because", "因为"],
    ]),
  },
  {
    id: "greek",
    label: label("Greek Letters", "希腊字母"),
    symbols: symbols("greek", [
      ["α", "Alpha", "阿尔法"],
      ["β", "Beta", "贝塔"],
      ["γ", "Gamma", "伽马"],
      ["δ", "Delta", "德尔塔"],
      ["ε", "Epsilon", "艾普西隆"],
      ["ϵ", "Variant epsilon", "异体艾普西隆", "\\varepsilon"],
      ["ζ", "Zeta", "泽塔"],
      ["η", "Eta", "伊塔"],
      ["θ", "Theta", "西塔"],
      ["ϑ", "Variant theta", "异体西塔", "\\vartheta"],
      ["ι", "Iota", "约塔"],
      ["κ", "Kappa", "卡帕"],
      ["λ", "Lambda", "拉姆达"],
      ["μ", "Mu", "缪"],
      ["ν", "Nu", "纽"],
      ["ξ", "Xi", "克西"],
      ["ο", "Omicron", "奥密克戎"],
      ["π", "Pi", "派"],
      ["ϖ", "Variant pi", "异体派", "\\varpi"],
      ["ρ", "Rho", "柔"],
      ["σ", "Sigma", "西格玛"],
      ["ς", "Final sigma", "词尾西格玛", "\\varsigma"],
      ["τ", "Tau", "陶"],
      ["υ", "Upsilon", "宇普西隆"],
      ["φ", "Phi", "斐"],
      ["ϕ", "Variant phi", "异体斐", "\\varphi"],
      ["χ", "Chi", "希"],
      ["ψ", "Psi", "普西"],
      ["ω", "Omega", "欧米伽"],
      ["Γ", "Capital gamma", "大写伽马"],
      ["Δ", "Capital delta", "大写德尔塔"],
      ["Θ", "Capital theta", "大写西塔"],
      ["Λ", "Capital lambda", "大写拉姆达"],
      ["Ξ", "Capital xi", "大写克西"],
      ["Π", "Capital pi", "大写派"],
      ["Σ", "Capital sigma", "大写西格玛"],
      ["Υ", "Capital upsilon", "大写宇普西隆"],
      ["Φ", "Capital phi", "大写斐"],
      ["Ψ", "Capital psi", "大写普西"],
      ["Ω", "Capital omega", "大写欧米伽"],
    ]),
  },
  {
    id: "letter-like",
    label: label("Letter-Like Symbols", "类字母符号"),
    symbols: symbols("letter-like", [
      ["ℵ", "Aleph", "阿列夫", "\\aleph"],
      ["ℶ", "Beth", "贝特", "\\beth"],
      ["ℷ", "Gimel", "吉梅尔", "\\gimel"],
      ["ℸ", "Daleth", "达列特", "\\daleth"],
      ["ℏ", "Reduced Planck constant", "约化普朗克常数", "\\hbar"],
      ["ℓ", "Script ell", "花体 l", "\\ell"],
      ["℘", "Weierstrass p", "魏尔斯特拉斯 p", "\\wp"],
      ["ℜ", "Real part", "实部", "\\Re"],
      ["ℑ", "Imaginary part", "虚部", "\\Im"],
      ["ℂ", "Complex numbers", "复数集", "\\mathbb{C}"],
      ["ℕ", "Natural numbers", "自然数集", "\\mathbb{N}"],
      ["ℚ", "Rational numbers", "有理数集", "\\mathbb{Q}"],
      ["ℝ", "Real numbers", "实数集", "\\mathbb{R}"],
      ["ℤ", "Integers", "整数集", "\\mathbb{Z}"],
      ["ℱ", "Script F", "花体 F", "\\mathcal{F}"],
      ["ℒ", "Script L", "花体 L", "\\mathcal{L}"],
    ]),
  },
  {
    id: "operators",
    label: label("Operators", "运算符"),
    symbols: symbols("operators", [
      ["+", "Plus", "加号"],
      ["−", "Minus", "减号"],
      ["×", "Times", "乘号"],
      ["÷", "Divide", "除号"],
      ["∗", "Asterisk", "星号", "\\ast"],
      ["∘", "Composition", "复合", "\\circ"],
      ["∙", "Bullet", "圆点", "\\bullet"],
      ["⊕", "Direct sum", "直和", "\\oplus"],
      ["⊗", "Tensor product", "张量积", "\\otimes"],
      ["⊙", "Circled dot", "圈点", "\\odot"],
      ["∧", "Logical and", "逻辑与"],
      ["∨", "Logical or", "逻辑或"],
      ["∖", "Set difference", "集合差", "\\setminus"],
      ["⊂", "Subset", "子集"],
      ["⊆", "Subset or equal", "子集或相等"],
      ["⊃", "Superset", "超集"],
      ["⊇", "Superset or equal", "超集或相等"],
      ["∑", "Sum operator", "求和运算符", "\\sum"],
      ["∏", "Product operator", "连乘运算符", "\\prod"],
      ["∫", "Integral operator", "积分运算符", "\\int"],
    ]),
  },
  {
    id: "arrows",
    label: label("Arrows", "箭头"),
    symbols: symbols("arrows", [
      ["←", "Left arrow", "左箭头"],
      ["→", "Right arrow", "右箭头"],
      ["↔", "Left-right arrow", "双向箭头"],
      ["↑", "Up arrow", "上箭头"],
      ["↓", "Down arrow", "下箭头"],
      ["↕", "Up-down arrow", "上下箭头"],
      ["⇐", "Double left arrow", "双线左箭头"],
      ["⇒", "Implies", "推出"],
      ["⇔", "If and only if", "当且仅当"],
      ["⇑", "Double up arrow", "双线上箭头"],
      ["⇓", "Double down arrow", "双线下箭头"],
      ["↦", "Maps to", "映射到", "\\mapsto"],
      ["↗", "North-east arrow", "右上箭头", "\\nearrow"],
      ["↘", "South-east arrow", "右下箭头", "\\searrow"],
      ["↙", "South-west arrow", "左下箭头", "\\swarrow"],
      ["↖", "North-west arrow", "左上箭头", "\\nwarrow"],
      ["↪", "Hook right arrow", "右钩箭头", "\\hookrightarrow"],
      ["↩", "Hook left arrow", "左钩箭头", "\\hookleftarrow"],
      ["⟶", "Long right arrow", "长右箭头", "\\longrightarrow"],
      ["⟺", "Long equivalence arrow", "长等价箭头", "\\Longleftrightarrow"],
    ]),
  },
  {
    id: "negated-relations",
    label: label("Negated Relations", "求反关系符"),
    symbols: symbols("negated", [
      ["≠", "Not equal", "不等于", "\\ne"],
      ["≮", "Not less than", "不小于", "\\nless"],
      ["≯", "Not greater than", "不大于", "\\ngtr"],
      ["≰", "Not less or equal", "非小于等于", "\\nleq"],
      ["≱", "Not greater or equal", "非大于等于", "\\ngeq"],
      ["≁", "Not similar", "非相似", "\\nsim"],
      ["≇", "Not congruent", "非全等", "\\ncong"],
      ["∉", "Not in", "不属于", "\\notin"],
      ["⊈", "Not subset or equal", "非子集或相等", "\\nsubseteq"],
      ["⊉", "Not superset or equal", "非超集或相等", "\\nsupseteq"],
      ["∤", "Does not divide", "不能整除", "\\nmid"],
      ["∦", "Not parallel", "不平行", "\\nparallel"],
      ["⊬", "Does not prove", "不能证明", "\\nvdash"],
      ["⊭", "Does not model", "非模型", "\\nvDash"],
    ]),
  },
  {
    id: "scripts",
    label: label("Scripts", "手写体"),
    symbols: [
      ...symbols(
        "scripts",
        [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"].map(
          (value) => [value, `Script ${value}`, `花体 ${value}`, `\\mathcal{${value}}`] as const,
        ),
        label("Scripts", "手写体"),
      ),
      ...symbols(
        "fraktur",
        [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"].map(
          (value) =>
            [value, `Fraktur ${value}`, `哥特体 ${value}`, `\\mathfrak{${value}}`] as const,
        ),
        label("Frakturs", "哥特体"),
      ),
      ...symbols(
        "double-struck",
        [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"].map(
          (value) =>
            [value, `Double-struck ${value}`, `双线体 ${value}`, `\\mathbb{${value}}`] as const,
        ),
        label("Double-Struck", "双线体"),
      ),
    ],
  },
  {
    id: "geometry",
    label: label("Geometry", "几何"),
    symbols: symbols("geometry", [
      ["∠", "Angle", "角", "\\angle"],
      ["∡", "Measured angle", "测量角", "\\measuredangle"],
      ["∢", "Spherical angle", "球面角", "\\sphericalangle"],
      ["△", "Triangle", "三角形", "\\triangle"],
      ["□", "Square", "正方形", "\\square"],
      ["∥", "Parallel", "平行", "\\parallel"],
      ["⊥", "Perpendicular", "垂直", "\\perp"],
      ["≅", "Congruent", "全等", "\\cong"],
      ["∼", "Similar", "相似", "\\sim"],
      ["°", "Degree", "度", "{}^{\\circ}"],
      ["′", "Prime", "角分", "{}^{\\prime}"],
      ["″", "Double prime", "角秒", "{}^{\\prime\\prime}"],
      ["⌢", "Frown arc", "弧", "\\frown"],
      ["⊙", "Circle dot", "圆心", "\\odot"],
    ]),
  },
] as const;
export type EquationSymbolCategoryId = (typeof EQUATION_SYMBOL_CATEGORIES)[number]["id"];

// Group headings were observed. Individual public symbol names are independently authored.
for (const category of EQUATION_SYMBOL_CATEGORIES) {
  for (const symbol of category.symbols) {
    if (category.id === "scripts") continue;
    if (category.id === "greek")
      symbol.group = symbol.label["en-US"].startsWith("Capital")
        ? label("Uppercase", "大写")
        : label("Lowercase", "小写");
    else if (category.id === "operators") {
      const index = Number(symbol.id.split("-").at(-1));
      symbol.group =
        index < 13
          ? label("Common Binary Operators", "常用二元运算符")
          : index < 17
            ? label("Common Relational Operators", "常用关系运算符")
            : label("Basic N-ary Operators", "基本多元运算符");
    } else symbol.group = category.label;
  }
}

const operatorSymbols = EQUATION_SYMBOL_CATEGORIES.find(
  (category) => category.id === "operators",
)!.symbols;
operatorSymbols.push(
  ...symbols(
    "advanced-binary",
    [
      ["⊞", "Boxed plus", "方框加号", "\\boxplus"],
      ["⊟", "Boxed minus", "方框减号", "\\boxminus"],
      ["⊠", "Boxed multiplication", "方框乘号", "\\boxtimes"],
      ["⊡", "Boxed dot", "方框点", "\\boxdot"],
      ["⊎", "Multiset union", "多重集并集", "\\uplus"],
      ["⊓", "Square intersection", "方形交集", "\\sqcap"],
      ["⊔", "Square union", "方形并集", "\\sqcup"],
      ["⋆", "Star operator", "星运算符", "\\star"],
      ["⋄", "Diamond operator", "菱形运算符", "\\diamond"],
      ["†", "Dagger", "剑号", "\\dagger"],
      ["‡", "Double dagger", "双剑号", "\\ddagger"],
      ["≀", "Wreath product", "圈积", "\\wr"],
    ],
    label("Advanced Binary Operators", "高级二元运算符"),
  ),
);
operatorSymbols.push(
  ...symbols(
    "advanced-relation",
    [
      ["≺", "Precedes", "先于", "\\prec"],
      ["≻", "Succeeds", "后于", "\\succ"],
      ["≼", "Precedes or equal", "先于或等于", "\\preceq"],
      ["≽", "Succeeds or equal", "后于或等于", "\\succeq"],
      ["⊏", "Square subset", "方形子集", "\\sqsubset"],
      ["⊐", "Square superset", "方形超集", "\\sqsupset"],
      ["⊑", "Square subset or equal", "方形子集或等于", "\\sqsubseteq"],
      ["⊒", "Square superset or equal", "方形超集或等于", "\\sqsupseteq"],
      ["⊢", "Proves", "推出证明", "\\vdash"],
      ["⊣", "Reverse proves", "反向证明", "\\dashv"],
      ["⊨", "Models", "满足模型", "\\models"],
      ["⋈", "Bowtie relation", "蝴蝶结关系", "\\bowtie"],
    ],
    label("Advanced Relational Operators", "高级关系运算符"),
  ),
);
