import type { SheetAttachment } from "@sheetcraft/core/sheet-attachments";
import { encodeDiagramSource, decodeDiagramSource } from "../attachments/diagram-source";

export const MIND_MAP_MIME = "application/vnd.sheetcraft.mindmap+json";
export const mindMapLayouts = [
  "mind",
  "right",
  "tree",
  "treeRight",
  "org",
  "fishbone",
  "timeline",
  "snake",
] as const;
export type MindMapLayout = (typeof mindMapLayouts)[number];
export const mindMapThemes = ["green", "blue", "plum"] as const;
export type MindMapTheme = (typeof mindMapThemes)[number];
export type MindMapTopic = {
  id: string;
  text: string;
  children: MindMapTopic[];
  collapsed: boolean;
  note?: string;
  fill?: string;
  bold?: boolean;
  fontSize?: number;
};
export type MindMapDocument = {
  format: "sheetcraft-mindmap";
  version: 1;
  title: string;
  layout: MindMapLayout;
  theme: MindMapTheme;
  root: MindMapTopic;
};
export type MindMapStart = "workbook" | "local";
export const MIND_MAP_TOPIC_LIMIT = 256;
export const MIND_MAP_DEPTH_LIMIT = 32;
function invalid(): never {
  throw new TypeError("Invalid mind map document.");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function parseMindMapDocument(input: unknown): MindMapDocument {
  const source = object(input);
  const layout = mindMapLayouts.find((item) => item === source.layout);
  const theme = mindMapThemes.find((item) => item === source.theme);
  if (
    source.format !== "sheetcraft-mindmap" ||
    source.version !== 1 ||
    typeof source.title !== "string" ||
    !source.title.trim() ||
    source.title.length > 128 ||
    !layout ||
    !theme
  )
    return invalid();
  const ids = new Set<string>();
  function topic(value: unknown, depth: number): MindMapTopic {
    const n = object(value);
    if (
      depth > MIND_MAP_DEPTH_LIMIT ||
      ids.size >= MIND_MAP_TOPIC_LIMIT ||
      typeof n.id !== "string" ||
      !n.id.trim() ||
      n.id.length > 128 ||
      ids.has(n.id) ||
      typeof n.text !== "string" ||
      n.text.length > 4096 ||
      !Array.isArray(n.children) ||
      typeof n.collapsed !== "boolean"
    )
      return invalid();
    ids.add(n.id);
    const result: MindMapTopic = {
      id: n.id,
      text: n.text,
      collapsed: n.collapsed,
      children: n.children.map((child) => topic(child, depth + 1)),
    };
    if (n.note !== undefined) {
      if (typeof n.note !== "string" || n.note.length > 4096) return invalid();
      result.note = n.note;
    }
    if (n.fill !== undefined) {
      if (typeof n.fill !== "string" || !/^#[a-f0-9]{6}$/i.test(n.fill)) return invalid();
      result.fill = n.fill;
    }
    if (n.bold !== undefined) {
      if (typeof n.bold !== "boolean") return invalid();
      result.bold = n.bold;
    }
    if (n.fontSize !== undefined) {
      if (
        typeof n.fontSize !== "number" ||
        !Number.isFinite(n.fontSize) ||
        n.fontSize < 8 ||
        n.fontSize > 48
      )
        return invalid();
      result.fontSize = n.fontSize;
    }
    return result;
  }
  return {
    format: "sheetcraft-mindmap",
    version: 1,
    title: source.title.trim(),
    layout,
    theme,
    root: topic(source.root, 0),
  };
}
export function createMindMap(
  layout: MindMapLayout,
  title: string,
  center: string,
): MindMapDocument {
  return {
    format: "sheetcraft-mindmap",
    version: 1,
    title,
    layout,
    theme: "green",
    root: { id: "root", text: center, collapsed: false, children: [] },
  };
}
export function encodeMindMapAttachment(document: MindMapDocument): SheetAttachment {
  return encodeDiagramSource(parseMindMapDocument(document), MIND_MAP_MIME, ".mindmap.json");
}
export function decodeMindMapAttachment(attachment: SheetAttachment) {
  return decodeDiagramSource(attachment, MIND_MAP_MIME, parseMindMapDocument);
}
export function topicLocations(root: MindMapTopic) {
  const locations = new Map<
    string,
    { topic: MindMapTopic; parent?: MindMapTopic; depth: number }
  >();
  function visit(topic: MindMapTopic, parent: MindMapTopic | undefined, depth: number) {
    locations.set(topic.id, { topic, parent, depth });
    topic.children.forEach((child) => visit(child, topic, depth + 1));
  }
  visit(root, undefined, 0);
  return locations;
}
