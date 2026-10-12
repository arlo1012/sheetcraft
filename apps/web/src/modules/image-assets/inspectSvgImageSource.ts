import {
  assertImagePixelBudget,
  ImageAssetError,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  type ImageDimensions,
} from "./imageAssetValidation";

export type SvgImageSourceErrorReason =
  | "invalid-xml"
  | "unsafe-content"
  | "external-resource"
  | "unsupported-feature"
  | "invalid-dimensions"
  | "pixel-limit"
  | "complexity-limit";

/** A closed, deliberately limited import vocabulary, not an SVG conformance claim. */
export class SvgImageSourceError extends ImageAssetError {
  constructor(readonly reason: SvgImageSourceErrorReason) {
    super(reason === "pixel-limit" ? "pixel-limit" : "invalid-image");
    this.name = "SvgImageSourceError";
  }
}

export type SvgImageSource = ImageDimensions & {
  mimeType: "image/svg+xml";
  bytes: Uint8Array<ArrayBuffer>;
  normalizedViewport: boolean;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const MAX_ELEMENTS = 2048;
const MAX_DEPTH = 32;
const MAX_TEXT = 256 * 1024;
const MAX_ATTRIBUTE = 64 * 1024;
const MAX_NUMBERS = 32768;
const MAX_EXPANSION = 8192;
const MAX_RENDER_WORK = 262144;
const MAX_COORDINATE = 1_000_000;
const ID = "[A-Za-z_][A-Za-z0-9_.-]*";
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const LENGTH = new RegExp(`^(${NUMBER})(px|in|cm|mm|Q|q|pt|pc|%)?$`);
const UNIT_SCALE: Readonly<Record<string, number>> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  Q: 96 / 101.6,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
};
const ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "style",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "use",
]);
const DRAWING_ELEMENTS = new Set([
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "use",
]);
const NUMERIC_ATTRIBUTES = new Set([
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "fr",
  "width",
  "height",
  "dx",
  "dy",
  "rotate",
  "pathLength",
  "textLength",
  "offset",
]);
const NONNEGATIVE_ATTRIBUTES = new Set([
  "r",
  "rx",
  "ry",
  "fr",
  "width",
  "height",
  "pathLength",
  "textLength",
]);
const ENUM_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  "fill-rule": ["nonzero", "evenodd", "inherit"],
  "clip-rule": ["nonzero", "evenodd", "inherit"],
  "stroke-linecap": ["butt", "round", "square", "inherit"],
  "stroke-linejoin": ["miter", "round", "bevel", "inherit"],
  "text-anchor": ["start", "middle", "end", "inherit"],
  "font-style": ["normal", "italic", "oblique", "inherit"],
  "font-weight": [
    "normal",
    "bold",
    "bolder",
    "lighter",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "inherit",
  ],
  "font-variant": ["normal", "small-caps", "inherit"],
  "dominant-baseline": [
    "auto",
    "alphabetic",
    "central",
    "middle",
    "hanging",
    "text-before-edge",
    "text-after-edge",
    "ideographic",
    "inherit",
  ],
  "alignment-baseline": [
    "auto",
    "baseline",
    "alphabetic",
    "central",
    "middle",
    "hanging",
    "before-edge",
    "after-edge",
    "text-before-edge",
    "text-after-edge",
    "ideographic",
    "inherit",
  ],
  visibility: ["visible", "hidden", "collapse", "inherit"],
  display: ["inline", "none", "inherit"],
  "vector-effect": ["none", "non-scaling-stroke"],
  "shape-rendering": ["auto", "optimizeSpeed", "crispEdges", "geometricPrecision", "inherit"],
  "text-rendering": [
    "auto",
    "optimizeSpeed",
    "optimizeLegibility",
    "geometricPrecision",
    "inherit",
  ],
  "color-interpolation": ["auto", "sRGB", "linearRGB", "inherit"],
  "paint-order": ["normal", "fill", "stroke", "fill stroke", "stroke fill", "inherit"],
  "mask-type": ["luminance", "alpha"],
};

type ReferenceKind = "use" | "gradient" | "paint" | "clip-path" | "mask";
type Reference = { id: string; kind: ReferenceKind };
type Matrix = [number, number, number, number, number, number];
type ElementInfo = {
  element: Element;
  children: ElementInfo[];
  references: Reference[];
  transform: Matrix;
  work: number;
  surface: boolean;
  geometryCost: number;
};
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function fail(reason: SvgImageSourceErrorReason): never {
  throw new SvgImageSourceError(reason);
}

function xmlCharacters(text: string): void {
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) fail("invalid-xml");
    if (code === 0xfffe || code === 0xffff) fail("invalid-xml");
  }
}

function characterReferences(text: string): void {
  for (let start = text.indexOf("&"); start !== -1; start = text.indexOf("&", start + 1)) {
    const end = text.indexOf(";", start + 1);
    if (end < 0 || end - start > 16) fail("invalid-xml");
    const value = text.slice(start + 1, end);
    if (["amp", "lt", "gt", "apos", "quot"].includes(value)) continue;
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(value)) fail("unsafe-content");
    const code = value.startsWith("#x") ? parseInt(value.slice(2), 16) : Number(value.slice(1));
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail("invalid-xml");
    xmlCharacters(String.fromCodePoint(code));
  }
}

/** Limits allocation before native XML parsing; native parsing still verifies XML/namespaces. */
function preflightXml(text: string): void {
  xmlCharacters(text);
  let offset = 0;
  let elements = 0;
  let roots = 0;
  let textLength = 0;
  const stack: string[] = [];
  while (offset < text.length) {
    if (text[offset] !== "<") {
      const end = text.indexOf("<", offset);
      const content = text.slice(offset, end < 0 ? text.length : end);
      if ((!stack.length && content.trim()) || content.includes("]]>")) fail("invalid-xml");
      characterReferences(content);
      textLength += content.length;
      if (textLength > MAX_TEXT) fail("complexity-limit");
      offset += content.length;
      continue;
    }
    if (text.startsWith("<!--", offset)) {
      const end = text.indexOf("-->", offset + 4);
      if (end < 0 || text.slice(offset + 4, end).includes("--")) fail("invalid-xml");
      textLength += end - offset;
      if (textLength > MAX_TEXT) fail("complexity-limit");
      offset = end + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", offset)) {
      const end = text.indexOf("]]>", offset + 9);
      if (!stack.length || end < 0) fail("invalid-xml");
      textLength += end - offset;
      if (textLength > MAX_TEXT) fail("complexity-limit");
      offset = end + 3;
      continue;
    }
    if (text.startsWith("<?", offset)) {
      const end = text.indexOf("?>", offset + 2);
      if (end < 0) fail("invalid-xml");
      const declaration = text.slice(offset, end + 2);
      if (
        offset !== 0 ||
        !/^<\?xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])UTF-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*\?>$/i.test(
          declaration,
        )
      )
        fail("unsafe-content");
      offset = end + 2;
      continue;
    }
    if (text.startsWith("<!", offset)) fail("unsafe-content");
    let quote = "";
    let end = offset + 1;
    for (; end < text.length; end++) {
      const character = text[end]!;
      if (character === "<") fail("invalid-xml");
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
      if (end - offset > MAX_ATTRIBUTE * 2) fail("complexity-limit");
    }
    if (end === text.length) fail("invalid-xml");
    const token = text.slice(offset, end + 1);
    if (token.startsWith("</")) {
      const close = /^<\/([A-Za-z_][A-Za-z0-9_.:-]*)\s*>$/.exec(token);
      if (!close || stack.pop() !== close[1]) fail("invalid-xml");
    } else {
      const open = /^<([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*?)(\/?)>$/.exec(token);
      if (!open) fail("invalid-xml");
      if (++elements > MAX_ELEMENTS || stack.length >= MAX_DEPTH) fail("complexity-limit");
      if (!stack.length && ++roots !== 1) fail("invalid-xml");
      const attributes = open[2]!;
      const pattern = /\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/gy;
      const names = new Set<string>();
      let consumed = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(attributes))) {
        if (names.has(match[1]!)) fail("invalid-xml");
        names.add(match[1]!);
        if (names.size > 48 || match[2]!.length > MAX_ATTRIBUTE) fail("complexity-limit");
        characterReferences(match[2]!);
        consumed = pattern.lastIndex;
      }
      if (attributes.slice(consumed).trim()) fail("invalid-xml");
      if (!open[3]) stack.push(open[1]!);
    }
    offset = end + 1;
  }
  if (stack.length || roots !== 1) fail("invalid-xml");
}

function pixelBudget(width: number, height: number): ImageDimensions {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    fail("invalid-dimensions");
  try {
    return assertImagePixelBudget(Math.ceil(width), Math.ceil(height));
  } catch (error) {
    if (error instanceof ImageAssetError && error.code === "pixel-limit") fail("pixel-limit");
    return fail("invalid-dimensions");
  }
}

function length(value: string): { number: number; percent: boolean } {
  const match = LENGTH.exec(value.trim());
  if (!match) fail("unsupported-feature");
  const number = Number(match[1]) * (UNIT_SCALE[match[2] ?? "px"] ?? 1);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_COORDINATE) fail("complexity-limit");
  return { number, percent: match[2] === "%" };
}

function numbers(value: string, limit = MAX_NUMBERS): number[] {
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > limit) fail("complexity-limit");
  return tokens.map((token) => {
    if (!new RegExp(`^${NUMBER}$`).test(token)) fail("unsupported-feature");
    const number = Number(token);
    if (!Number.isFinite(number) || Math.abs(number) > MAX_COORDINATE) fail("complexity-limit");
    return number;
  });
}

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d, e, f] = left;
  const [u, v, w, x, y, z] = right;
  return [
    a * u + c * v,
    b * u + d * v,
    a * w + c * x,
    b * w + d * x,
    a * y + c * z + e,
    b * y + d * z + f,
  ];
}

function checkedMatrix(matrix: Matrix): Matrix {
  if (matrix.some((value) => !Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE))
    fail("complexity-limit");
  if (
    Math.max(Math.abs(matrix[0]) + Math.abs(matrix[2]), Math.abs(matrix[1]) + Math.abs(matrix[3])) >
    1024
  )
    fail("complexity-limit");
  return matrix;
}

function transform(value: string): Matrix {
  const pattern = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*,?/gy;
  let matrix = IDENTITY;
  let consumed = 0;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (++count > 16) fail("complexity-limit");
    const list = numbers(match[2]!, 6);
    const first = list[0]!;
    const second = list[1] ?? first;
    let next: Matrix;
    if (match[1] === "matrix" && list.length === 6) next = list as Matrix;
    else if (match[1] === "translate" && list.length <= 2) next = [1, 0, 0, 1, first, list[1] ?? 0];
    else if (match[1] === "scale" && list.length <= 2) next = [first, 0, 0, second, 0, 0];
    else if (match[1] === "rotate" && (list.length === 1 || list.length === 3)) {
      const angle = (first * Math.PI) / 180;
      const rotation: Matrix = [
        Math.cos(angle),
        Math.sin(angle),
        -Math.sin(angle),
        Math.cos(angle),
        0,
        0,
      ];
      const x = list[1] ?? 0;
      const y = list[2] ?? 0;
      next = multiply(multiply([1, 0, 0, 1, x, y], rotation), [1, 0, 0, 1, -x, -y]);
    } else if ((match[1] === "skewX" || match[1] === "skewY") && list.length === 1) {
      const tangent = Math.tan((first * Math.PI) / 180);
      next = match[1] === "skewX" ? [1, 0, tangent, 1, 0, 0] : [1, tangent, 0, 1, 0, 0];
    } else return fail("unsupported-feature");
    matrix = checkedMatrix(multiply(matrix, checkedMatrix(next)));
    consumed = pattern.lastIndex;
  }
  if (!count || value.slice(consumed).trim()) fail("unsupported-feature");
  return matrix;
}

function declarations(value: string): Map<string, string> {
  // A small literal CSS grammar: no escape decoding, imports, custom properties,
  // functions other than checked colors/local url(), or hidden comment tokens.
  if (/[\\@{}]|\/\*|\*\//.test(value)) fail("unsupported-feature");
  for (const match of value.matchAll(/url\s*\(\s*([^\s)]+)/gi)) {
    if (!match[1]!.replace(/^["']/, "").startsWith("#")) fail("external-resource");
  }
  const result = new Map<string, string>();
  for (const part of value.split(";")) {
    if (!part.trim()) continue;
    const match = /^\s*([a-zA-Z-]+)\s*:\s*(.*?)\s*$/.exec(part);
    if (!match || !match[2]) fail("unsupported-feature");
    const property = match[1]!.toLowerCase();
    if (result.has(property)) fail("unsupported-feature");
    result.set(property, match[2]!.replace(/\s*!important\s*$/i, ""));
    if (result.size > 48) fail("complexity-limit");
  }
  return result;
}

function color(value: string): boolean {
  return /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([0-9+\-.,%/\s]+\))$/i.test(value);
}

function pathNumbers(value: string): number[] {
  const pattern = new RegExp(`[MmZzLlHhVvCcSsQqTtAa]|${NUMBER}`, "g");
  const tokens: string[] = [];
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (!/^[\s,]*$/.test(value.slice(consumed, match.index))) fail("unsupported-feature");
    tokens.push(match[0]);
    if (tokens.length > MAX_NUMBERS * 2) fail("complexity-limit");
    consumed = pattern.lastIndex;
  }
  if (value.slice(consumed).trim()) fail("unsupported-feature");
  if (!tokens.length) return [];
  if (!/^[Mm]$/.test(tokens[0]!)) fail("unsupported-feature");
  const arities: Readonly<Record<string, number>> = {
    m: 2,
    l: 2,
    h: 1,
    v: 1,
    c: 6,
    s: 4,
    q: 4,
    t: 2,
    a: 7,
  };
  const result: number[] = [];
  let index = 0;
  while (index < tokens.length) {
    const command = tokens[index++]!.toLowerCase();
    if (command === "z") continue;
    const arity = arities[command];
    if (!arity) fail("unsupported-feature");
    const start = index;
    while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index]!)) index++;
    if (index === start || (index - start) % arity) fail("unsupported-feature");
    for (let offset = start; offset < index; offset++) {
      const number = Number(tokens[offset]);
      if (!Number.isFinite(number) || Math.abs(number) > MAX_COORDINATE) fail("complexity-limit");
      if (command === "a") {
        const parameter = (offset - start) % 7;
        if (
          (parameter <= 1 && number < 0) ||
          ((parameter === 3 || parameter === 4) && !/^[01]$/.test(tokens[offset]!))
        )
          fail("unsupported-feature");
      }
      result.push(number);
    }
  }
  // Also bound accumulated relative coordinates/control points, not only each
  // numeric token. This intentionally conservative import limit can reject a
  // very detailed path even when its final bounding box would be smaller.
  if (result.reduce((sum, number) => sum + Math.abs(number), 0) > MAX_COORDINATE)
    fail("complexity-limit");
  return result;
}

function localHref(value: string): string {
  const match = new RegExp(`^#(${ID})$`).exec(value.trim());
  if (!match) fail("external-resource");
  return match[1]!;
}

/** Inspect before any Image, object URL, canvas, or raster decoder is constructed. */
export function inspectSvgImageSource(bytes: Uint8Array<ArrayBuffer>): SvgImageSource {
  if (!bytes.length) fail("invalid-xml");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageAssetError("too-large");
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("invalid-xml");
  }
  preflightXml(source);
  let svgDocument: Document;
  try {
    svgDocument = new DOMParser().parseFromString(source, "image/svg+xml");
  } catch {
    return fail("invalid-xml");
  }
  const root = svgDocument.documentElement;
  if (
    !root ||
    root.localName !== "svg" ||
    root.namespaceURI !== SVG_NS ||
    svgDocument.getElementsByTagName("parsererror").length
  )
    fail("invalid-xml");

  const ids = new Map<string, ElementInfo>();
  const infos = new Map<Element, ElementInfo>();
  const stylesheets: ElementInfo[] = [];
  let numericCount = 0;
  let nonScalingStroke = false;
  let minimumDashPeriod = Infinity;
  const rootStyle = declarations(root.getAttribute("style") ?? "");

  const addNumbers = (info: ElementInfo, list: number[]) => {
    numericCount += list.length;
    info.work += list.length;
    if (numericCount > MAX_NUMBERS) fail("complexity-limit");
    info.geometryCost += list.reduce((sum, number) => sum + Math.abs(number), 0);
  };
  const property = (info: ElementInfo, name: string, value: string) => {
    if (/[\\@{}]|\/\*|\*\//.test(value)) fail("unsupported-feature");
    if (["fill", "stroke", "clip-path", "mask"].includes(name)) {
      if (/^url\s*\(/i.test(value)) {
        const match = new RegExp(`^url\\(\\s*(["']?)#(${ID})\\1\\s*\\)(?:\\s+(.+))?$`, "i").exec(
          value,
        );
        if (!match) fail("external-resource");
        if (match[3] && (!(name === "fill" || name === "stroke") || !color(match[3])))
          fail("unsupported-feature");
        info.references.push({
          id: match[2]!,
          kind: name === "fill" || name === "stroke" ? "paint" : (name as "clip-path" | "mask"),
        });
      } else if (name === "clip-path" || name === "mask" ? value !== "none" : !color(value))
        fail("unsupported-feature");
      return;
    }
    if (["color", "stop-color"].includes(name)) {
      if (!color(value)) fail("unsupported-feature");
      return;
    }
    if (["opacity", "fill-opacity", "stroke-opacity", "stop-opacity"].includes(name)) {
      if (value === "inherit") {
        if (name === "opacity") info.surface = true;
        return;
      }
      const parsed = length(value);
      if (parsed.number < 0 || parsed.number > (parsed.percent ? 100 : 1))
        fail("unsupported-feature");
      if (name === "opacity" && parsed.number > 0 && parsed.number < (parsed.percent ? 100 : 1))
        info.surface = true;
      return;
    }
    if (
      [
        "font-size",
        "stroke-width",
        "stroke-dashoffset",
        "stroke-miterlimit",
        "letter-spacing",
        "word-spacing",
        "baseline-shift",
      ].includes(name)
    ) {
      if (
        value === "inherit" ||
        (["letter-spacing", "word-spacing"].includes(name) && value === "normal")
      )
        return;
      const parsed = length(value);
      if (parsed.percent) fail("unsupported-feature");
      const bound = name === "font-size" ? 512 : name === "stroke-miterlimit" ? 64 : 4096;
      if (Math.abs(parsed.number) > bound) fail("complexity-limit");
      if (["font-size", "stroke-width", "stroke-miterlimit"].includes(name) && parsed.number < 0)
        fail("unsupported-feature");
      addNumbers(info, [parsed.number]);
      return;
    }
    if (name === "stroke-dasharray") {
      if (["none", "inherit"].includes(value)) return;
      const list = value
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((token) => {
          const parsed = length(token);
          if (parsed.percent || parsed.number < 0) fail("unsupported-feature");
          if (parsed.number > 0 && parsed.number < 0.1) fail("complexity-limit");
          return parsed.number;
        });
      if (!list.length || list.length > 256) fail("complexity-limit");
      addNumbers(info, list);
      const period = list.reduce((sum, number) => sum + number, 0);
      if (period > 0) minimumDashPeriod = Math.min(minimumDashPeriod, period);
      return;
    }
    if (name === "font-family") {
      if (value.length > 256 || !/^[\p{L}\p{N}\s_'",.-]+$/u.test(value))
        fail("unsupported-feature");
      return;
    }
    if (name === "overflow") {
      if (value !== "hidden") fail("unsupported-feature");
      return;
    }
    if (ENUM_PROPERTIES[name]?.includes(value)) {
      if (name === "vector-effect" && value === "non-scaling-stroke") nonScalingStroke = true;
      return;
    }
    return fail("unsupported-feature");
  };

  const inspect = (element: Element, depth: number): ElementInfo => {
    if (depth > MAX_DEPTH || infos.size >= MAX_ELEMENTS) fail("complexity-limit");
    const name = element.localName;
    if (/^(?:script|foreignObject|a|animate.*|set|discard)$/i.test(name)) fail("unsafe-content");
    if (element.namespaceURI !== SVG_NS || !ELEMENTS.has(name)) fail("unsupported-feature");
    if (name === "svg" && element !== root) fail("unsupported-feature");
    const info: ElementInfo = {
      element,
      children: [],
      references: [],
      transform: IDENTITY,
      work: 1,
      surface: false,
      geometryCost: 0,
    };
    infos.set(element, info);
    for (const attribute of element.attributes) {
      const attributeName = attribute.localName;
      const value = attribute.value.trim();
      if (
        /^on/i.test(attributeName) ||
        attribute.name === "xml:base" ||
        (attribute.namespaceURI === XML_NS && attributeName === "base")
      )
        fail("unsafe-content");
      if (attribute.namespaceURI === XMLNS_NS) {
        if (![SVG_NS, XLINK_NS].includes(value)) fail("unsupported-feature");
        continue;
      }
      if (
        (attribute.namespaceURI === XML_NS && ["space", "lang"].includes(attributeName)) ||
        (!attribute.namespaceURI && ["xml:space", "xml:lang"].includes(attribute.name))
      ) {
        if (
          (attributeName === "space" || attribute.name === "xml:space") &&
          !["default", "preserve"].includes(value)
        )
          fail("unsupported-feature");
        continue;
      }
      if (
        attribute.namespaceURI &&
        !(attribute.namespaceURI === XLINK_NS && attributeName === "href")
      )
        fail("unsupported-feature");
      if (attributeName === "id") {
        if (!new RegExp(`^${ID}$`).test(value) || ids.has(value)) fail("invalid-xml");
        ids.set(value, info);
      } else if (attributeName === "class") {
        if (value.length > 1024 || !/^[A-Za-z0-9_\s-]*$/.test(value)) fail("unsupported-feature");
      } else if (
        /^(?:aria-[a-z-]+|data-[a-z0-9-]+)$/.test(attributeName) ||
        ["role", "version", "baseProfile"].includes(attributeName)
      ) {
        if (value.length > 1024) fail("complexity-limit");
      } else if (attributeName === "style") {
        for (const [key, content] of declarations(value)) {
          if (element === root && ["width", "height"].includes(key)) continue;
          property(info, key, content);
        }
      } else if (attributeName === "href") {
        const href = element.getAttribute("href");
        const xlinkHref = element.getAttributeNS(XLINK_NS, "href");
        if (href && xlinkHref && href.trim() !== xlinkHref.trim()) fail("unsafe-content");
        if (!["use", "linearGradient", "radialGradient"].includes(name))
          fail("unsupported-feature");
        info.references.push({ id: localHref(value), kind: name === "use" ? "use" : "gradient" });
      } else if (["transform", "gradientTransform"].includes(attributeName)) {
        const parsed = transform(value);
        if (attributeName === "transform") info.transform = parsed;
      } else if (attributeName === "viewBox") {
        if (element !== root) fail("unsupported-feature");
        const list = numbers(value, 4);
        if (list.length !== 4 || list[2]! <= 0 || list[3]! <= 0) fail("invalid-dimensions");
        if (list[2]! < 1e-6 || list[3]! < 1e-6) fail("complexity-limit");
        addNumbers(info, list);
      } else if (attributeName === "preserveAspectRatio") {
        if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/.test(value))
          fail("unsupported-feature");
      } else if (attributeName === "d") {
        if (name !== "path" || !/^[MmZzLlHhVvCcSsQqTtAa0-9+\-.,eE\s]*$/.test(value))
          fail("unsupported-feature");
        addNumbers(info, pathNumbers(value));
      } else if (attributeName === "points") {
        if (!["polyline", "polygon"].includes(name)) fail("unsupported-feature");
        const list = numbers(value);
        if (list.length % 2) fail("unsupported-feature");
        addNumbers(info, list);
      } else if (NUMERIC_ATTRIBUTES.has(attributeName)) {
        if (element === root && ["width", "height"].includes(attributeName)) continue;
        const list = value
          .split(/[\s,]+/)
          .filter(Boolean)
          .map((token) => length(token));
        if (
          !list.length ||
          (!["x", "y", "dx", "dy", "rotate"].includes(attributeName) && list.length !== 1)
        )
          fail("unsupported-feature");
        if (NONNEGATIVE_ATTRIBUTES.has(attributeName) && list.some((number) => number.number < 0))
          fail("unsupported-feature");
        addNumbers(
          info,
          list.map((number) => number.number),
        );
      } else if (
        ["gradientUnits", "clipPathUnits", "maskUnits", "maskContentUnits"].includes(attributeName)
      ) {
        if (!["userSpaceOnUse", "objectBoundingBox"].includes(value)) fail("unsupported-feature");
      } else if (attributeName === "spreadMethod") {
        if (!["pad", "reflect", "repeat"].includes(value)) fail("unsupported-feature");
      } else if (attributeName === "lengthAdjust") {
        if (!["spacing", "spacingAndGlyphs"].includes(value)) fail("unsupported-feature");
      } else if (name === "style" && attributeName === "type") {
        if (value !== "text/css") fail("unsupported-feature");
      } else property(info, attributeName, value);
    }
    for (const child of element.childNodes) {
      if (child.nodeType === 1) info.children.push(inspect(child as Element, depth + 1));
      else if (child.nodeType === 3 || child.nodeType === 4) {
        const text = child.textContent ?? "";
        if (text.trim() && !["text", "tspan", "title", "desc", "style"].includes(name))
          fail("unsupported-feature");
        if (text.length > 8192 && name !== "style") fail("complexity-limit");
        info.work += text.length;
      } else if (child.nodeType !== 8) fail("unsafe-content");
    }
    if (name === "style") {
      if (info.children.length) fail("unsupported-feature");
      stylesheets.push(info);
    }
    return info;
  };
  const rootInfo = inspect(root, 1);

  let rules = 0;
  for (const stylesheet of stylesheets) {
    const css = stylesheet.element.textContent ?? "";
    if (/[\\@]|\/\*|\*\//.test(css)) fail("unsupported-feature");
    const pattern = /\s*([^{}]+)\{([^{}]*)\}\s*/gy;
    let consumed = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(css))) {
      if (++rules > 128) fail("complexity-limit");
      const selectors = match[1]!.split(",").map((selector) => selector.trim());
      if (selectors.length > 16) fail("complexity-limit");
      for (const selector of selectors) {
        const parts = selector.split(/\s+/);
        if (
          parts.length > 4 ||
          parts.some(
            (part) =>
              !/^(?:[A-Za-z][A-Za-z0-9_-]*|\*)?(?:[.#][A-Za-z_][A-Za-z0-9_-]*)*$/.test(part) ||
              !part,
          )
        )
          fail("unsupported-feature");
      }
      for (const [name, value] of declarations(match[2]!)) {
        // Validate unused rules too; selectors cannot hide a resource or animation.
        const dummy: ElementInfo = {
          element: root,
          children: [],
          references: [],
          transform: IDENTITY,
          work: 0,
          surface: false,
          geometryCost: 0,
        };
        property(dummy, name, value);
        for (const info of infos.values()) {
          if (selectors.some((selector) => info.element.matches(selector))) {
            info.references.push(...dummy.references);
            info.work += dummy.work;
            info.geometryCost += dummy.geometryCost;
            info.surface ||= dummy.surface;
          }
        }
      }
      consumed = pattern.lastIndex;
    }
    if (css.slice(consumed).trim()) fail("unsupported-feature");
  }
  // Dashing work is proportional to coordinate/path extent and inversely to the
  // dash period. This conservative proxy rejects tiny repeated geometry.

  const intrinsic = (name: "width" | "height") => {
    const value = rootStyle.get(name) ?? root.getAttribute(name);
    if (value == null || value.trim() === "auto") return undefined;
    const parsed = length(value);
    if (parsed.number <= 0) fail("invalid-dimensions");
    return parsed.percent ? undefined : parsed.number;
  };
  const viewBox = root.getAttribute("viewBox");
  const box = viewBox ? numbers(viewBox, 4) : undefined;
  const ratio = box ? box[2]! / box[3]! : undefined;
  let width = intrinsic("width");
  let height = intrinsic("height");
  const normalizedViewport = width === undefined || height === undefined;
  // SVG2 viewBox gives an aspect ratio, not pixel dimensions. Product import
  // resolves missing sizes with CSS Images' default sizing algorithm and a
  // deterministic 300x150 default object size, then fixes the decode viewport.
  // https://www.w3.org/TR/SVG2/coords.html#IntrinsicSizing
  // https://www.w3.org/TR/css-images-3/#default-sizing
  if (width === undefined && height === undefined) {
    width = ratio ? Math.min(300, 150 * ratio) : 300;
    height = ratio ? width / ratio : 150;
  } else if (width === undefined) width = ratio ? height! * ratio : 300;
  else if (height === undefined) height = ratio ? width / ratio : 150;
  const dimensions = pixelBudget(width, height!);
  const viewport: Matrix = box ? [width / box[2]!, 0, 0, height! / box[3]!, 0, 0] : IDENTITY;
  // Use a conservative maximum axis scale for meet/slice alignment as well.
  const viewportScale = Math.max(viewport[0], viewport[3]);
  checkedMatrix([viewportScale, 0, 0, viewportScale, 0, 0]);

  const targets = new Map<ElementInfo, ElementInfo[]>();
  for (const info of infos.values()) {
    const result: ElementInfo[] = [];
    for (const reference of info.references) {
      const target = ids.get(reference.id);
      if (!target) fail("unsupported-feature");
      const name = target.element.localName;
      const valid =
        reference.kind === "use"
          ? DRAWING_ELEMENTS.has(name)
          : reference.kind === "paint" || reference.kind === "gradient"
            ? ["linearGradient", "radialGradient"].includes(name)
            : reference.kind === "clip-path"
              ? name === "clipPath"
              : name === "mask";
      if (!valid) fail("unsupported-feature");
      result.push(target);
    }
    targets.set(info, result);
  }
  const visiting = new Set<ElementInfo>();
  const memo = new Map<ElementInfo, { nodes: number; work: number; geometryCost: number }>();
  const expansion = (
    info: ElementInfo,
    depth: number,
  ): { nodes: number; work: number; geometryCost: number } => {
    if (visiting.has(info)) fail("unsafe-content");
    if (depth > MAX_DEPTH * 2) fail("complexity-limit");
    const previous = memo.get(info);
    if (previous) return previous;
    visiting.add(info);
    let nodes = 1;
    let work = info.work;
    let geometryCost = info.geometryCost;
    for (const child of [...info.children, ...targets.get(info)!]) {
      const expanded = expansion(child, depth + 1);
      nodes += expanded.nodes;
      work += expanded.work;
      geometryCost += expanded.geometryCost;
      if (nodes > MAX_EXPANSION || work > MAX_RENDER_WORK) fail("complexity-limit");
    }
    visiting.delete(info);
    const result = { nodes, work, geometryCost };
    memo.set(info, result);
    return result;
  };
  const expanded = expansion(rootInfo, 1);

  let expandedVisits = 0;
  let surfacePixels = 0;
  let maximumScale = 1;
  const renderBounds = (info: ElementInfo, parent: Matrix, depth: number) => {
    if (++expandedVisits > MAX_EXPANSION || depth > MAX_DEPTH * 2) fail("complexity-limit");
    const matrix = checkedMatrix(multiply(parent, info.transform));
    maximumScale = Math.max(
      maximumScale,
      Math.abs(matrix[0]) + Math.abs(matrix[2]),
      Math.abs(matrix[1]) + Math.abs(matrix[3]),
    );
    // Budget each potential opacity compositing layer against the whole clipped
    // image viewport, including repeated use/reference expansions. This is a
    // product working-surface cap, not a browser memory-allocation guarantee.
    if (info.surface) surfacePixels += dimensions.width * dimensions.height;
    if (info.element.localName === "mask") {
      // Object-bounding-box masks depend on unmeasured text/path bounding boxes.
      // Accept explicit user-space regions only; no speculative surface sizes.
      if (info.element.getAttribute("maskUnits") !== "userSpaceOnUse") fail("unsupported-feature");
      const w = info.element.getAttribute("width");
      const h = info.element.getAttribute("height");
      if (!w || !h) fail("unsupported-feature");
      const maskWidth = length(w);
      const maskHeight = length(h);
      if (maskWidth.percent || maskHeight.percent) fail("unsupported-feature");
      const size = pixelBudget(
        Math.abs(matrix[0]) * maskWidth.number + Math.abs(matrix[2]) * maskHeight.number,
        Math.abs(matrix[1]) * maskWidth.number + Math.abs(matrix[3]) * maskHeight.number,
      );
      surfacePixels += size.width * size.height;
    }
    if (surfacePixels > MAX_IMAGE_PIXELS * 4) fail("complexity-limit");
    for (const child of info.children) renderBounds(child, matrix, depth + 1);
    for (const target of targets.get(info)!) renderBounds(target, matrix, depth + 1);
  };
  renderBounds(rootInfo, [viewportScale, 0, 0, viewportScale, 0, 0], 1);

  if (
    (expanded.geometryCost * 8 * (nonScalingStroke ? maximumScale : 1)) / minimumDashPeriod >
    100000
  )
    fail("complexity-limit");

  if (!normalizedViewport)
    return { ...dimensions, mimeType: "image/svg+xml", bytes, normalizedViewport };
  root.setAttribute("width", `${width}px`);
  root.setAttribute("height", `${height}px`);
  if (rootStyle.has("width") || rootStyle.has("height")) {
    const parts = (root.getAttribute("style") ?? "")
      .split(";")
      .filter((part) => part.trim() && !/^\s*(?:width|height)\s*:/i.test(part));
    parts.push(`width:${width}px`, `height:${height}px`);
    root.setAttribute("style", parts.join(";"));
  }

  // Only size resolution causes XML reserialization. The validated detached XML
  // is never inserted into the application document. No visible content is cut.
  const normalized = new TextEncoder().encode(new XMLSerializer().serializeToString(svgDocument));
  if (normalized.length > MAX_IMAGE_BYTES) throw new ImageAssetError("too-large");
  return { ...dimensions, mimeType: "image/svg+xml", bytes: normalized, normalizedViewport };
}
