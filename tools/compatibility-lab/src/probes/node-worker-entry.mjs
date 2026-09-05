import { parentPort } from "node:worker_threads";
import { SUM } from "@formulajs/formulajs";
import ExcelJS from "exceljs";

parentPort?.postMessage({
  formulaSum: SUM(1, 2, 3),
  excelJsWorkbookConstructed: new ExcelJS.Workbook() instanceof ExcelJS.Workbook,
});
