import { describe, expect, test } from "vitest";
import { useCellEditSession } from "../../../../shared/cell-editing/useCellEditSession";
import { useFormulaReferenceNavigation } from "../../../../modules/sheet-grid/composables/useFormulaReferenceNavigation";

describe("useFormulaReferenceNavigation", () => {
  test("does not treat Text-format literals as formulas after their escape is removed", () => {
    const session = useCellEditSession({ onCommit: () => undefined });
    session.begin(
      { address: { row: 0, column: 0 }, input: "=A1", asText: true },
      { surface: "grid", mode: "append" },
    );
    session.setMode("point");
    let editorReads = 0;
    const { handleReferenceKeydown } = useFormulaReferenceNavigation({
      session,
      getEditor: () => {
        editorReads += 1;
        return null;
      },
      getActiveAddress: () => ({ row: 0, column: 0 }),
      getVisibleRow: () => null,
      ensureVisible: () => undefined,
    });
    for (const key of ["F2", "ArrowRight", "ArrowDown"]) {
      const event = new KeyboardEvent("keydown", { key, cancelable: true });
      expect(handleReferenceKeydown(event)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(editorReads).toBe(0);
    expect(session.state.mode).toBe("point");
    expect(session.state.draft).toBe("=A1");
  });
  test("switches point mode and moves or extends only the active reference", () => {
    const session = useCellEditSession({ onCommit: () => undefined });
    session.begin(
      { address: { row: 0, column: 0 }, input: "=A1" },
      { surface: "grid", mode: "append" },
    );
    session.setSelection(1, 3);
    const picks: Array<{
      start: { row: number; column: number };
      end: { row: number; column: number };
    }> = [];
    let activeRange: (typeof picks)[number] | null = null;
    const editor = {
      canPickReference: () => true,
      pickReference: (range: (typeof picks)[number]) => {
        picks.push(range);
        activeRange = range;
        return true;
      },
      editingFormula: true,
      references: [
        {
          start: 1,
          end: 3,
          text: "A1",
          key: "0:0-0:0",
          colorIndex: 0,
          range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
        },
      ],
      get referenceActive() {
        return activeRange !== null;
      },
      get referenceRange() {
        return activeRange;
      },
    };
    const visible: Array<{ row: number; column: number }> = [];
    const { handleReferenceKeydown } = useFormulaReferenceNavigation({
      session,
      getEditor: () => editor,
      getActiveAddress: () => ({ row: 0, column: 0 }),
      getVisibleRow: (row, direction) => row + direction,
      ensureVisible: (address) => visible.push(address),
    });

    expect(
      handleReferenceKeydown(new KeyboardEvent("keydown", { key: "F2", cancelable: true })),
    ).toBe(true);
    expect(session.state.mode).toBe("point");
    expect(
      handleReferenceKeydown(new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true })),
    ).toBe(true);
    expect(picks.at(-1)).toEqual({ start: { row: 0, column: 1 }, end: { row: 0, column: 1 } });
    expect(
      handleReferenceKeydown(
        new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, cancelable: true }),
      ),
    ).toBe(true);
    expect(picks.at(-1)).toEqual({ start: { row: 0, column: 1 }, end: { row: 1, column: 1 } });
    expect(visible.at(-1)).toEqual({ row: 1, column: 1 });
    expect(
      handleReferenceKeydown(new KeyboardEvent("keydown", { key: "F2", cancelable: true })),
    ).toBe(true);
    expect(session.state.mode).toBe("edit");
  });

  test("does not navigate while composing or outside point mode", () => {
    const session = useCellEditSession({ onCommit: () => undefined });
    session.begin(
      { address: { row: 0, column: 0 }, input: "=A1" },
      { surface: "grid", mode: "append" },
    );
    const { handleReferenceKeydown } = useFormulaReferenceNavigation({
      session,
      getEditor: () => null,
      getActiveAddress: () => ({ row: 0, column: 0 }),
      getVisibleRow: () => null,
      ensureVisible: () => undefined,
    });
    expect(handleReferenceKeydown(new KeyboardEvent("keydown", { key: "ArrowRight" }))).toBe(false);
    session.startComposition();
    expect(handleReferenceKeydown(new KeyboardEvent("keydown", { key: "F2" }))).toBe(false);
  });
});
