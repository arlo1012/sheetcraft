import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook, type WorkbookSnapshot } from "@idea10/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setCellValue,
} from "@idea10/core/workbook";
import SpreadsheetWorkspace from "../../../../app/SpreadsheetWorkspace.vue";
import type { WorkbookStore } from "../../../../modules/workbook-persistence/workbookStore";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

export function registerFormulaToolsCleanup(): void {
  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount();
    document.body.innerHTML = "";
  });
}

export function createFormulaToolsSnapshot(): WorkbookSnapshot {
  const workbook = createWorkbook({
    idFactory: createSequentialIdFactory(),
    sheetName: "Summary",
  });
  const summary = getActiveSheet(workbook);
  setCellValue(summary, { row: 0, column: 1 }, 2);
  setCellValue(summary, { row: 0, column: 2 }, 3);
  const details = createSheet("Details", "details");
  setCellValue(details, { row: 0, column: 0 }, 11);
  insertSheet(workbook, details);
  return serializeWorkbook(workbook);
}

export function createFormulaToolsStore(snapshot = createFormulaToolsSnapshot()) {
  let record = { revision: 1, savedAt: 1, snapshot };
  const store = {
    load: vi.fn(async () => record),
    save: vi.fn(async (next: WorkbookSnapshot, revision: number | undefined) => {
      record = { revision: (revision ?? 0) + 1, savedAt: 2, snapshot: next };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
    replace: vi.fn(async (next: WorkbookSnapshot) => {
      record = { revision: record.revision + 1, savedAt: 2, snapshot: next };
      return { revision: record.revision, savedAt: record.savedAt };
    }),
  } satisfies WorkbookStore;
  return { store, record: () => record };
}

export async function mountFormulaToolsWorkspace(store: WorkbookStore) {
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: { workbookStore: store },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}
