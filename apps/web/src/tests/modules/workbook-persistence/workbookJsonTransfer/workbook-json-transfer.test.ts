import { createWorkbook, getActiveSheet, getCellValue, setCellValue } from "@idea10/core/workbook";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  WorkbookFileError,
  downloadWorkbookJson,
  parseWorkbookJson,
  readWorkbookFile,
} from "../../../../modules/workbook-persistence/workbookJsonTransfer";
import { serializeWorkbook } from "@idea10/core/serialization";

function createTestWorkbook() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet", sheetName: "Budget" });
  setCellValue(getActiveSheet(workbook), { row: 0, column: 0 }, "January");
  return workbook;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workbook JSON transfer", () => {
  test("parses a version 2 workbook snapshot through Core", () => {
    const workbook = createTestWorkbook();

    const parsed = parseWorkbookJson(JSON.stringify(serializeWorkbook(workbook)));

    expect(parsed.id).toBe("workbook");
    expect(getActiveSheet(parsed).name).toBe("Budget");
    expect(getCellValue(getActiveSheet(parsed), { row: 0, column: 0 })).toBe("January");
  });

  test("accepts Core's version 1 workbook snapshot migration", () => {
    const parsed = parseWorkbookJson(
      JSON.stringify({
        version: 1,
        id: "legacy-workbook",
        activeSheetId: "legacy-sheet",
        sheets: [
          {
            id: "legacy-sheet",
            name: "Legacy",
            cells: [{ address: { row: 0, column: 0 }, value: "Imported" }],
            rowHeights: [],
            columnWidths: [],
          },
        ],
      }),
    );

    expect(parsed.id).toBe("legacy-workbook");
    expect(getCellValue(getActiveSheet(parsed), { row: 0, column: 0 })).toBe("Imported");
  });

  test("classifies malformed JSON, invalid snapshots, and file-read failures", async () => {
    expect(() => parseWorkbookJson("{")).toThrow(
      expect.objectContaining({ code: "invalid-json" }) as WorkbookFileError,
    );
    expect(() => parseWorkbookJson(JSON.stringify({ version: 2 }))).toThrow(
      expect.objectContaining({ code: "invalid-snapshot" }) as WorkbookFileError,
    );
    await expect(
      readWorkbookFile({ text: async () => Promise.reject(new Error("denied")) }),
    ).rejects.toMatchObject({
      code: "read-failed",
    });
  });

  test("reads a file without touching persistence", async () => {
    const workbook = createTestWorkbook();
    vi.stubGlobal("indexedDB", undefined);

    const parsed = await readWorkbookFile({
      text: async () => JSON.stringify(serializeWorkbook(workbook)),
    });

    expect(parsed.id).toBe(workbook.id);
  });

  test("downloads a fixed JSON filename and revokes its object URL", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:idea10-workbook");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    downloadWorkbookJson(createTestWorkbook());

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.instances[0] as HTMLAnchorElement | undefined)?.download).toBe(
      "idea10-workbook.json",
    );
    expect(document.querySelector('a[download="idea10-workbook.json"]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:idea10-workbook");
  });
});
