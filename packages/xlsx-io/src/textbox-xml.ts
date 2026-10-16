import { attr, type XmlNode } from "./pivot-xml.js";
import { XlsxCompatibilityError } from "./types.js";

export function rejectNativeTextBox(location: string): never {
  throw new XlsxCompatibilityError(`The XLSX text box cannot be preserved at ${location}.`, {
    issues: [{ code: "drawing-or-media", severity: "block", count: 1, locations: [location] }],
  });
}
export const textBoxValues = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
export function textBoxOnly(
  node: XmlNode,
  children: readonly string[],
  attrs: readonly string[],
  path: string,
): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === "@_xmlns" || key.startsWith("@_xmlns:")) continue;
    if (key === "#text") {
      if (String(value).trim()) rejectNativeTextBox(`${path}.#text`);
    } else if (key.startsWith("@_")) {
      if (!attrs.includes(key.slice(2))) rejectNativeTextBox(`${path}.${key.slice(2)}`);
    } else if (!children.includes(key)) rejectNativeTextBox(`${path}.${key}`);
  }
}
export function textBoxElement(
  node: XmlNode,
  key: string,
  path: string,
  optional = false,
): XmlNode | undefined {
  const items = textBoxValues(node[key]);
  if (!items.length && optional) return undefined;
  if (items.length !== 1) rejectNativeTextBox(`${path}.${key}`);
  return textBoxNode(items[0], `${path}.${key}`);
}
export function textBoxNode(value: unknown, path: string): XmlNode {
  if (value === "") return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) rejectNativeTextBox(path);
  return value as XmlNode;
}
export function textBoxNumber(value: unknown, max: number, path: string, min = 0): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) rejectNativeTextBox(path);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) rejectNativeTextBox(path);
  return number;
}
export function textBoxBool(node: XmlNode, key: string, fallback: boolean, path: string): boolean {
  const value = attr(node, key, fallback ? "1" : "0");
  if (!["0", "1", "true", "false"].includes(value)) rejectNativeTextBox(`${path}.${key}`);
  return value === "1" || value === "true";
}
