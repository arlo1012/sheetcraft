import { getFormulaFunctionMetadata } from "@sheetcraft/core/formula";
import {
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  getCellContent,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx } from "@sheetcraft/xlsx-io";

/** Shared runtime smoke: a Worker must evaluate and perform an actual XLSX roundtrip. */
export async function runWorkerProbe() {
  const workbook = createWorkbook({
    id: "worker-probe",
    sheetId: "worker-sheet",
    dateSystem: "1904",
  });
  const sheet = getActiveSheet(workbook);
  const address = { row: 0, column: 0 };
  setCellContent(sheet, address, { kind: "formula", formula: { source: "=SUM(1,2,3)" } });
  const encoded = await encodeXlsx(workbook);
  const decoded = await decodeXlsx(encoded.bytes);
  const restored = getActiveSheet(decoded.workbook);
  return {
    formulaSum: createWorkbookEvaluator(workbook, sheet.id).getComputedValue(address),
    formulaFunctionCount: getFormulaFunctionMetadata().length,
    xlsxBytes: encoded.bytes.byteLength,
    restoredFormula: getCellContent(restored, address),
    restoredValue: createWorkbookEvaluator(decoded.workbook, restored.id).getComputedValue(address),
    restoredDateSystem: decoded.workbook.dateSystem,
    cacheDiscarded: decoded.report.issues.some(({ code }) => code === "formula-cache-discarded"),
  };
}
