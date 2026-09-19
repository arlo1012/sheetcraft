import { describe, expect, test } from "vitest";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  moveSheet,
  removeSheet,
  type Sheet,
  type Workbook,
} from "../../workbook.js";
import { createSequentialIdFactory } from "../../runtime.js";

class ObservableSheetMap extends Map<string, Sheet> {
  enabled = false;
  onMutation: (() => void) | undefined;

  override set(key: string, value: Sheet): this {
    const result = super.set(key, value);
    if (this.enabled) this.onMutation?.();
    return result;
  }

  override delete(key: string): boolean {
    const result = super.delete(key);
    if (this.enabled) this.onMutation?.();
    return result;
  }

  override clear(): void {
    super.clear();
    if (this.enabled) this.onMutation?.();
  }
}

function observeActiveSheet(workbook: Workbook): Workbook {
  const sheets = new ObservableSheetMap(workbook.sheets);
  workbook.sheets = sheets;
  sheets.onMutation = () => expect(getActiveSheet(workbook)).toBeDefined();
  sheets.enabled = true;
  return new Proxy(workbook, {
    set(target, property, value, receiver) {
      const result = Reflect.set(target, property, value, receiver);
      if (property === "sheets" || property === "activeSheetId")
        expect(getActiveSheet(target)).toBeDefined();
      return result;
    },
  });
}

describe("sheet collection publication", () => {
  test("fails when a map mutation exposes no active sheet", () => {
    const workbook = observeActiveSheet(createWorkbook({ idFactory: createSequentialIdFactory() }));
    expect(() => workbook.sheets.clear()).toThrow(/Active sheet/);
  });

  test("keeps the active sheet observable through insert, move, and remove", () => {
    const ids = createSequentialIdFactory();
    const workbook = observeActiveSheet(createWorkbook({ idFactory: ids }));
    const second = createSheet("Second", "second");
    insertSheet(workbook, second, 1);
    moveSheet(workbook, second.id, 0);
    workbook.activeSheetId = second.id;
    removeSheet(workbook, second.id);
    expect(getActiveSheet(workbook).id).not.toBe(second.id);
  });
});
