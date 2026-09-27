import { defineComponent, reactive } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createSetCellContentCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getActiveSheet } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useDataProofreadingController } from "../../../../modules/data-tools/useDataProofreadingController";

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  const selection = {
    address: { row: 0, column: 0 },
    range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
  };
  const navigateCalls: Array<{ sheetId: string; address: { row: number; column: number } }> = [];
  let controller!: ReturnType<typeof useDataProofreadingController>;
  mount(
    defineComponent({
      setup: () => {
        controller = useDataProofreadingController({
          getWorkbook: () => session.workbook,
          getSelection: () => selection,
          getGeneration: () => 0,
          getRevision: () => session.history.revision,
          isBusy: () => false,
          execute: (command) => executeWorkbookCommand(session, command),
          flush: () => true,
          focusSheet: () => undefined,
          navigateToCell: (sheetId, address) => navigateCalls.push({ sheetId, address }),
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  const set = (row: number, column: number, value: string) =>
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row, column }, { kind: "literal", value }),
    );
  return { session, sheet, controller, navigateCalls, set };
}

describe("useDataProofreadingController", () => {
  test("scans the current data region, navigates advisory results, and applies only explicit safe proposals", () => {
    const f = fixture();
    f.set(0, 0, "42");
    f.set(1, 0, "0012");

    f.controller.openDataProofreading();
    f.controller.scanDataProofreadingResults();
    expect(f.controller.proofreadingError.value).toBe("");
    expect(f.controller.proofreadingIssues.value).toEqual([
      expect.objectContaining({ address: "A1", type: "number", safe: true }),
      expect.objectContaining({ address: "A2", type: "number", safe: false }),
    ]);

    const safe = f.controller.proofreadingIssues.value[0]!;
    const advisory = f.controller.proofreadingIssues.value[1]!;
    f.controller.selectDataProofreadingIssue(advisory.id);
    expect(f.navigateCalls).toEqual([{ sheetId: f.sheet.id, address: { row: 1, column: 0 } }]);

    f.controller.applyDataProofreadingIssue(safe.id);
    expect(f.controller.proofreadingIssues.value).toHaveLength(1);
    expect(f.session.workbook.sheets.get(f.sheet.id)!.cells.get("0:0")!.content).toEqual({
      kind: "literal",
      value: 42,
    });
  });

  test("keeps scan results visible when the source cell changes before an apply", () => {
    const f = fixture();
    f.set(0, 0, "42");
    f.controller.openDataProofreading();
    f.controller.scanDataProofreadingResults();
    const issue = f.controller.proofreadingIssues.value[0]!;
    f.set(0, 0, "43");

    f.controller.applyDataProofreadingIssue(issue.id);
    expect(f.controller.proofreadingIssues.value).toHaveLength(1);
    expect(f.controller.proofreadingError.value).toContain("workbook changed");
  });
});
