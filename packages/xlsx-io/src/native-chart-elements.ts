import type { ChartElementSettings, SheetChart } from "@sheetcraft/core/sheet-charts";
import { only, single } from "./chart-package-parts.js";
import { attr, nodes, type XmlNode } from "./pivot-xml.js";
import type { CompatibilityReportBuilder } from "./report.js";
import {
  nativeLegendPositions as legendPositions,
  nativeLabelPositions as labelPositions,
  unsupportedNativeChartElements,
} from "./native-chart-element-capabilities.js";

/** Called by the workbook preflight before any image/resource access. */
export function reportUnsupportedNativeChartElements(
  chart: SheetChart,
  chartLocation: string,
  report: CompatibilityReportBuilder,
): void {
  for (const field of unsupportedNativeChartElements(chart))
    report.add("feature-omitted", "block", `${chartLocation}.${field}`);
}

/** Ordinary-chart native values. PivotChart placement stays on its existing path. */
export function nativeChartElementValues(chart: SheetChart) {
  const issues = unsupportedNativeChartElements(chart);
  if (issues.length)
    throw new RangeError(`Unsupported native chart settings: ${issues.join(", ")}`);
  const elements = chart.elements;
  return {
    titleOverlay: elements?.titlePosition === "overlay",
    legendPosition: legendPositions[elements?.legendPosition ?? "bottom"],
    legendOverlay: elements?.legendOverlay ?? false,
    labelPosition:
      chart.labels && (chart.type === "column" || chart.type === "bar")
        ? labelPositions[elements?.labelPosition ?? "center"]
        : undefined,
  };
}

function leaf(node: XmlNode, name: string, allowed: readonly string[], fallback?: string): string {
  if (node[name] === undefined) {
    if (fallback === undefined) throw new Error(`Missing native chart ${name}.`);
    return fallback;
  }
  const value = single(node, name);
  if (
    Object.keys(value).some(
      (key) => key !== "@_val" && key !== "#text" && !key.startsWith("@_xmlns"),
    ) ||
    (value["#text"] !== undefined && String(value["#text"]).trim() !== "") ||
    !allowed.includes(attr(value, "val"))
  )
    throw new Error(`Unsupported native chart ${name}.`);
  return attr(value, "val");
}
function booleanLeaf(node: XmlNode, name: string, fallback: boolean): boolean {
  return ["1", "true"].includes(
    leaf(node, name, ["0", "1", "false", "true"], fallback ? "1" : "0"),
  );
}

function emptyLayout(node: XmlNode): void {
  if (node.layout === undefined || (typeof node.layout === "string" && node.layout.trim() === ""))
    return;
  const layout = single(node, "layout");
  if (
    Object.keys(layout).some((key) => key !== "#text" && !key.startsWith("@_xmlns")) ||
    (layout["#text"] !== undefined && String(layout["#text"]).trim() !== "")
  )
    throw new Error("Custom native element layouts are outside this slice.");
}

/** Empty c15 layout/leaderLines are not permission to discard dormant formatting. */
function emptyElement(parent: XmlNode, name: string): void {
  const value = parent[name];
  if (typeof value === "string" && value.trim() === "") return;
  const node = single(parent, name);
  if (
    Object.keys(node).some((key) => key !== "#text" && !key.startsWith("@_xmlns")) ||
    (node["#text"] !== undefined && String(node["#text"]).trim() !== "")
  )
    throw new Error("Nonempty dormant label extension.");
}
function attributes(node: XmlNode, expected: Readonly<Record<string, string>>): void {
  only(node, []);
  if (
    Object.keys(node).some(
      (key) =>
        key !== "#text" &&
        !key.startsWith("@_xmlns") &&
        (!key.startsWith("@_") || !Object.hasOwn(expected, key.slice(2))),
    ) ||
    (node["#text"] !== undefined && String(node["#text"]).trim() !== "") ||
    Object.entries(expected).some(([key, value]) => attr(node, key) !== value)
  )
    throw new Error("Unsupported native label attributes.");
}
function readUniformSeriesLabelPosition(
  family: XmlNode,
  type: "column" | "bar" | "line",
  visible: boolean,
): string | undefined {
  const series = nodes(family.ser);
  const active: string[] = [];
  for (const item of series) {
    if (item.dLbls === undefined) continue;
    const labels = single(item, "dLbls");
    if (labels.delete !== undefined) {
      only(labels, ["delete"]);
      if (!booleanLeaf(labels, "delete", false) || visible)
        throw new Error("Unsupported series labels.");
      continue;
    }
    if (type === "line" || !visible) throw new Error("Unsupported active series labels.");
    only(labels, [
      "numFmt",
      "spPr",
      "txPr",
      "dLblPos",
      "showLegendKey",
      "showVal",
      "showCatName",
      "showSerName",
      "showPercent",
      "showBubbleSize",
      "showLeaderLines",
      "extLst",
    ]);
    if (
      Object.keys(labels).some((key) => key.startsWith("@_") && !key.startsWith("@_xmlns")) ||
      (labels["#text"] !== undefined && String(labels["#text"]).trim() !== "")
    )
      throw new Error("Unsupported series label attributes.");
    for (const style of ["spPr", "txPr"]) if (labels[style] !== undefined) single(labels, style);
    attributes(single(labels, "numFmt"), { formatCode: "General", sourceLinked: "1" });
    leaf(labels, "showVal", ["1"]);
    for (const flag of [
      "showLegendKey",
      "showCatName",
      "showSerName",
      "showPercent",
      "showBubbleSize",
      "showLeaderLines",
    ])
      leaf(labels, flag, ["0"]);
    const extensions = single(labels, "extLst");
    only(extensions, ["ext"]);
    if (extensions["#text"] !== undefined && String(extensions["#text"]).trim() !== "")
      throw new Error("Unsupported native label extension text.");
    const extension = single(extensions, "ext");
    only(extension, ["layout", "showLeaderLines", "leaderLines"]);
    if (
      attr(extension, "uri") !== "{CE6537A1-D6FC-4f65-9D91-7224C49458BB}" ||
      Object.keys(extension).some(
        (key) => key.startsWith("@_") && !key.startsWith("@_xmlns") && key !== "@_uri",
      )
    )
      throw new Error("Unsupported native label extension.");
    if (Object.keys(extensions).some((key) => key.startsWith("@_") && !key.startsWith("@_xmlns")))
      throw new Error("Unsupported native label extension list.");
    emptyElement(extension, "layout");
    emptyElement(extension, "leaderLines");
    leaf(extension, "showLeaderLines", ["0"]);
    active.push(leaf(labels, "dLblPos", Object.values(labelPositions)));
  }
  if (!active.length) return undefined;
  if (active.length !== series.length || active.some((position) => position !== active[0]))
    throw new Error("Series labels do not share one representable position.");
  const familyLabels = single(family, "dLbls");
  if (
    familyLabels.dLblPos !== undefined &&
    leaf(familyLabels, "dLblPos", Object.values(labelPositions)) !== active[0]
  )
    throw new Error("Conflicting family and series label positions.");
  return active[0];
}

/**
 * Recover native active values; unrepresentable dormant choices are rejected.
 * Defaults remain sparse; no private marker or raster fallback is required.
 * Typography remains a separately reported native-style limitation.
 */
export function readNativeChartElements(
  native: XmlNode,
  family: XmlNode,
  type: "column" | "bar" | "line",
  titleText: string,
): ChartElementSettings | undefined {
  const result: ChartElementSettings = {};
  if (native.title !== undefined) {
    const title = single(native, "title");
    only(title, ["tx", "layout", "overlay", "spPr", "txPr"]);
    emptyLayout(title);
    if (booleanLeaf(native, "autoTitleDeleted", false))
      throw new Error("Conflicting native chart title visibility.");
    if (booleanLeaf(title, "overlay", false)) {
      if (!titleText) throw new Error("Unrepresentable implicit overlay title.");
      result.titlePosition = "overlay";
    }
  } else {
    // An absent title with empty Core text needs no sparse presence marker.
    booleanLeaf(native, "autoTitleDeleted", false);
  }
  if (native.legend !== undefined) {
    const legend = single(native, "legend");
    only(legend, ["legendPos", "legendEntry", "layout", "overlay", "spPr", "txPr"]);
    // WPS repeats the whole legend typography per entry. This is not permission
    // for per-entry overrides, deleted entries, invalid indices or local rich text.
    const indices = new Set<number>();
    const entries =
      legend.legendEntry === undefined
        ? []
        : Array.isArray(legend.legendEntry)
          ? legend.legendEntry
          : [legend.legendEntry];
    if (entries.length !== nodes(legend.legendEntry).length)
      throw new Error("Malformed legend entry.");
    for (const entry of nodes(legend.legendEntry)) {
      only(entry, ["idx", "txPr"]);
      if (
        Object.keys(entry).some((key) => key.startsWith("@_") && !key.startsWith("@_xmlns")) ||
        (entry["#text"] !== undefined && String(entry["#text"]).trim())
      )
        throw new Error("Unsupported legend-entry attributes.");
      const idx = single(entry, "idx");
      const value = attr(idx, "val"),
        index = Number(value);
      attributes(idx, { val: value });
      if (
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(index) ||
        index >= nodes(family.ser).length ||
        indices.has(index)
      )
        throw new Error("Invalid or duplicate legend-entry index.");
      indices.add(index);
      if (JSON.stringify(single(entry, "txPr")) !== JSON.stringify(single(legend, "txPr")))
        throw new Error("Per-entry legend text is outside the uniform-style slice.");
    }
    if (legend.legendEntry !== undefined && !nodes(legend.legendEntry).length)
      throw new Error("Malformed legend entry.");
    emptyLayout(legend);
    const position = leaf(legend, "legendPos", Object.values(legendPositions));
    if (position !== "b")
      result.legendPosition = Object.entries(legendPositions).find(
        ([, value]) => value === position,
      )![0] as ChartElementSettings["legendPosition"];
    if (booleanLeaf(legend, "overlay", false)) result.legendOverlay = true;
  }
  if (family.dLbls !== undefined) {
    const labels = single(family, "dLbls");
    only(labels, [
      "delete",
      "dLblPos",
      "showLegendKey",
      "showVal",
      "showCatName",
      "showSerName",
      "showPercent",
      "showBubbleSize",
      "spPr",
      "txPr",
    ]);
    const visible = booleanLeaf(labels, "showVal", false);
    for (const flag of [
      "showLegendKey",
      "showCatName",
      "showSerName",
      "showPercent",
      "showBubbleSize",
    ])
      if (booleanLeaf(labels, flag, false)) throw new Error("Unsupported native label content.");
    if (booleanLeaf(labels, "delete", false) && visible)
      throw new Error("Conflicting native chart data-label visibility.");
    if (labels.dLblPos !== undefined) {
      if (type === "line" || !visible)
        throw new Error("Inactive or line data-label positions are outside this slice.");
      const position = leaf(labels, "dLblPos", Object.values(labelPositions));
      if (position !== "ctr")
        result.labelPosition = Object.entries(labelPositions).find(
          ([, value]) => value === position,
        )![0] as ChartElementSettings["labelPosition"];
    }
  }
  const seriesPosition = readUniformSeriesLabelPosition(
    family,
    type,
    family.dLbls !== undefined && booleanLeaf(single(family, "dLbls"), "showVal", false),
  );
  if (seriesPosition !== undefined && seriesPosition !== "ctr")
    result.labelPosition = Object.entries(labelPositions).find(
      ([, value]) => value === seriesPosition,
    )![0] as ChartElementSettings["labelPosition"];
  // No data table or per-point labels are admitted by the package collector.
  return Object.keys(result).length ? result : undefined;
}
