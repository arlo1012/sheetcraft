import { readXlsxWorksheetPartTargets } from "./raw-cell-values.js";
import {
  attr,
  child,
  nodes,
  parseXml,
  relationshipPath,
  relationships,
  type XmlNode,
} from "./pivot-xml.js";

/** Recognize native pivot parts by internal package relationships, not directory names. */
export async function collectSupportedPivotParts(
  entries: Record<string, Uint8Array>,
  readPart: (part: string) => Promise<Uint8Array | undefined>,
): Promise<ReadonlySet<string>> {
  const supported = new Set<string>();
  const definitions = new Map<string, XmlNode | undefined>();
  const visitedCaches = new Set<string>();
  const definition = async (part: string, tag: string): Promise<XmlNode | undefined> => {
    if (definitions.has(part)) return definitions.get(part);
    const bytes = await readPart(part);
    const root = bytes ? child(parseXml(bytes), tag) : undefined;
    const valid = root && Object.keys(root).length ? root : undefined;
    definitions.set(part, valid);
    if (valid) {
      entries[part] = bytes!;
      supported.add(part.toLowerCase());
      const relsPart = relationshipPath(part);
      if (entries[relsPart]) {
        // Parse and resolve before admitting this relationship part as supported.
        relationships(entries, part);
        supported.add(relsPart.toLowerCase());
      }
    }
    return valid;
  };
  const cache = async (part: string) => {
    if (visitedCaches.has(part)) return;
    visitedCaches.add(part);
    const root = await definition(part, "pivotCacheDefinition");
    if (!root) return;
    const relation = relationships(entries, part).get(attr(root, "id"));
    if (relation?.type.endsWith("/pivotCacheRecords"))
      await definition(relation.target, "pivotCacheRecords");
  };
  const workbookBytes = entries["xl/workbook.xml"];
  if (!workbookBytes) return supported;
  const workbook = child(parseXml(workbookBytes), "workbook");
  const workbookRels = relationships(entries, "xl/workbook.xml");
  for (const entry of nodes(child(workbook, "pivotCaches").pivotCache)) {
    const relation = workbookRels.get(attr(entry, "id"));
    if (relation?.type.endsWith("/pivotCacheDefinition")) await cache(relation.target);
  }
  for (const worksheetPart of new Set(readXlsxWorksheetPartTargets(entries))) {
    for (const relation of relationships(entries, worksheetPart).values()) {
      if (!relation.type.endsWith("/pivotTable")) continue;
      const root = await definition(relation.target, "pivotTableDefinition");
      if (!root) continue;
      for (const cacheRelation of relationships(entries, relation.target).values())
        if (cacheRelation.type.endsWith("/pivotCacheDefinition")) await cache(cacheRelation.target);
    }
  }
  return supported;
}
