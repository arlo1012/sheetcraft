import { describe, expect, test } from "vitest";
import { WorkbookDomainError } from "../../../errors.js";
import { createMarkDataComparisonCommand, compareData } from "../../../commands/index.js";
import { getActiveSheet, setCellContent } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

function fieldOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof WorkbookDomainError ? String(error.data.details?.field) : undefined;
  }
  return undefined;
}

describe("data comparison validation", () => {
  test("reports explicit size, columns, and empty fields", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const source = {
      sheetId: sheet.id,
      range: { start: { row: 0, column: 0 }, end: { row: 100_000, column: 0 } },
    };
    expect(
      fieldOf(() =>
        compareData(session.workbook, {
          source,
          mode: "cells",
          hasHeader: false,
          match: "unique",
          side: "first",
        }),
      ),
    ).toBe("size");
    expect(
      fieldOf(() =>
        compareData(session.workbook, {
          source: {
            sheetId: sheet.id,
            range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          },
          mode: "rows",
          columns: [],
          hasHeader: false,
          match: "unique",
          side: "first",
        }),
      ),
    ).toBe("columns");
    expect(
      fieldOf(() =>
        createMarkDataComparisonCommand(
          session.workbook,
          {
            source: {
              sheetId: sheet.id,
              range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
            },
            mode: "cells",
            hasHeader: false,
            match: "unique",
            side: "first",
          },
          "#FDE68A",
        ),
      ),
    ).toBe("empty");
  });

  test("rejects merged, spill, and protected targets before changing sheets or history", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = { ...first, id: "second", name: "Second", cells: new Map() };
    session.workbook.sheets.set(second.id, second);
    for (const sheet of [first, second])
      setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "same" });
    first.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }];
    const options = {
      source: {
        sheetId: first.id,
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      },
      comparison: {
        sheetId: second.id,
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      },
      mode: "cells" as const,
      hasHeader: false,
      match: "duplicate" as const,
      side: "both" as const,
    };
    expect(
      fieldOf(() => createMarkDataComparisonCommand(session.workbook, options, "#FDE68A")),
    ).toBe("merged");
    expect(first.cells.get("0:0")?.style).toBeUndefined();
    first.mergedCells = [];
    second.properties.protected = true;
    expect(
      fieldOf(() => createMarkDataComparisonCommand(session.workbook, options, "#FDE68A")),
    ).toBe("protected");
  });

  test("rejects a dynamic-array spill target without changing its formula source", () => {
    const session = createTestWorkbookSession();
    const first = getActiveSheet(session.workbook);
    const second = { ...first, id: "second", name: "Second", cells: new Map() };
    session.workbook.sheets.set(second.id, second);
    setCellContent(
      first,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SEQUENCE(2)" } },
    );
    setCellContent(second, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    const options = {
      source: {
        sheetId: first.id,
        range: { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } },
      },
      comparison: {
        sheetId: second.id,
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      },
      mode: "cells" as const,
      hasHeader: false,
      match: "duplicate" as const,
      side: "first" as const,
    };
    expect(
      fieldOf(() => createMarkDataComparisonCommand(session.workbook, options, "#FDE68A")),
    ).toBe("spill");
    expect(first.cells.get("0:0")?.content?.kind).toBe("formula");
  });
});
