import {
  cloneCellStyleDefinition as cloneDefinition,
  type CellStyleDefinition,
} from "@idea10/core/cell-styles";
import type { Workbook } from "@idea10/core/workbook";
import { readWorkbookFile } from "../workbook-persistence/workbookJsonTransfer";

export function cloneCellStyleDefinition(style: CellStyleDefinition): CellStyleDefinition {
  return cloneDefinition(style);
}

export function mergeCellStyleDefinitions(
  existing: readonly CellStyleDefinition[],
  incoming: readonly CellStyleDefinition[],
  replaceExisting: boolean,
  createId: () => string,
): CellStyleDefinition[] {
  const next = existing.map(cloneCellStyleDefinition);
  const byName = new Map(
    next.map((style, index) => [style.name.trim().toLocaleLowerCase(), index]),
  );
  const usedIds = new Set(next.map((style) => style.id));

  for (const source of incoming) {
    const style = cloneCellStyleDefinition(source);
    const name = style.name.trim().toLocaleLowerCase();
    const currentIndex = byName.get(name);
    if (currentIndex !== undefined) {
      if (replaceExisting) {
        const current = next[currentIndex]!;
        next[currentIndex] = { ...style, id: current.id };
      }
      continue;
    }

    if (usedIds.has(style.id)) {
      let id = createId();
      while (usedIds.has(id)) id = createId();
      style.id = id;
    }
    usedIds.add(style.id);
    byName.set(name, next.length);
    next.push(style);
  }
  return next;
}

function isXlsx(file: Pick<File, "name" | "type">): boolean {
  return (
    file.name.toLocaleLowerCase().endsWith(".xlsx") ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

export async function readCellStylesFile(
  file: Pick<File, "name" | "type" | "text" | "arrayBuffer">,
): Promise<CellStyleDefinition[]> {
  const workbook = isXlsx(file) ? await readXlsxCellStyles(file) : await readWorkbookFile(file);
  return (workbook.cellStyles ?? []).map(cloneCellStyleDefinition);
}

async function readXlsxCellStyles(file: Pick<File, "arrayBuffer">): Promise<Workbook> {
  // This import remains asynchronous so the XLSX codec stays outside normal cell-style UI loading.
  const codec = await import("@idea10/xlsx-io");
  const result = await codec.decodeXlsx(new Uint8Array(await file.arrayBuffer()));
  return result.workbook;
}
