import { strFromU8, strToU8, type Zippable } from "fflate/browser";
import type { CellHyperlink, Sheet } from "@sheetcraft/core/workbook";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";

type RawHyperlinks = Array<Map<string, CellHyperlink>>;

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i").exec(attributes);
  return match?.[2]?.replace(
    /&(?:amp|apos|gt|lt|quot);/gi,
    (value) =>
      ({
        "&amp;": "&",
        "&apos;": "'",
        "&gt;": ">",
        "&lt;": "<",
        "&quot;": '"',
      })[value] ?? value,
  );
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

function sheetPartNames(entries: Record<string, Uint8Array>): string[] {
  const workbookOrder = readXlsxWorksheetPartTargets(entries);
  if (workbookOrder.length) return [...workbookOrder];
  return Object.keys(entries)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(
      (left, right) =>
        Number(/sheet(\d+)\.xml$/i.exec(left)?.[1]) - Number(/sheet(\d+)\.xml$/i.exec(right)?.[1]),
    );
}

function expandRange(reference: string): string[] | undefined {
  const match = /^([A-Z]+)([1-9]\d*)(?::([A-Z]+)([1-9]\d*))?$/i.exec(reference);
  if (!match) return undefined;
  const column = (label: string) =>
    [...label.toUpperCase()].reduce(
      (value, character) => value * 26 + character.charCodeAt(0) - 64,
      0,
    ) - 1;
  const firstColumn = column(match[1]!);
  const firstRow = Number(match[2]) - 1;
  const lastColumn = column(match[3] ?? match[1]!);
  const lastRow = Number(match[4] ?? match[2]) - 1;
  if (firstColumn < 0 || firstRow < 0 || lastColumn < 0 || lastRow < 0) return undefined;
  const area = (Math.abs(lastColumn - firstColumn) + 1) * (Math.abs(lastRow - firstRow) + 1);
  if (!Number.isSafeInteger(area) || area > 200_000) return undefined;
  const result: string[] = [];
  for (let row = Math.min(firstRow, lastRow); row <= Math.max(firstRow, lastRow); row += 1) {
    for (
      let columnIndex = Math.min(firstColumn, lastColumn);
      columnIndex <= Math.max(firstColumn, lastColumn);
      columnIndex += 1
    ) {
      let value = "";
      for (let source = columnIndex + 1; source > 0; source = Math.floor((source - 1) / 26))
        value = String.fromCharCode(65 + ((source - 1) % 26)) + value;
      result.push(`${value}${row + 1}`);
    }
  }
  return result;
}

function relationshipTargets(xml: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!xml) return result;
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
    const attrs = match[1] ?? "";
    const id = attribute(attrs, "Id");
    const target = attribute(attrs, "Target");
    const type = attribute(attrs, "Type");
    if (id && target && /\/hyperlink$/i.test(type ?? "")) result.set(id, target);
  }
  return result;
}

/** Read worksheet hyperlinks independently of ExcelJS's materialized cell value. */
export function readXlsxHyperlinks(
  entries: Record<string, Uint8Array>,
  onUnsupportedRange?: (sheetIndex: number, reference: string) => void,
): RawHyperlinks {
  return sheetPartNames(entries).map((part, sheetIndex) => {
    const worksheet = strFromU8(entries[part]!);
    const fileName = part.slice(part.lastIndexOf("/") + 1);
    const rels = relationshipTargets(
      entries[`xl/worksheets/_rels/${fileName}.rels`]
        ? strFromU8(entries[`xl/worksheets/_rels/${fileName}.rels`]!)
        : undefined,
    );
    const links = new Map<string, CellHyperlink>();
    for (const match of worksheet.matchAll(/<hyperlink\b([^>]*)\/?\s*>/gi)) {
      const attrs = match[1] ?? "";
      const ref = attribute(attrs, "ref");
      const relationshipId = attribute(attrs, "r:id");
      const location = attribute(attrs, "location");
      const target = location
        ? `#${location}`
        : relationshipId
          ? rels.get(relationshipId)
          : undefined;
      const tooltip = attribute(attrs, "tooltip");
      if (!ref || !target) continue;
      const addresses = expandRange(ref);
      if (!addresses) {
        onUnsupportedRange?.(sheetIndex, ref);
        continue;
      }
      for (const address of addresses)
        links.set(address, { target, ...(tooltip ? { tooltip } : {}) });
    }
    return links;
  });
}

/** Raw style indexes retain cellXf provenance that ExcelJS materializes away. */
export function readXlsxWorksheetStyleIds(
  entries: Record<string, Uint8Array>,
): Array<Map<string, number>> {
  return sheetPartNames(entries).map((part) => {
    const result = new Map<string, number>();
    for (const match of strFromU8(entries[part]!).matchAll(/<c\b([^>]*)>/gi)) {
      const attrs = match[1] ?? "";
      const reference = attribute(attrs, "r");
      const style = Number(attribute(attrs, "s"));
      if (reference && Number.isInteger(style) && style >= 0)
        result.set(reference.toUpperCase(), style);
    }
    return result;
  });
}

function worksheetRelationshipPart(part: string): string {
  const fileName = part.slice(part.lastIndexOf("/") + 1);
  return `xl/worksheets/_rels/${fileName}.rels`;
}

function addRelationships(
  xml: string | undefined,
  relationships: readonly { id: string; target: string }[],
): string {
  const existing =
    xml ??
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const entries = relationships
    .map(
      ({ id, target }) =>
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(target)}" TargetMode="External"/>`,
    )
    .join("");
  return existing.replace(/<\/Relationships>\s*$/i, `${entries}</Relationships>`);
}

/** Add real hyperlink relationships after ExcelJS has generated the workbook. */
export function writeXlsxHyperlinks(entries: Zippable, sheets: readonly Sheet[]): void {
  const worksheetParts = sheetPartNames(entries as Record<string, Uint8Array>);
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const part = worksheetParts[sheetIndex];
    if (!part) continue;
    const links = [...sheet.cells.entries()].flatMap(([key, cell]) => {
      if (!cell.hyperlink) return [];
      const values = key.split(":").map(Number);
      const row = values[0];
      const column = values[1];
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(column) ||
        row === undefined ||
        column === undefined
      )
        return [];
      let value = "";
      for (let source = column + 1; source > 0; source = Math.floor((source - 1) / 26))
        value = String.fromCharCode(65 + ((source - 1) % 26)) + value;
      return [{ ref: `${value}${row + 1}`, hyperlink: cell.hyperlink }];
    });
    if (!links.length) continue;
    const xml = strFromU8(entries[part] as Uint8Array);
    const external = links.filter(({ hyperlink }) => !hyperlink.target.startsWith("#"));
    const relsPart = worksheetRelationshipPart(part);
    const relsXml = entries[relsPart] ? strFromU8(entries[relsPart] as Uint8Array) : undefined;
    const usedIds = new Set(
      [...(relsXml ?? "").matchAll(/\bId="([^"]+)"/gi)].map((match) => match[1]!),
    );
    let nextId = 1;
    const relationshipFor = new Map<string, string>();
    for (const { hyperlink } of external) {
      if (relationshipFor.has(hyperlink.target)) continue;
      let id = `rId${nextId++}`;
      while (usedIds.has(id)) id = `rId${nextId++}`;
      usedIds.add(id);
      relationshipFor.set(hyperlink.target, id);
    }
    const xmlLinks = links
      .map(({ ref, hyperlink }) => {
        const tooltip = hyperlink.tooltip ? ` tooltip="${escapeXml(hyperlink.tooltip)}"` : "";
        if (hyperlink.target.startsWith("#"))
          return `<hyperlink ref="${ref}" location="${escapeXml(hyperlink.target.slice(1))}"${tooltip}/>`;
        return `<hyperlink ref="${ref}" r:id="${relationshipFor.get(hyperlink.target)}"${tooltip}/>`;
      })
      .join("");
    const withoutExisting = xml.replace(/<hyperlinks\b[^>]*>[\s\S]*?<\/hyperlinks>/i, "");
    entries[part] = strToU8(
      withoutExisting.replace(
        /<\/dataValidations>|<printOptions\b|<pageMargins\b|<pageSetup\b|<\/worksheet>/i,
        (match) =>
          /<\/dataValidations>/i.test(match)
            ? `${match}<hyperlinks>${xmlLinks}</hyperlinks>`
            : `<hyperlinks>${xmlLinks}</hyperlinks>${match}`,
      ),
    );
    if (external.length) {
      const relationEntries = [...relationshipFor].map(([target, id]) => ({
        id,
        target,
      }));
      entries[relsPart] = strToU8(addRelationships(relsXml, relationEntries));
    }
  }
}
