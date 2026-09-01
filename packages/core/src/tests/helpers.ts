import { createWorkbookSession, type WorkbookSession } from "../history.js";
import { createSequentialIdFactory } from "../runtime.js";
import { createSheet, createWorkbook, type Sheet, type Workbook } from "../workbook.js";

export function createTestWorkbookSession(): WorkbookSession {
  return createWorkbookSession({ idFactory: createSequentialIdFactory() });
}

export function createTestWorkbook(): Workbook {
  return createWorkbook({ idFactory: createSequentialIdFactory() });
}

export function createTestSheet(): Sheet {
  return createSheet("Sheet1", undefined, createSequentialIdFactory());
}
