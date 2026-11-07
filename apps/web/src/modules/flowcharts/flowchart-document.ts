import { normalizeSheetAttachment, type SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import type { ShapePresetName } from "@sheetcraft/core/shape-presets";
import { SHAPE_PRESET_GALLERY } from "../../shared/shape-presets/shape-gallery-data";
import { decodeAttachmentBytes, encodeAttachmentBytes } from "../attachments/attachment-file";

export const FLOWCHART_MIME = "application/vnd.sheetcraft.flowchart+json";
export const FLOWCHART_WIDTH = 800,
  FLOWCHART_HEIGHT = 500;
export const FLOWCHART_MAX_BYTES = 1024 * 1024;
export const flowchartShapes = SHAPE_PRESET_GALLERY.find(
  (group) => group.id === "flowchart",
)!.items;
export type FlowchartPoint = { x: number; y: number };
export type FlowchartNode = {
  fill?: string;
  color?: string;
  fontSize?: number;
  id: string;
  preset: ShapePresetName;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type FlowchartEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  route?: { start: FlowchartPoint; end: FlowchartPoint; bends: FlowchartPoint[] };
};
export type FlowchartDocument = {
  format: "sheetcraft-flowchart";
  version: 1;
  title: string;
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
};

function invalid(): never {
  throw new TypeError("Invalid flowchart document.");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number): string {
  return typeof value === "string" && value.length <= max ? value : invalid();
}
function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : invalid();
}
function color(value: unknown) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return invalid();
  return value;
}
function point(value: unknown, limitX: number, limitY: number) {
  const src = record(value);
  const x = number(src.x),
    y = number(src.y);
  if (x < 0 || x > limitX || y < 0 || y > limitY) return invalid();
  return { x, y };
}
function route(value: unknown) {
  const src = record(value);
  if (!Array.isArray(src.bends) || src.bends.length > 256) return invalid();
  return {
    start: point(src.start, 1, 1),
    end: point(src.end, 1, 1),
    bends: src.bends.map((p) => point(p, FLOWCHART_WIDTH, FLOWCHART_HEIGHT)),
  };
}
export function parseFlowchartDocument(value: unknown): FlowchartDocument {
  const src = record(value);
  const title = string(src.title, 128).trim();
  if (
    src.format !== "sheetcraft-flowchart" ||
    src.version !== 1 ||
    !title ||
    !Array.isArray(src.nodes) ||
    src.nodes.length > 256 ||
    !Array.isArray(src.edges) ||
    src.edges.length > 512
  )
    return invalid();
  const ids = new Set<string>();
  function identity(value: unknown) {
    const id = string(value, 128);
    if (!id.trim() || ids.has(id)) return invalid();
    ids.add(id);
    return id;
  }
  const nodes = src.nodes.map((value) => {
    const node = record(value);
    const preset = flowchartShapes.find((choice) => choice.preset === node.preset)?.preset;
    const x = number(node.x),
      y = number(node.y),
      width = number(node.width),
      height = number(node.height);
    if (
      !preset ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > FLOWCHART_WIDTH ||
      y + height > FLOWCHART_HEIGHT
    )
      return invalid();
    const result: FlowchartNode = {
      id: identity(node.id),
      preset,
      text: string(node.text, 4096),
      x,
      y,
      width,
      height,
    };
    if (node.fill !== undefined) result.fill = color(node.fill);
    if (node.color !== undefined) result.color = color(node.color);
    if (node.fontSize !== undefined) {
      result.fontSize = number(node.fontSize);
      if (result.fontSize <= 0 || result.fontSize > 256) return invalid();
    }
    return result;
  });
  const nodeIds = new Set(ids);
  const edges = src.edges.map((value) => {
    const edge = record(value);
    const from = string(edge.from, 128),
      to = string(edge.to, 128);
    if (!nodeIds.has(from) || !nodeIds.has(to)) return invalid();
    const result: FlowchartEdge = {
      id: identity(edge.id),
      from,
      to,
      label: string(edge.label, 1024),
    };
    if (edge.route !== undefined) result.route = route(edge.route);
    return result;
  });
  return { format: "sheetcraft-flowchart", version: 1, title, nodes, edges };
}

export function encodeFlowchartAttachment(document: FlowchartDocument): SheetAttachment {
  const source = parseFlowchartDocument(document);
  if (!source.nodes.length) return invalid();
  const bytes = new TextEncoder().encode(JSON.stringify(source));
  if (bytes.length > FLOWCHART_MAX_BYTES) return invalid();
  const name = Array.from(source.title, (char) =>
    char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? "_" : char,
  ).join("");
  return {
    filename: name + ".flowchart.json",
    mimeType: FLOWCHART_MIME,
    size: bytes.length,
    data: encodeAttachmentBytes(bytes),
    display: "document",
  };
}
export function decodeFlowchartAttachment(
  attachment: SheetAttachment,
): FlowchartDocument | undefined {
  if (
    attachment.mimeType !== FLOWCHART_MIME ||
    attachment.size > FLOWCHART_MAX_BYTES ||
    attachment.data.length > Math.ceil(FLOWCHART_MAX_BYTES / 3) * 4
  )
    return;
  try {
    normalizeSheetAttachment(attachment);
    return parseFlowchartDocument(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(decodeAttachmentBytes(attachment.data)),
      ),
    );
  } catch {
    return undefined;
  }
}
