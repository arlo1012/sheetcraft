import { ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheetEvaluator,
  getActiveSheet,
  setCellValue,
} from "@idea10/core/workbook";
import { createWorkbookSession } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  DUPLICATE_ERROR_CHECKS_STORAGE_KEY,
  readDuplicateErrorChecks,
  writeDuplicateErrorChecks,
} from "../../../../modules/data-tools/duplicate-error-preferences";
import { useDuplicateErrorChecks } from "../../../../modules/data-tools/useDuplicateErrorChecks";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function fixture(storage = memoryStorage(), workbookId = "workbook-a") {
  const session = createWorkbookSession({
    idFactory: createSequentialIdFactory(),
  });
  session.workbook.id = workbookId;
  const sheet = getActiveSheet(session.workbook);
  setCellValue(sheet, { row: 0, column: 0 }, "same");
  setCellValue(sheet, { row: 1, column: 0 }, "same");
  sheet.duplicateRules = [
    {
      id: "reject-a",
      kind: "reject",
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
    },
  ];
  const revision = ref(0);
  const checks = useDuplicateErrorChecks({
    getWorkbook: () => session.workbook,
    getSheet: () => sheet,
    getEvaluator: () => createSheetEvaluator(sheet),
    getRevision: () => revision.value,
    storage,
  });
  return { session, sheet, revision, checks, storage };
}

describe("duplicate error checks", () => {
  test("ignores one current warning and restores that exact exception from storage", () => {
    const f = fixture();
    expect([...f.checks.errorCells.value]).toEqual(["0:0", "1:0"]);
    f.checks.ignoreCell({ row: 0, column: 0 });
    expect([...f.checks.errorCells.value]).toEqual(["1:0"]);
    expect(f.checks.ignoredCount.value).toBe(1);

    const restored = useDuplicateErrorChecks({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getEvaluator: () => createSheetEvaluator(f.sheet),
      getRevision: () => f.revision.value,
      storage: f.storage,
    });
    expect([...restored.errorCells.value]).toEqual(["1:0"]);
  });

  test("can ignore and reset all existing warnings without storing blank or unique cells", () => {
    const f = fixture();
    f.checks.ignoreAll();
    expect(f.checks.errorCells.value).toEqual(new Set());
    expect(f.checks.ignoredCount.value).toBe(2);
    f.checks.ignoreCell({ row: 4, column: 4 });
    expect(readDuplicateErrorChecks(f.storage).ignored).toHaveLength(2);
    f.checks.resetIgnored();
    expect([...f.checks.errorCells.value]).toEqual(["0:0", "1:0"]);
    expect(f.checks.ignoredCount.value).toBe(0);
  });

  test("ignores every duplicate warning in a rectangular selection, while retaining warnings outside it", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 2, column: 0 }, "same");
    f.sheet.duplicateRules![0]!.range.end.row = 2;
    setCellValue(f.sheet, { row: 0, column: 1 }, "other");
    setCellValue(f.sheet, { row: 1, column: 1 }, "other");
    setCellValue(f.sheet, { row: 2, column: 1 }, "other");
    setCellValue(f.sheet, { row: 0, column: 2 }, "unique");
    f.sheet.duplicateRules!.push({
      id: "reject-b",
      kind: "reject",
      range: { start: { row: 0, column: 1 }, end: { row: 2, column: 1 } },
    });
    const save = vi.spyOn(f.storage, "setItem");

    f.checks.ignoreRange({
      start: { row: 0, column: 0 },
      end: { row: 1, column: 3 },
    });

    expect([...f.checks.errorCells.value]).toEqual(["2:0", "2:1"]);
    expect(
      new Set(readDuplicateErrorChecks(f.storage).ignored.map((item) => item.cellKey)),
    ).toEqual(new Set(["0:0", "1:0", "0:1", "1:1"]));
    expect(save).toHaveBeenCalledTimes(1);

    // A reversed repeat neither records blank/unique cells nor duplicates or re-saves exceptions.
    f.checks.ignoreRange({
      start: { row: 1, column: 3 },
      end: { row: 0, column: 0 },
    });
    expect(readDuplicateErrorChecks(f.storage).ignored).toHaveLength(4);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("accepts the normalized full-row and full-column selection bounds", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 1 }, "other");
    setCellValue(f.sheet, { row: 1, column: 1 }, "other");
    f.sheet.duplicateRules!.push({
      id: "reject-b",
      kind: "reject",
      range: { start: { row: 0, column: 1 }, end: { row: 1, column: 1 } },
    });

    f.checks.ignoreRange({
      start: { row: 0, column: 0 },
      end: { row: 0, column: MAX_SHEET_COLUMNS - 1 },
    });
    expect([...f.checks.errorCells.value]).toEqual(["1:0", "1:1"]);

    f.checks.ignoreRange({
      start: { row: 0, column: 0 },
      end: { row: MAX_SHEET_ROWS - 1, column: 0 },
    });
    expect([...f.checks.errorCells.value]).toEqual(["1:1"]);
  });

  test("discards an ignored exception after the value changes, so a later return is warned", () => {
    const f = fixture();
    f.checks.ignoreAll();
    setCellValue(f.sheet, { row: 0, column: 0 }, "changed");
    f.revision.value += 1;
    expect(f.checks.errorCells.value).toEqual(new Set());
    expect(readDuplicateErrorChecks(f.storage).ignored).toEqual([]);
    setCellValue(f.sheet, { row: 0, column: 0 }, "same");
    f.revision.value += 1;
    expect([...f.checks.errorCells.value]).toEqual(["0:0", "1:0"]);
  });

  test("discards an ignored exception after a relevant rule changes", () => {
    const f = fixture();
    f.checks.ignoreCell({ row: 0, column: 0 });
    f.sheet.duplicateRules![0]!.range.end.row = 0;
    f.revision.value += 1;
    expect(f.checks.errorCells.value).toEqual(new Set());
    expect(readDuplicateErrorChecks(f.storage).ignored).toEqual([]);
    f.sheet.duplicateRules![0]!.range.end.row = 1;
    f.revision.value += 1;
    expect([...f.checks.errorCells.value]).toEqual(["0:0", "1:0"]);
  });

  test("keeps browser-enabled state global while isolating ignored entries by workbook and sheet", () => {
    const storage = memoryStorage();
    const left = fixture(storage, "workbook-a");
    left.checks.ignoreAll();
    left.checks.setEnabled(false);
    const right = fixture(storage, "workbook-b");
    expect(right.checks.enabled.value).toBe(false);
    right.checks.setEnabled(true);
    expect([...right.checks.errorCells.value]).toEqual(["0:0", "1:0"]);
  });

  test("uses the duplicate-entry setting independently from the overall error-check switch", () => {
    const f = fixture();
    f.checks.applySettings({
      ...f.checks.settings.value,
      duplicateEntries: false,
    });
    expect(f.checks.enabled.value).toBe(true);
    expect(f.checks.errorCells.value).toEqual(new Set());
    f.checks.applySettings({
      ...f.checks.settings.value,
      duplicateEntries: true,
    });
    expect([...f.checks.errorCells.value]).toEqual(["0:0", "1:0"]);
    f.checks.setEnabled(false);
    expect(f.checks.errorCells.value).toEqual(new Set());
  });

  test("finds literal numeric text without flagging numbers, formulas, booleans, or ordinary text", () => {
    const f = fixture();
    f.sheet.duplicateRules = [];
    setCellValue(f.sheet, { row: 0, column: 0 }, "11111111111111111111");
    setCellValue(f.sheet, { row: 0, column: 1 }, "0012");
    setCellValue(f.sheet, { row: 0, column: 2 }, "12.5");
    setCellValue(f.sheet, { row: 1, column: 0 }, 12);
    setCellValue(f.sheet, { row: 1, column: 1 }, true);
    setCellValue(f.sheet, { row: 1, column: 2 }, "not a number");
    f.sheet.cells.set("1:3", {
      content: { kind: "formula", formula: { source: "=12" } },
    });

    expect(f.checks.errorKinds.value).toEqual(
      new Map([
        ["0:0", "number-stored-as-text"],
        ["0:1", "number-stored-as-text"],
        ["0:2", "number-stored-as-text"],
      ]),
    );
  });

  test("prioritizes duplicate issues and clears a numeric-text ignore when a new enabled issue appears", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 0 }, "0012");
    setCellValue(f.sheet, { row: 1, column: 0 }, "0012");
    f.checks.applySettings({
      ...f.checks.settings.value,
      duplicateEntries: false,
    });
    expect(f.checks.errorKinds.value).toEqual(
      new Map([
        ["0:0", "number-stored-as-text"],
        ["1:0", "number-stored-as-text"],
      ]),
    );
    f.checks.ignoreAll("number-stored-as-text");
    expect(f.checks.errorCells.value).toEqual(new Set());

    f.checks.applySettings({
      ...f.checks.settings.value,
      duplicateEntries: true,
    });
    expect(f.checks.errorKinds.value).toEqual(
      new Map([
        ["0:0", "duplicate"],
        ["1:0", "duplicate"],
      ]),
    );
    expect(readDuplicateErrorChecks(f.storage).ignored).toEqual([]);
  });

  test("ignores numeric-text warnings independently and can disable only that check", () => {
    const f = fixture();
    setCellValue(f.sheet, { row: 0, column: 1 }, "0012");
    expect(f.checks.errorKinds.value).toEqual(
      new Map([
        ["0:0", "duplicate"],
        ["1:0", "duplicate"],
        ["0:1", "number-stored-as-text"],
      ]),
    );

    f.checks.ignoreAll("number-stored-as-text");
    expect(f.checks.errorKinds.value).toEqual(
      new Map([
        ["0:0", "duplicate"],
        ["1:0", "duplicate"],
      ]),
    );

    f.checks.resetIgnored();
    f.checks.applySettings({
      ...f.checks.settings.value,
      numberStoredAsText: false,
    });
    expect(f.checks.errorKinds.value).toEqual(
      new Map([
        ["0:0", "duplicate"],
        ["1:0", "duplicate"],
      ]),
    );
  });

  test("keeps an existing duplicate-only ignore when version-two preferences are reloaded", () => {
    const f = fixture();
    f.checks.ignoreCell({ row: 0, column: 0 });
    const ignored = readDuplicateErrorChecks(f.storage).ignored;
    const persisted = JSON.parse(f.storage.getItem(DUPLICATE_ERROR_CHECKS_STORAGE_KEY)!) as {
      preferences: Record<string, unknown>;
    };
    const legacyPreferences = Object.fromEntries(
      Object.entries(persisted.preferences).filter(([key]) => key !== "numberStoredAsText"),
    );
    f.storage.setItem(
      DUPLICATE_ERROR_CHECKS_STORAGE_KEY,
      JSON.stringify({ version: 2, preferences: legacyPreferences }),
    );

    const restored = useDuplicateErrorChecks({
      getWorkbook: () => f.session.workbook,
      getSheet: () => f.sheet,
      getEvaluator: () => createSheetEvaluator(f.sheet),
      getRevision: () => f.revision.value,
      storage: f.storage,
    });
    expect(restored.errorCells.value).toEqual(new Set(["1:0"]));
    expect(readDuplicateErrorChecks(f.storage).ignored).toEqual(ignored);
  });

  test("persists a normalized indicator color and migrates version-one and version-two preferences", () => {
    const storage = memoryStorage();
    storage.setItem(
      DUPLICATE_ERROR_CHECKS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        preferences: {
          enabled: false,
          ignored: [
            {
              workbookId: "workbook-a",
              sheetId: "sheet-a",
              cellKey: "0:0",
              signature: "old-issue",
            },
          ],
        },
      }),
    );
    expect(readDuplicateErrorChecks(storage)).toEqual({
      enabled: false,
      indicatorColor: null,
      duplicateEntries: true,
      numberStoredAsText: true,
      ignored: [
        {
          workbookId: "workbook-a",
          sheetId: "sheet-a",
          cellKey: "0:0",
          signature: "old-issue",
        },
      ],
    });

    storage.setItem(
      DUPLICATE_ERROR_CHECKS_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        preferences: {
          enabled: true,
          indicatorColor: "#abcdef",
          duplicateEntries: false,
          ignored: [],
        },
      }),
    );
    expect(readDuplicateErrorChecks(storage)).toEqual({
      enabled: true,
      indicatorColor: "#abcdef",
      duplicateEntries: false,
      numberStoredAsText: true,
      ignored: [],
    });

    const f = fixture(storage, "workbook-b");
    expect(
      f.checks.applySettings({
        ...f.checks.settings.value,
        indicatorColor: "#ABCDEF",
      }),
    ).toBe(true);
    expect(readDuplicateErrorChecks(storage).indicatorColor).toBe("#abcdef");
    expect(f.checks.settings.value.indicatorColor).toBe("#abcdef");
    expect(
      f.checks.applySettings({
        ...f.checks.settings.value,
        indicatorColor: "not-a-color",
      }),
    ).toBe(false);
  });

  test("applies settings atomically and can reset only the current sheet's ignored issues", () => {
    const storage = memoryStorage();
    writeDuplicateErrorChecks(
      {
        enabled: true,
        indicatorColor: null,
        duplicateEntries: true,
        numberStoredAsText: true,
        ignored: [
          {
            workbookId: "workbook-b",
            sheetId: "sheet-b",
            cellKey: "0:0",
            signature: "foreign-issue",
          },
        ],
      },
      storage,
    );
    const left = fixture(storage, "workbook-a");
    left.checks.ignoreAll();
    expect(
      left.checks.applySettings(
        {
          enabled: false,
          indicatorColor: "#ff0000",
          duplicateEntries: false,
          numberStoredAsText: false,
        },
        true,
      ),
    ).toBe(true);
    expect(left.checks.settings.value).toEqual({
      enabled: false,
      indicatorColor: "#ff0000",
      duplicateEntries: false,
      numberStoredAsText: false,
    });
    const stored = readDuplicateErrorChecks(storage);
    expect(stored.ignored).toHaveLength(1);
    expect(stored.ignored.every((issue) => issue.workbookId === "workbook-b")).toBe(true);
  });

  test("keeps checking while disabled, so stale exceptions do not return when re-enabled", () => {
    const f = fixture();
    f.checks.ignoreAll();
    f.checks.setEnabled(false);
    expect(f.checks.errorCells.value).toEqual(new Set());
    setCellValue(f.sheet, { row: 0, column: 0 }, "changed");
    f.revision.value += 1;
    expect(f.checks.errorCells.value).toEqual(new Set());
    expect(readDuplicateErrorChecks(f.storage).ignored).toEqual([]);
    setCellValue(f.sheet, { row: 0, column: 0 }, "same");
    f.revision.value += 1;
    f.checks.setEnabled(true);
    expect([...f.checks.errorCells.value]).toEqual(["0:0", "1:0"]);
  });

  test("uses defaults for malformed or unavailable storage and never throws on writes", () => {
    const storage = memoryStorage();
    storage.setItem(DUPLICATE_ERROR_CHECKS_STORAGE_KEY, "not json");
    expect(readDuplicateErrorChecks(storage)).toEqual({
      enabled: true,
      indicatorColor: null,
      duplicateEntries: true,
      numberStoredAsText: true,
      ignored: [],
    });
    const unavailable: Storage = {
      get length() {
        return 0;
      },
      clear: () => {},
      getItem: () => {
        throw new Error("unavailable");
      },
      key: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error("unavailable");
      },
    };
    expect(readDuplicateErrorChecks(unavailable)).toEqual({
      enabled: true,
      indicatorColor: null,
      duplicateEntries: true,
      numberStoredAsText: true,
      ignored: [],
    });
    expect(
      writeDuplicateErrorChecks(
        {
          enabled: false,
          indicatorColor: null,
          duplicateEntries: true,
          numberStoredAsText: true,
          ignored: [],
        },
        unavailable,
      ),
    ).toBe(false);
  });
});
