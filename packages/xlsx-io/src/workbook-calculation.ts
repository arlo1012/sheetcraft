import { strFromU8, strToU8, unzipSync, type Unzipped } from "fflate/browser";
import {
  DEFAULT_WORKBOOK_CALCULATION_SETTINGS,
  normalizeWorkbookCalculationSettings,
  type WorkbookCalculationSettings,
} from "@idea10/core/workbook";

function readAttribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(attributes)?.[2];
}

function isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

/** Reads Excel's workbook-wide calculation policy without relying on ExcelJS's partial model. */
export function readWorkbookCalculationSettings(bytes: Uint8Array): WorkbookCalculationSettings {
  const workbook = unzipSync(bytes)["xl/workbook.xml"];
  if (!workbook) return { ...DEFAULT_WORKBOOK_CALCULATION_SETTINGS };
  const attributes = /<(?:\w+:)?calcPr\b([^>]*?)(?:\/>|>)/i.exec(strFromU8(workbook))?.[1];
  if (attributes === undefined) return { ...DEFAULT_WORKBOOK_CALCULATION_SETTINGS };
  const maxIterations = Number(readAttribute(attributes, "iterateCount"));
  const maxChange = Number(readAttribute(attributes, "iterateDelta"));
  try {
    return normalizeWorkbookCalculationSettings({
      mode:
        readAttribute(attributes, "calcMode")?.toLowerCase() === "manual" ? "manual" : "automatic",
      iterative: isEnabled(readAttribute(attributes, "iterate")),
      maxIterations: Number.isSafeInteger(maxIterations)
        ? maxIterations
        : DEFAULT_WORKBOOK_CALCULATION_SETTINGS.maxIterations,
      maxChange:
        Number.isFinite(maxChange) && maxChange > 0
          ? maxChange
          : DEFAULT_WORKBOOK_CALCULATION_SETTINGS.maxChange,
    });
  } catch {
    return { ...DEFAULT_WORKBOOK_CALCULATION_SETTINGS };
  }
}

/** Replaces ExcelJS's generated calcPr so the persisted Core policy survives export. */
export function writeWorkbookCalculationSettings(
  entries: Unzipped,
  calculation: WorkbookCalculationSettings,
): void {
  const workbook = entries["xl/workbook.xml"];
  if (!workbook) throw new Error("Missing generated XLSX workbook.");
  const settings = normalizeWorkbookCalculationSettings(calculation);
  const calcPr = `<calcPr calcMode="${settings.mode === "manual" ? "manual" : "auto"}" fullCalcOnLoad="1" iterate="${settings.iterative ? "1" : "0"}" iterateCount="${settings.maxIterations}" iterateDelta="${settings.maxChange}"/>`;
  const xml = strFromU8(workbook);
  const withoutExisting = xml.replace(
    /<(?:\w+:)?calcPr\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?calcPr\s*>)/i,
    "",
  );
  if (!/<\/(?:\w+:)?workbook\s*>/i.test(withoutExisting))
    throw new Error("Unexpected generated XLSX workbook.");
  entries["xl/workbook.xml"] = strToU8(
    withoutExisting.replace(/<\/(?:\w+:)?workbook\s*>/i, `${calcPr}</workbook>`),
  );
}
