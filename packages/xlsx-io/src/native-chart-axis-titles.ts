import type { ChartCategoryAxisFormat, ChartTextFormat } from "@sheetcraft/core/chart-format";
import { single } from "./chart-package-parts.js";
import { isNativeAxisTitle } from "./native-chart-style-capabilities.js";
import { attr, nodes, xml, type XmlNode } from "./pivot-xml.js";

/** Call only after native style admission; explicit zero is different from automatic. */
export function nativeChartAxisTitle(
  axis: ChartCategoryAxisFormat | undefined,
  textProperties: (format: ChartTextFormat, italic: boolean) => string,
): string {
  if (!axis?.title || axis.titleVisible === false) return "";
  // WPS can supply bold 10pt axis-title defaults. Materialize the renderer's
  // own 12px regular baseline before sparse overrides, including independent {}.
  const effectiveText = axis.titleText ?? axis.text;
  const text: ChartTextFormat = {
    ...(effectiveText?.scriptFonts ? {} : { fontFamily: "Arial" }),
    fontSize: 12,
    bold: false,
    italic: false,
    ...effectiveText,
  };
  const rotation =
    axis.titleRotation === undefined ? "" : ` rot="${Math.round(axis.titleRotation * 60000)}"`;
  return `<c:title><c:tx><c:rich><a:bodyPr${rotation}/><a:lstStyle/><a:p><a:pPr>${textProperties(text, true)}</a:pPr><a:r><a:t xml:space="preserve">${xml(axis.title)}</a:t></a:r></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title>`;
}

function get(parent: XmlNode, key: string): XmlNode | undefined {
  if (parent[key] === undefined) return;
  if (parent[key] === "") return {};
  return single(parent, key);
}
function fields(node: XmlNode): string[] {
  return Object.keys(node).filter(
    (key) => !key.startsWith("@_xmlns") && !(key === "#text" && !String(node[key]).trim()),
  );
}

/** Title failures are local: never discard an otherwise usable chart or invent placeholder text. */
export function readNativeAxisTitle(
  axis: XmlNode,
  path: string,
  omit: (path: string) => void,
  warn: (path: string) => void,
  readText: (rich: XmlNode, txPr?: XmlNode) => ChartTextFormat | undefined,
): ChartCategoryAxisFormat {
  if (axis.title === undefined) return {};
  let title: XmlNode, rich: XmlNode, value: string;
  try {
    title = single(axis, "title");
    const tx = single(title, "tx");
    if (fields(tx).some((key) => key !== "rich")) throw new Error("Dynamic or ambiguous title.");
    rich = single(tx, "rich");
    const paragraphs = nodes(rich.p);
    if (paragraphs.length !== 1 || Array.isArray(rich.p)) throw new Error("Multiple paragraphs.");
    const paragraph = paragraphs[0]!;
    if (fields(paragraph).some((key) => !["pPr", "r", "endParaRPr"].includes(key)))
      throw new Error("Unsupported title breaks or fields.");
    const runs = nodes(paragraph.r);
    if (!runs.length || runs.length > 1000) throw new Error("Title run budget.");
    value = runs
      .map((run) => {
        if (fields(run).some((key) => !["rPr", "t"].includes(key)))
          throw new Error("Unsupported run.");
        if (typeof run.t === "string") return run.t;
        const text = single(run, "t");
        if (
          fields(text).some((key) => !["#text", "@_space"].includes(key)) ||
          typeof text["#text"] !== "string"
        )
          throw new Error("Ambiguous text.");
        return text["#text"];
      })
      .join("");
    if (!isNativeAxisTitle(value)) throw new Error("Unrepresentable text.");
  } catch {
    omit(`${path}.title`);
    return {};
  }
  const result: ChartCategoryAxisFormat = { title: value, titleText: {} };
  try {
    const txPr = get(title, "txPr");
    for (const body of [txPr, rich]) {
      if (!body) continue;
      for (const paragraph of nodes(body.p)) {
        const pPr = get(paragraph, "pPr");
        if (
          pPr &&
          fields(pPr).some(
            (key) => key !== "defRPr" && !(key === "@_defTabSz" && pPr[key] === "914400"),
          )
        )
          warn(`${path}.titleText.paragraph`);
        const props = [
          pPr && get(pPr, "defRPr"),
          get(paragraph, "endParaRPr"),
          ...nodes(paragraph.r).map((run) => get(run, "rPr")),
        ];
        for (const prop of props) {
          if (!prop) continue;
          const neutral: Record<string, string> = {
            "@_u": "none",
            "@_strike": "noStrike",
            "@_baseline": "0",
          };
          for (const key of fields(prop)) {
            if (
              [
                "@_sz",
                "@_b",
                "@_i",
                "@_lang",
                "@_altLang",
                "solidFill",
                "latin",
                "ea",
                "cs",
              ].includes(key) ||
              neutral[key] === String(prop[key])
            )
              continue;
            warn(`${path}.titleText.${key.replace(/^@_/, "")}`);
          }
        }
      }
    }
    result.titleText = readText(rich, txPr) ?? {};
  } catch {
    warn(`${path}.titleText`);
  }
  try {
    for (const key of fields(title)) {
      if (!["tx", "txPr", "layout", "overlay"].includes(key)) warn(`${path}.title.${key}`);
    }
    const layout = get(title, "layout");
    if (layout && fields(layout).length) warn(`${path}.title.layout`);
    const overlay = get(title, "overlay");
    if (
      overlay &&
      (fields(overlay).some((key) => key !== "@_val") ||
        !["0", "false"].includes(attr(overlay, "val")))
    )
      warn(`${path}.title.overlay`);
    if (fields(rich).some((key) => !["bodyPr", "lstStyle", "p"].includes(key)))
      warn(`${path}.titleText`);
    const list = get(rich, "lstStyle");
    if (list && fields(list).length) warn(`${path}.titleText.lstStyle`);
    const txPr = get(title, "txPr");
    const bodies = [txPr && get(txPr, "bodyPr"), get(rich, "bodyPr")].filter(
      (v): v is XmlNode => !!v,
    );
    // Rich bodyPr overrides title txPr; sibling axis txPr never participates.
    for (const body of bodies) {
      const defaults: Record<string, string> = {
        spcFirstLastPara: "0",
        vertOverflow: "ellipsis",
        vert: "horz",
        wrap: "square",
        anchor: "ctr",
        anchorCtr: "1",
      };
      if (
        fields(body).some(
          (key) => key !== "@_rot" && defaults[key.replace(/^@_/, "")] !== String(body[key]),
        )
      )
        warn(`${path}.titleText.bodyPr`);
      if (body["@_rot"] === undefined) continue;
      const raw = attr(body, "rot"),
        units = Number(raw);
      if (!/^[+-]?\d+$/.test(raw) || !Number.isSafeInteger(units) || Math.abs(units) > 5400000) {
        delete result.titleRotation;
        warn(`${path}.titleRotation`);
      } else result.titleRotation = units === 0 ? 0 : units / 60000;
    }
  } catch {
    warn(`${path}.titleText.bodyPr`);
  }
  return result;
}
