import type { ShapePresetName } from "@sheetcraft/core/shape-presets";
import {
  FLOWCHART_WIDTH,
  FLOWCHART_HEIGHT,
  parseFlowchartDocument,
  type FlowchartPoint,
  type FlowchartEdge,
  type FlowchartNode,
} from "./flowchart-document";

const presets = new Map<string, ShapePresetName>([
  ["process", "flowChartProcess"],
  ["decision", "flowChartDecision"],
  ["terminator", "flowChartTerminator"],
  ["data", "flowChartInputOutput"],
  ["document", "flowChartDocument"],
]);

function invalid(): never {
  throw new TypeError("Unsupported ProcessOn flowchart.");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") return invalid();
  return value;
}
function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return invalid();
  return value;
}
function plainText(value: unknown) {
  const entities: Record<string, string> = {
    lt: "<",
    gt: ">",
    amp: "&",
    quot: '"',
    nbsp: " ",
    apos: "'",
  };
  return text(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<\/?(?:div|span|b|i|strong|em|font|u)(?:\s+[^>]*)?>/gi, "")
    .replace(/&(lt|gt|amp|quot|nbsp|apos);/g, (_, key: string) => entities[key]!)
    .trim();
}
function rgb(style: unknown) {
  const value = style && object(style).color;
  if (typeof value !== "string") return undefined;
  const channels = value.split(",").map(Number);
  if (channels.length !== 3 || !channels.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    return undefined;
  return "#" + channels.map((n) => n.toString(16).padStart(2, "0")).join("");
}
function position(value: unknown) {
  const pos = object(value);
  return { x: finite(pos.x), y: finite(pos.y) };
}
function node(element: Record<string, unknown>): FlowchartNode {
  const preset = presets.get(text(element.name));
  const props = object(element.props);
  if (
    !preset ||
    (props.angle !== undefined && props.angle !== 0) ||
    !Array.isArray(element.textBlock)
  )
    return invalid();
  const width = finite(props.w),
    height = finite(props.h);
  if (width <= 0 || height <= 0) return invalid();
  const font = element.fontStyle && object(element.fontStyle);
  return {
    id: text(element.id),
    preset,
    ...position(props),
    width,
    height,
    text: element.textBlock.map((block) => plainText(object(block).text)).join("\n"),
    fill: rgb(element.fillStyle),
    color: rgb(font),
    fontSize: font && typeof font === "object" && "size" in font ? finite(font.size) : 14,
  };
}
function endpoint(value: unknown, nodes: Map<string, FlowchartNode>) {
  const raw = object(value);
  const id = text(raw.id),
    target = nodes.get(id);
  if (!target) return invalid();
  const pos = position(raw);
  const ratio = (n: number) => Math.min(1, Math.max(0, n));
  return {
    id,
    relative: {
      x: ratio((pos.x - target.x) / target.width),
      y: ratio((pos.y - target.y) / target.height),
    },
  };
}
function edge(element: Record<string, unknown>, nodes: Map<string, FlowchartNode>): FlowchartEdge {
  if (
    element.linkerType !== "broken" &&
    element.linkerType !== "normal" &&
    element.linkerType !== "straight"
  )
    return invalid();
  const from = endpoint(element.from, nodes),
    to = endpoint(element.to, nodes);
  const points = element.points ?? [];
  if (!Array.isArray(points) || points.length > 256) return invalid();
  return {
    id: text(element.id),
    from: from.id,
    to: to.id,
    label: plainText(element.text ?? ""),
    route: { start: from.relative, end: to.relative, bends: points.map(position) },
  };
}

/** Convert editable flowchart geometry. POS paths, expressions and plugins are never evaluated. */
export function importProcessOnFlowchart(value: unknown) {
  const root = object(value),
    meta = object(root.meta),
    info = object(meta.diagramInfo);
  if (meta.type !== "ProcessOn Schema File" || info.category !== "flow") return invalid();
  const graph = object(object(root.diagram).elements);
  const entries = Object.values(object(graph.elements)).map(object);
  if (entries.length > 768) return invalid();
  const nodes = entries.filter((e) => e.name !== "linker").map(node);
  if (!nodes.length || nodes.length > 256) return invalid();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = entries.filter((e) => e.name === "linker").map((e) => edge(e, byId));
  const corners = nodes.flatMap((n) => [
    { x: n.x, y: n.y },
    { x: n.x + n.width, y: n.y + n.height },
  ]);
  const bends = edges.flatMap((e) => e.route!.bends);
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const p of [...corners, ...bends]) {
    left = Math.min(left, p.x);
    top = Math.min(top, p.y);
    right = Math.max(right, p.x);
    bottom = Math.max(bottom, p.y);
  }
  const scale = Math.min(
    1,
    (FLOWCHART_WIDTH - 32) / (right - left),
    (FLOWCHART_HEIGHT - 32) / (bottom - top),
  );
  const offsetX = (FLOWCHART_WIDTH - (right - left) * scale) / 2,
    offsetY = (FLOWCHART_HEIGHT - (bottom - top) * scale) / 2;
  function fit(p: FlowchartPoint) {
    return { x: offsetX + (p.x - left) * scale, y: offsetY + (p.y - top) * scale };
  }
  return parseFlowchartDocument({
    format: "sheetcraft-flowchart",
    version: 1,
    title: info.title,
    nodes: nodes.map((n) => ({
      ...n,
      ...fit(n),
      width: n.width * scale,
      height: n.height * scale,
      fontSize: n.fontSize! * scale,
    })),
    edges: edges.map((e) => ({ ...e, route: { ...e.route!, bends: e.route!.bends.map(fit) } })),
  });
}
