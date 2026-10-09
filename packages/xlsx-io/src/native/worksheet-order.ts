// CT_Worksheet sequence from the Open XML SDK's SpreadsheetML schema:
// https://github.com/dotnet/Open-XML-SDK/blob/main/data/schemas/schemas_openxmlformats_org_spreadsheetml_2006_main.json
const WORKSHEET_CHILDREN = [
  "sheetPr",
  "dimension",
  "sheetViews",
  "sheetFormatPr",
  "cols",
  "sheetData",
  "sheetCalcPr",
  "sheetProtection",
  "protectedRanges",
  "scenarios",
  "autoFilter",
  "sortState",
  "dataConsolidate",
  "customSheetViews",
  "mergeCells",
  "phoneticPr",
  "conditionalFormatting",
  "dataValidations",
  "hyperlinks",
  "printOptions",
  "pageMargins",
  "pageSetup",
  "headerFooter",
  "rowBreaks",
  "colBreaks",
  "customProperties",
  "cellWatches",
  "ignoredErrors",
  "drawing",
  "legacyDrawing",
  "legacyDrawingHF",
  "drawingHF",
  "picture",
  "oleObjects",
  "controls",
  "webPublishItems",
  "tableParts",
  "extLst",
] as const;
const CHILD_ORDER = new Map<string, number>(WORKSHEET_CHILDREN.map((name, index) => [name, index]));

type XmlTag = { start: number; end: number; name?: string; closing?: boolean; empty?: boolean };
const SPECIAL_TAGS = [
  ["<!--", "-->"],
  ["<![CDATA[", "]]>"],
  ["<?", "?>"],
] as const;

/** Scan tags without interpreting or reserializing attributes, text, or extension XML. */
function nextTag(source: string, offset: number): XmlTag | undefined {
  const start = source.indexOf("<", offset);
  if (start < 0) return undefined;
  for (const [opening, closing] of SPECIAL_TAGS) {
    if (!source.startsWith(opening, start)) continue;
    const end = source.indexOf(closing, start + opening.length);
    if (end < 0) throw new Error("Invalid generated XLSX worksheet XML.");
    return { start, end: end + closing.length };
  }
  if (source.startsWith("<!", start)) throw new Error("Invalid generated XLSX worksheet XML.");
  let quote = "";
  for (let end = start + 1; end < source.length; end++) {
    const character = source[end]!;
    if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ">") {
      const tag = source.slice(start, end + 1);
      const match = /^<(\/?)([a-z_][\w.:-]*)\b/i.exec(tag);
      if (!match) throw new Error("Invalid generated XLSX worksheet XML.");
      return {
        start,
        end: end + 1,
        name: match[2],
        closing: Boolean(match[1]),
        empty: /\/\s*>$/.test(tag),
      };
    }
  }
  throw new Error("Invalid generated XLSX worksheet XML.");
}

/** Extend the worksheet's own extLst, never a rule-local or other nested list. */
export function appendNativeWorksheetExtension(source: string, extension: string): string {
  const stack: string[] = [];
  let offset = 0;
  let rootPrefix = "";
  for (let tag = nextTag(source, offset); tag; tag = nextTag(source, offset)) {
    offset = tag.end;
    if (!tag.name) continue;
    const localName = tag.name.split(":").at(-1)!;
    if (tag.closing) {
      const rootExtensionClosing = stack.length === 2 && localName === "extLst";
      if (stack.pop() !== tag.name) throw new Error("Invalid generated XLSX worksheet XML.");
      if (rootExtensionClosing)
        return source.slice(0, tag.start) + extension + source.slice(tag.start);
      if (!stack.length) {
        if (localName !== "worksheet") throw new Error("Invalid generated XLSX worksheet XML.");
        return (
          source.slice(0, tag.start) +
          `<${rootPrefix}extLst>${extension}</${rootPrefix}extLst>` +
          source.slice(tag.start)
        );
      }
      continue;
    }
    if (!stack.length) {
      if (localName !== "worksheet") throw new Error("Invalid generated XLSX worksheet XML.");
      const separator = tag.name.lastIndexOf(":");
      rootPrefix = separator < 0 ? "" : tag.name.slice(0, separator + 1);
      if (tag.empty) {
        const opening = source.slice(tag.start, tag.end).replace(/\/\s*>$/, ">");
        return (
          source.slice(0, tag.start) +
          opening +
          `<${rootPrefix}extLst>${extension}</${rootPrefix}extLst></${tag.name}>` +
          source.slice(tag.end)
        );
      }
    } else if (stack.length === 1 && localName === "extLst" && tag.empty) {
      const opening = source.slice(tag.start, tag.end).replace(/\/\s*>$/, ">");
      return (
        source.slice(0, tag.start) + opening + extension + `</${tag.name}>` + source.slice(tag.end)
      );
    }
    if (!tag.empty) stack.push(tag.name);
  }
  throw new Error("Invalid generated XLSX worksheet XML.");
}

/** Reorder only complete top-level children in freshly generated worksheet parts. */
export function canonicalizeNativeWorksheetXml(source: string): string {
  const children: Array<{ name: string; xml: string }> = [];
  const stack: string[] = [];
  let prefix = "";
  let childName = "";
  let childStart = 0;
  let offset = 0;
  for (let tag = nextTag(source, offset); tag; tag = nextTag(source, offset)) {
    offset = tag.end;
    if (!tag.name) continue;
    const localName = tag.name.split(":").at(-1)!;
    if (tag.closing) {
      if (stack.pop() !== tag.name) throw new Error("Invalid generated XLSX worksheet XML.");
      if (!stack.length) {
        if (localName !== "worksheet") throw new Error("Invalid generated XLSX worksheet XML.");
        const fallback = WORKSHEET_CHILDREN.length - 1.5;
        children.sort(
          (left, right) =>
            (CHILD_ORDER.get(left.name) ?? fallback) - (CHILD_ORDER.get(right.name) ?? fallback),
        );
        return prefix + children.map((child) => child.xml).join("") + source.slice(childStart);
      }
      if (stack.length === 1) {
        children.push({ name: childName, xml: source.slice(childStart, tag.end) });
        childStart = tag.end;
      }
      continue;
    }
    if (!stack.length) {
      if (localName !== "worksheet") throw new Error("Invalid generated XLSX worksheet XML.");
      if (tag.empty) return source;
      prefix = source.slice(0, tag.end);
      childStart = tag.end;
    } else if (stack.length === 1) {
      childName = localName;
      if (tag.empty) {
        children.push({ name: childName, xml: source.slice(childStart, tag.end) });
        childStart = tag.end;
      }
    }
    if (!tag.empty) stack.push(tag.name);
  }
  throw new Error("Invalid generated XLSX worksheet XML.");
}
