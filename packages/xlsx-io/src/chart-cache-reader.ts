import { only, single } from "./chart-package-parts.js";
import { attr, nodes, parseRange, type XmlNode } from "./pivot-xml.js";

export function readChartCache(
  reference: XmlNode,
  numeric: boolean,
): Array<string | number | null> {
  const root = single(reference, numeric ? "numCache" : "strCache");
  only(reference, ["f", numeric ? "numCache" : "strCache"]);
  only(root, numeric ? ["formatCode", "ptCount", "pt"] : ["ptCount", "pt"]);
  const countText = attr(single(root, "ptCount"), "val");
  if (!/^\d+$/.test(countText)) throw new Error("Invalid chart count.");
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000)
    throw new Error("Invalid chart count.");
  const result: Array<string | number | null> = Array(count).fill(null);
  const seen = new Set<number>();
  const points = nodes(root.pt);
  if ((Array.isArray(root.pt) ? root.pt.length : root.pt === undefined ? 0 : 1) !== points.length)
    throw new Error("Invalid chart point.");
  for (const point of points) {
    only(point, ["v"]);
    const indexText = attr(point, "idx");
    const value = point.v;
    if (!/^\d+$/.test(indexText) || typeof value !== "string" || value.length > 32767)
      throw new Error("Invalid chart point.");
    const index = Number(indexText);
    if (!Number.isSafeInteger(index) || index >= count || seen.has(index))
      throw new Error("Invalid chart point index.");
    seen.add(index);
    if (
      numeric &&
      (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
        !Number.isFinite(Number(value)))
    )
      throw new Error("Invalid numeric chart cache.");
    result[index] = numeric ? Number(value) : value;
  }
  if (!numeric && seen.size !== count) throw new Error("Incomplete chart text cache.");
  return result;
}
export function chartReferenceRange(reference: XmlNode, sheetName: string) {
  if (typeof reference.f !== "string") throw new Error("Missing chart reference.");
  const match = /^(?:'((?:[^']|'')+)'|([^'!\x5b\x5d]+))!(\$[A-Z]+\$\d+(?::\$[A-Z]+\$\d+)?)$/u.exec(
    reference.f,
  );
  if (
    !match ||
    (match[1]?.replace(/''/g, "'") ?? match[2])?.toLowerCase() !== sheetName.toLowerCase()
  )
    throw new Error("Unsupported chart reference.");
  return parseRange(match[3]!);
}
export function chartBoolean(node: XmlNode, name: string, fallback: boolean): boolean {
  if (node[name] === undefined) return fallback;
  const value = attr(single(node, name), "val");
  if (!["0", "1", "false", "true"].includes(value)) throw new Error("Invalid chart flag.");
  return value === "1" || value === "true";
}
export function readChartTitle(chart: XmlNode, allowDefaultTitle = false): string {
  if (chart.title === undefined) return "";
  const titleNode = single(chart, "title");
  // The observed WPS default title is implicit, with typography but no text.
  if (allowDefaultTitle && titleNode.tx === undefined) return "";
  const rich = single(single(titleNode, "tx"), "rich");
  const texts: string[] = [];
  const visit = (node: XmlNode) => {
    for (const [name, value] of Object.entries(node)) {
      if (name === "t") {
        if (typeof value !== "string") throw new Error("Unsupported chart title.");
        texts.push(value);
      } else for (const entry of nodes(value)) visit(entry);
    }
  };
  visit(rich);
  const title = texts.join("");
  if (title.length > 1000) throw new Error("Chart title too long.");
  return title;
}
