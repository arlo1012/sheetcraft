import { attr, child, nodes, parseXml, relationships, type XmlNode } from "./pivot-xml.js";
import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";

function hasRunStyle(node: XmlNode): boolean {
  return nodes(node.r).some((run) =>
    nodes(run.rPr).some((style) =>
      Object.keys(style).some((key) => !key.startsWith("@_xmlns") && key !== "#text"),
    ),
  );
}

/** The text reader retains characters but currently flattens run-level typography. */
export function readXlsxTextRunStyleLosses(
  entries: Record<string, Uint8Array>,
): readonly ReadonlySet<string>[] {
  const relation = [...relationships(entries, "xl/workbook.xml").values()].find((entry) =>
    entry.type.endsWith("/sharedStrings"),
  );
  const shared =
    relation && entries[relation.target]
      ? nodes(child(parseXml(entries[relation.target]), "sst").si).map(hasRunStyle)
      : [];
  return readXlsxWorksheetPartTargets(entries).map((part) => {
    const result = new Set<string>();
    const worksheet = child(parseXml(entries[part]), "worksheet");
    for (const row of nodes(child(worksheet, "sheetData").row))
      for (const cell of nodes(row.c)) {
        const type = attr(cell, "t");
        if (
          (type === "inlineStr" && hasRunStyle(child(cell, "is"))) ||
          (type === "s" &&
            typeof cell.v === "string" &&
            /^\d+$/.test(cell.v) &&
            shared[Number(cell.v)])
        )
          result.add(attr(cell, "r").toUpperCase());
      }
    return result;
  });
}
