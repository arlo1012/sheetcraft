import {
  deserializeWorkbook,
  serializeWorkbook,
  type WorkbookSnapshot,
} from "@sheetcraft/core/serialization";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { XlsxWorkerImage } from "../workbook-xlsx/xlsxWorkerProtocol";
import { dashboardPng } from "./dashboard-snapshot";

/** The worker receives a detached Excel-compatible workbook. Sheetcraft retains the live dashboard. */
export async function prepareDashboardXlsx(
  snapshot: WorkbookSnapshot,
  labels: Parameters<typeof dashboardPng>[2],
  signal: AbortSignal,
) {
  const workbook = deserializeWorkbook(snapshot);
  const images: XlsxWorkerImage[] = [];
  const makeId = createBrowserIdFactory();
  for (const sheet of workbook.sheets.values()) {
    if (!sheet.dashboard) continue;
    if (sheet.dashboard.snapshot) {
      signal.throwIfAborted();
      const { blob, width, height } = await dashboardPng(workbook, sheet, labels);
      signal.throwIfAborted();
      const id = makeId("dashboard-snapshot");
      images.push({
        assetId: id,
        extension: "png",
        width,
        height,
        bytes: await blob.arrayBuffer(),
      });
      sheet.floatingImages.push({
        id,
        assetId: id,
        altText: sheet.dashboard.title || sheet.name,
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width,
        height,
      });
    }
    delete sheet.dashboard;
  }
  return { snapshot: serializeWorkbook(workbook), images };
}
