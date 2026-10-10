import { XMLParser } from "fast-xml-parser";
import { strFromU8 } from "fflate/browser";
import {
  attr,
  child,
  nodes,
  parseXml,
  relationshipPath,
  resolvePart,
  type XmlNode,
} from "./pivot-xml.js";

const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const ART_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const STYLE_NS = "http://schemas.microsoft.com/office/drawing/2012/chartStyle";
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const C14_NS = "http://schemas.microsoft.com/office/drawing/2007/8/2/chart";
const WPS_CHART_NS = "https://web.wps.cn/et/2018/main";
const WPS_CHART_PROPERTIES_URI = "{0b15fc19-7d7d-44ad-8c2d-2c3a37ce22c3}";
const DRAWING_MIME = "application/vnd.openxmlformats-officedocument.drawing+xml";
const CHART_MIME = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const preservedParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
});

export class UnsupportedChartDrawingError extends Error {}
function reject(): never {
  throw new UnsupportedChartDrawingError("Unsupported native chart drawing.");
}
const values = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined ? [] : [value];
export function single(node: XmlNode, name: string): XmlNode {
  const entries = values(node[name]);
  if (entries.length !== 1 || !entries[0] || typeof entries[0] !== "object") return reject();
  return entries[0] as XmlNode;
}
export function only(node: XmlNode, allowed: readonly string[]): void {
  if (
    Object.keys(node).some(
      (key) => !key.startsWith("@_") && key !== "#text" && !allowed.includes(key),
    )
  )
    reject();
}

/** Check namespace bindings before using the adapter's local-name XML representation. */
function strictRoot(
  bytes: Uint8Array,
  name: string,
  namespace: string,
  allowedNamespaces = [namespace],
  relationshipIds = false,
): XmlNode {
  const local = parseXml(bytes);
  const raw = preservedParser.parse(strFromU8(bytes)) as XmlNode;
  const roots = Object.keys(raw).filter((key) => !key.startsWith("?") && !key.startsWith("@_"));
  if (roots.length !== 1) return reject();
  const chartElements = new Set([
    "chartSpace",
    "pivotSource",
    "chart",
    "plotArea",
    "barChart",
    "lineChart",
    "marker",
    "symbol",
    "size",
    "smooth",
    "barDir",
    "grouping",
    "ser",
    "idx",
    "order",
    "tx",
    "strRef",
    "strCache",
    "numRef",
    "numCache",
    "cat",
    "val",
    "f",
    "v",
    "pt",
    "ptCount",
    "catAx",
    "valAx",
    "axId",
    "crossAx",
    "name",
    "fmtId",
    "title",
    "rich",
    "legend",
    "legendPos",
    "overlay",
    "layout",
    "date1904",
    "lang",
    "roundedCorners",
    "autoTitleDeleted",
    "dLbls",
    "delete",
    "showLegendKey",
    "showVal",
    "showCatName",
    "showSerName",
    "showPercent",
    "showBubbleSize",
    "varyColors",
    "invertIfNegative",
    "gapWidth",
    "overlap",
    "plotVisOnly",
    "dispBlanksAs",
    "showDLblsOverMax",
    "scaling",
    "orientation",
    "axPos",
    "majorGridlines",
    "numFmt",
    "majorTickMark",
    "minorTickMark",
    "tickLblPos",
    "crosses",
    "auto",
    "lblAlgn",
    "lblOffset",
    "noMultiLvlLbl",
    "crossBetween",
    "spPr",
    "txPr",
    "printSettings",
    "headerFooter",
    "pageMargins",
    "pageSetup",
    "style",
    "extLst",
    "ext",
    "formatCode",
  ]);
  const artElements = new Set([
    "prstDash",
    "solidFill",
    "schemeClr",
    "srgbClr",
    "ln",
    "noFill",
    "effectLst",
    "bodyPr",
    "lstStyle",
    "p",
    "pPr",
    "defRPr",
    "latin",
    "ea",
    "cs",
    "lumMod",
    "lumOff",
    "round",
    "r",
    "t",
    "endParaRPr",
    "rPr",
  ]);
  const c14Elements = new Set([
    "style",
    "pivotOptions",
    "dropZoneFilter",
    "dropZoneCategories",
    "dropZoneData",
    "dropZoneSeries",
    "dropZonesVisible",
  ]);
  const styleElements = new Set([
    "axisTitle",
    "bodyPr",
    "categoryAxis",
    "chartArea",
    "chartStyle",
    "colorStyle",
    "variation",
    "dataLabel",
    "dataLabelCallout",
    "dataPoint",
    "dataPoint3D",
    "dataPointLine",
    "dataPointMarker",
    "dataPointMarkerLayout",
    "dataPointWireframe",
    "dataTable",
    "defRPr",
    "downBar",
    "dropLine",
    "effectRef",
    "errorBar",
    "fillRef",
    "floor",
    "fontRef",
    "gridlineMajor",
    "gridlineMinor",
    "hiLoLine",
    "leaderLine",
    "legend",
    "lnRef",
    "plotArea",
    "plotArea3D",
    "seriesAxis",
    "seriesLine",
    "spPr",
    "styleClr",
    "title",
    "trendline",
    "trendlineLabel",
    "upBar",
    "valueAxis",
    "wall",
  ]);
  const drawingElements = new Set([
    "wsDr",
    "oneCellAnchor",
    "twoCellAnchor",
    "from",
    "to",
    "col",
    "colOff",
    "row",
    "rowOff",
    "graphicFrame",
    "nvGraphicFramePr",
    "cNvPr",
    "cNvGraphicFramePr",
    "xfrm",
    "clientData",
  ]);
  const walk = (
    key: string,
    value: unknown,
    inherited: ReadonlyMap<string, string>,
    root = false,
    parent = "",
    ancestors: readonly string[] = [],
  ) => {
    for (const entry of values(value)) {
      const node = entry && typeof entry === "object" ? (entry as XmlNode) : {};
      const bindings = new Map(inherited);
      for (const [attribute, binding] of Object.entries(node)) {
        if (attribute === "@_xmlns") bindings.set("", String(binding));
        else if (attribute.startsWith("@_xmlns:"))
          bindings.set(attribute.slice(8), String(binding));
      }
      const [prefix, localName] = key.includes(":") ? key.split(":") : ["", key];
      const ns = bindings.get(prefix!) ?? "";
      // Observed WPS post-save straight lines add this inert solid-dash leaf.
      // Admit only its exact series line-style location/value, not general dash
      // payloads or a new drawing/column/style extension escape hatch.
      if (
        namespace === CHART_NS &&
        localName === "prstDash" &&
        (ns !== ART_NS ||
          ancestors.join("/") !== "chartSpace/chart/plotArea/lineChart/ser/spPr/ln" ||
          node["@_val"] !== "solid" ||
          Object.keys(node).some(
            (key) => key !== "@_val" && key !== "#text" && !key.startsWith("@_xmlns"),
          ) ||
          (node["#text"] !== undefined && String(node["#text"]).trim() !== ""))
      )
        reject();
      if (
        !allowedNamespaces.includes(ns) ||
        (root && (localName !== name || ns !== namespace)) ||
        (((namespace === CHART_NS && chartElements.has(localName!)) ||
          (namespace === DRAWING_NS && localName === "chart")) &&
          ns !== CHART_NS &&
          !(namespace === CHART_NS && localName === "style" && ns === C14_NS)) ||
        (namespace === DRAWING_NS && drawingElements.has(localName!) && ns !== DRAWING_NS) ||
        (namespace === DRAWING_NS &&
          ns === DRAWING_NS &&
          !drawingElements.has(localName!) &&
          localName !== "ext") ||
        (namespace === DRAWING_NS &&
          ["graphic", "graphicData", "off"].includes(localName!) &&
          ns !== ART_NS) ||
        (namespace === DRAWING_NS &&
          localName === "ext" &&
          ns !== (parent === "oneCellAnchor" ? DRAWING_NS : parent === "xfrm" ? ART_NS : "")) ||
        (namespace === DRAWING_NS &&
          ns === ART_NS &&
          !["graphic", "graphicData", "off", "ext"].includes(localName!)) ||
        (namespace === CHART_NS && ns === ART_NS && !artElements.has(localName!)) ||
        (namespace === CHART_NS && artElements.has(localName!) && ns !== ART_NS) ||
        (namespace === CHART_NS && ns === C14_NS && !c14Elements.has(localName!)) ||
        (namespace === CHART_NS &&
          ns === WPS_CHART_NS &&
          (localName !== "chartProps" || ancestors.join("/") !== "chartSpace/chart/extLst/ext")) ||
        (namespace === CHART_NS && localName === "chartProps" && ns !== WPS_CHART_NS) ||
        (namespace === CHART_NS &&
          ns === MC_NS &&
          !["AlternateContent", "Choice", "Fallback"].includes(localName!)) ||
        (namespace === CHART_NS && ns === CHART_NS && !chartElements.has(localName!)) ||
        (namespace === CHART_NS &&
          ["AlternateContent", "Choice", "Fallback"].includes(localName!) &&
          ns !== MC_NS) ||
        (namespace === STYLE_NS && ns === STYLE_NS && !styleElements.has(localName!)) ||
        (namespace === STYLE_NS &&
          ns === ART_NS &&
          !artElements.has(localName!) &&
          !["prstDash", "spAutoFit"].includes(localName!))
      )
        reject();
      if (namespace === DRAWING_NS && localName === "chart") {
        const ids = Object.keys(node).filter(
          (attribute) =>
            attribute.startsWith("@_") && attribute.slice(2).split(":").at(-1) === "id",
        );
        if (
          ids.length !== 1 ||
          !ids[0]!.includes(":") ||
          bindings.get(ids[0]!.slice(2).split(":")[0]!) !== REL_NS
        )
          reject();
      }
      for (const attribute of Object.keys(node)) {
        if (!attribute.startsWith("@_") || attribute.startsWith("@_xmlns")) continue;
        const rawName = attribute.slice(2);
        if (!rawName.includes(":")) continue;
        const attributeNs = bindings.get(rawName.split(":")[0]!);
        if (
          attributeNs !== "http://www.w3.org/XML/1998/namespace" &&
          (!relationshipIds || attributeNs !== REL_NS || rawName.split(":")[1] !== "id")
        )
          reject();
      }
      for (const [childKey, content] of Object.entries(node))
        if (!childKey.startsWith("@_") && childKey !== "#text")
          walk(childKey, content, bindings, false, localName, [...ancestors, localName!]);
    }
  };
  walk(roots[0]!, raw[roots[0]!], new Map(), true);
  return single(local, name);
}

function worksheetDrawingId(bytes: Uint8Array): string {
  const raw = preservedParser.parse(strFromU8(bytes)) as XmlNode;
  const rootKey = Object.keys(raw).find((key) => key.split(":").at(-1) === "worksheet");
  if (!rootKey) return reject();
  const root = single(raw, rootKey);
  const bindings = new Map<string, string>();
  const bind = (node: XmlNode) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === "@_xmlns") bindings.set("", String(value));
      else if (key.startsWith("@_xmlns:")) bindings.set(key.slice(8), String(value));
    }
  };
  bind(root);
  const key = Object.keys(root).find((key) => key.split(":").at(-1) === "drawing");
  if (!key) return reject();
  const drawing = single(root, key);
  bind(drawing);
  if (
    bindings.get(key.includes(":") ? key.split(":")[0]! : "") !==
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  )
    reject();
  const ids = Object.keys(drawing).filter(
    (attribute) => attribute.startsWith("@_") && attribute.slice(2).split(":").at(-1) === "id",
  );
  if (
    ids.length !== 1 ||
    !ids[0]!.includes(":") ||
    bindings.get(ids[0]!.slice(2).split(":")[0]!) !== REL_NS
  )
    reject();
  return String(drawing[ids[0]!]);
}

type Relation = { target: string; type: string };
export type NativeChartPart = {
  kind: "pivot" | "ordinary";
  sheetPart: string;
  sheetIndex: number;
  drawingPart: string;
  chartPart: string;
  anchorKind: "oneCellAnchor" | "twoCellAnchor";
  anchor: XmlNode;
  frame: XmlNode;
  chartSpace: XmlNode;
  wpsChartProperties: boolean;
};
export type NativeChartPackage = {
  parts: ReadonlySet<string>;
  charts: readonly NativeChartPart[];
};

/** Admit a chart-only relationship graph; unrelated drawing/media parts never inherit admission. */
export async function collectNativeChartParts(
  entries: Record<string, Uint8Array>,
  readPart: (part: string) => Promise<Uint8Array | undefined>,
): Promise<NativeChartPackage> {
  const parts = new Set<string>();
  const charts: NativeChartPart[] = [];
  const hasDrawing = Object.entries(entries).some(
    ([part, bytes]) =>
      (/^xl\/worksheets\/[^/]+\.xml$/i.test(part) &&
        values(child(parseXml(bytes), "worksheet").drawing).length > 0) ||
      (part.toLowerCase() === "[content_types].xml" && strFromU8(bytes).includes(DRAWING_MIME)) ||
      (part.endsWith(".rels") && strFromU8(bytes).includes(`${REL_NS}/drawing`)),
  );
  if (!hasDrawing) return { parts, charts };
  const read = async (part: string): Promise<Uint8Array> => {
    const bytes = await readPart(part);
    if (!bytes) return reject();
    entries[part] = bytes;
    return bytes;
  };
  const rels = async (part: string, allowHyperlinks = false): Promise<Map<string, Relation>> => {
    const path = relationshipPath(part);
    const bytes = await readPart(path);
    const result = new Map<string, Relation>();
    if (!bytes) return result;
    entries[path] = bytes;
    const root = strictRoot(bytes, "Relationships", PACKAGE_NS);
    only(root, ["Relationship"]);
    if (values(root.Relationship).length !== nodes(root.Relationship).length) reject();
    for (const relation of nodes(root.Relationship)) {
      const id = attr(relation, "Id");
      const target = attr(relation, "Target");
      if (
        allowHyperlinks &&
        attr(relation, "Type") === `${REL_NS}/hyperlink` &&
        attr(relation, "TargetMode") === "External"
      ) {
        if (!id || result.has(id) || !target) reject();
        result.set(id, { target, type: `${REL_NS}/hyperlink` });
        continue;
      }
      if (
        !id ||
        result.has(id) ||
        !["", "Internal"].includes(attr(relation, "TargetMode")) ||
        !target ||
        /[\\?#%]|^\/\/|^[^/]*:/u.test(target)
      )
        reject();
      result.set(id, { target: resolvePart(part, target), type: attr(relation, "Type") });
    }
    return result;
  };
  const typeRoot = strictRoot(await read("[Content_Types].xml"), "Types", TYPES_NS);
  const types = new Map<string, string>();
  if (values(typeRoot.Override).length !== nodes(typeRoot.Override).length) reject();
  for (const override of nodes(typeRoot.Override)) {
    const part = attr(override, "PartName");
    if (
      !part.startsWith("/") ||
      /[\\?#%]|(^|\/)\.\.?(\/|$)/u.test(part) ||
      types.has(part.slice(1).toLowerCase())
    )
      reject();
    types.set(part.slice(1).toLowerCase(), attr(override, "ContentType"));
  }
  const admit = (part: string, mime: string) => {
    if (types.get(part.toLowerCase()) !== mime) reject();
    parts.add(part.toLowerCase());
  };
  const workbook = child(parseXml(await read("xl/workbook.xml")), "workbook");
  const workbookRels = await rels("xl/workbook.xml");
  const claimed = new Set<string>();
  for (const [sheetIndex, sheet] of nodes(child(workbook, "sheets").sheet).entries()) {
    const sheetRelation = workbookRels.get(attr(sheet, "id"));
    if (!sheetRelation || sheetRelation.type !== `${REL_NS}/worksheet`) continue;
    const sheetPart = sheetRelation.target;
    const worksheetBytes = await read(sheetPart);
    const worksheet = child(parseXml(worksheetBytes), "worksheet");
    const sheetRels = await rels(sheetPart, true);
    const drawingNodes = values(worksheet.drawing);
    const drawingRels = [...sheetRels.values()].filter((relation) =>
      relation.type.endsWith("/drawing"),
    );
    if (!drawingNodes.length && !drawingRels.length) continue;
    if (drawingNodes.length !== 1 || drawingRels.length !== 1) reject();
    const drawingRelation = sheetRels.get(worksheetDrawingId(worksheetBytes));
    if (
      !drawingRelation ||
      drawingRelation.type !== `${REL_NS}/drawing` ||
      claimed.has(drawingRelation.target.toLowerCase())
    )
      reject();
    const drawingPart = drawingRelation.target;
    claimed.add(drawingPart.toLowerCase());
    const drawing = strictRoot(
      await read(drawingPart),
      "wsDr",
      DRAWING_NS,
      [DRAWING_NS, ART_NS, CHART_NS],
      true,
    );
    only(drawing, ["oneCellAnchor", "twoCellAnchor"]);
    const drawingRelations = await rels(drawingPart);
    const used = new Set<string>();
    const objectIds = new Set<string>();
    const anchors = (["oneCellAnchor", "twoCellAnchor"] as const).flatMap((anchorKind) =>
      nodes(drawing[anchorKind]).map((anchor) => ({ anchorKind, anchor })),
    );
    if (
      anchors.length !==
      values(drawing.oneCellAnchor).length + values(drawing.twoCellAnchor).length
    )
      reject();
    if (!anchors.length) reject();
    for (const { anchorKind, anchor } of anchors) {
      only(anchor, [
        "from",
        anchorKind === "oneCellAnchor" ? "ext" : "to",
        "graphicFrame",
        "clientData",
      ]);
      single(anchor, "from");
      single(anchor, anchorKind === "oneCellAnchor" ? "ext" : "to");
      if (values(anchor.clientData).length !== 1) reject();
      const frame = single(anchor, "graphicFrame");
      only(frame, ["nvGraphicFramePr", "xfrm", "graphic"]);
      const nonvisual = single(frame, "nvGraphicFramePr");
      only(nonvisual, ["cNvPr", "cNvGraphicFramePr"]);
      const objectId = attr(single(nonvisual, "cNvPr"), "id");
      if (
        !/^\d+$/.test(objectId) ||
        Number(objectId) < 1 ||
        !Number.isSafeInteger(Number(objectId)) ||
        objectIds.has(String(Number(objectId)))
      )
        reject();
      objectIds.add(String(Number(objectId)));
      if (values(nonvisual.cNvGraphicFramePr).length !== 1) reject();
      const transform = single(frame, "xfrm");
      only(transform, ["off", "ext"]);
      single(transform, "off");
      single(transform, "ext");
      if (
        Number(attr(transform, "rot", "0")) !== 0 ||
        !["0", "false"].includes(attr(transform, "flipH", "0")) ||
        !["0", "false"].includes(attr(transform, "flipV", "0"))
      )
        reject();
      const graphic = single(frame, "graphic");
      only(graphic, ["graphicData"]);
      const graphicData = single(graphic, "graphicData");
      only(graphicData, ["chart"]);
      if (attr(graphicData, "uri") !== CHART_NS) reject();
      const id = attr(single(graphicData, "chart"), "id");
      const relation = drawingRelations.get(id);
      if (
        !relation ||
        relation.type !== `${REL_NS}/chart` ||
        used.has(id) ||
        claimed.has(relation.target.toLowerCase())
      )
        reject();
      used.add(id);
      claimed.add(relation.target.toLowerCase());
      const chartPart = relation.target;
      const chartSpace = strictRoot(await read(chartPart), "chartSpace", CHART_NS, [
        CHART_NS,
        ART_NS,
        MC_NS,
        C14_NS,
        WPS_CHART_NS,
      ]);
      only(chartSpace, [
        "date1904",
        "lang",
        "roundedCorners",
        "AlternateContent",
        "style",
        "pivotSource",
        "chart",
        "spPr",
        "txPr",
        "printSettings",
        "extLst",
      ]);
      if (chartSpace.AlternateContent !== undefined) {
        const alternate = single(chartSpace, "AlternateContent");
        only(alternate, ["Choice", "Fallback"]);
        const choice = single(alternate, "Choice");
        const fallback = single(alternate, "Fallback");
        only(choice, ["style"]);
        only(fallback, ["style"]);
        single(choice, "style");
        single(fallback, "style");
      }
      const kind = chartSpace.pivotSource === undefined ? "ordinary" : "pivot";
      if (kind === "pivot") {
        const source = single(chartSpace, "pivotSource");
        only(source, ["name", "fmtId"]);
        if (
          typeof source.name !== "string" ||
          values(source.name).length !== 1 ||
          attr(single(source, "fmtId"), "val") !== "0"
        )
          reject();
      } else if (chartSpace.extLst !== undefined) {
        // No detached PivotChart field-button options or other unproven extensions.
        reject();
      }
      const nativeChart = single(chartSpace, "chart");
      only(nativeChart, [
        "title",
        "autoTitleDeleted",
        "plotArea",
        "legend",
        "plotVisOnly",
        "dispBlanksAs",
        "showDLblsOverMax",
        "extLst",
      ]);
      // WPS adds this inert chart UUID only after saving an exported chart. Admit
      // that observed leaf, not arbitrary extension namespaces or payloads.
      if (nativeChart.extLst !== undefined) {
        const extensions = single(nativeChart, "extLst");
        only(extensions, ["ext"]);
        const extension = single(extensions, "ext");
        only(extension, ["chartProps"]);
        if (
          attr(extension, "uri") !== WPS_CHART_PROPERTIES_URI ||
          Object.keys(extension).some(
            (key) => key.startsWith("@_") && !key.startsWith("@_xmlns") && key !== "@_uri",
          )
        )
          reject();
        const properties = single(extension, "chartProps");
        only(properties, []);
        if (
          Object.keys(properties).some(
            (key) => key.startsWith("@_") && !key.startsWith("@_xmlns") && key !== "@_chartId",
          ) ||
          (properties["#text"] !== undefined && String(properties["#text"]).trim() !== "") ||
          !/^\{[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\}$/i.test(attr(properties, "chartId"))
        )
          reject();
      }
      const plot = single(nativeChart, "plotArea");
      only(plot, ["layout", "barChart", "lineChart", "catAx", "valAx", "spPr"]);
      const line = plot.lineChart !== undefined;
      if (line && (plot.barChart !== undefined || kind !== "ordinary")) reject();
      const bar = single(plot, line ? "lineChart" : "barChart");
      only(
        bar,
        line
          ? ["grouping", "varyColors", "ser", "dLbls", "marker", "smooth", "axId"]
          : ["barDir", "grouping", "varyColors", "ser", "dLbls", "gapWidth", "overlap", "axId"],
      );
      if (
        (!line && attr(single(bar, "barDir"), "val") !== "col") ||
        attr(single(bar, "grouping"), "val") !== (line ? "standard" : "clustered")
      )
        reject();
      const categoryAxis = single(plot, "catAx");
      const valueAxis = single(plot, "valAx");
      const categoryId = attr(single(categoryAxis, "axId"), "val");
      const valueId = attr(single(valueAxis, "axId"), "val");
      const axisIds = nodes(bar.axId).map((node) => attr(node, "val"));
      if (
        ![categoryId, valueId].every(
          (id) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)),
        ) ||
        categoryId === valueId ||
        axisIds.length !== 2 ||
        axisIds[0] !== categoryId ||
        axisIds[1] !== valueId ||
        attr(single(categoryAxis, "crossAx"), "val") !== valueId ||
        attr(single(valueAxis, "crossAx"), "val") !== categoryId
      )
        reject();
      const series = nodes(bar.ser);
      if (values(bar.ser).length !== series.length) reject();
      if (!series.length || series.length > 10000) reject();
      for (const [index, seriesNode] of series.entries()) {
        only(
          seriesNode,
          line
            ? ["idx", "order", "tx", "spPr", "marker", "dLbls", "cat", "val", "smooth"]
            : ["idx", "order", "tx", "spPr", "invertIfNegative", "dLbls", "cat", "val"],
        );
        if (
          attr(single(seriesNode, "idx"), "val") !== String(index) ||
          attr(single(seriesNode, "order"), "val") !== String(index)
        )
          reject();
      }
      const companions = await rels(chartPart);
      const companionTypes = new Set<string>();
      for (const relation of companions.values()) {
        const style =
          relation.type === "http://schemas.microsoft.com/office/2011/relationships/chartStyle";
        const color =
          relation.type ===
          "http://schemas.microsoft.com/office/2011/relationships/chartColorStyle";
        if (
          (!style && !color) ||
          companionTypes.has(relation.type) ||
          claimed.has(relation.target.toLowerCase())
        )
          reject();
        companionTypes.add(relation.type);
        claimed.add(relation.target.toLowerCase());
        strictRoot(await read(relation.target), style ? "chartStyle" : "colorStyle", STYLE_NS, [
          STYLE_NS,
          ART_NS,
        ]);
        if ((await rels(relation.target)).size) reject();
        admit(
          relation.target,
          style
            ? "application/vnd.ms-office.chartstyle+xml"
            : "application/vnd.ms-office.chartcolorstyle+xml",
        );
        if (entries[relationshipPath(relation.target)])
          parts.add(relationshipPath(relation.target).toLowerCase());
      }
      admit(chartPart, CHART_MIME);
      if (entries[relationshipPath(chartPart)])
        parts.add(relationshipPath(chartPart).toLowerCase());
      charts.push({
        kind,
        sheetPart,
        sheetIndex,
        drawingPart,
        chartPart,
        anchorKind,
        anchor,
        frame,
        chartSpace,
        wpsChartProperties: nativeChart.extLst !== undefined,
      });
    }
    if (used.size !== drawingRelations.size) reject();
    admit(drawingPart, DRAWING_MIME);
    if (entries[relationshipPath(drawingPart)])
      parts.add(relationshipPath(drawingPart).toLowerCase());
  }
  // Content-type aliases outside xl/drawings are subject to the same orphan block.
  for (const [part, mime] of types) if (mime === DRAWING_MIME && !parts.has(part)) reject();
  return { parts, charts };
}
