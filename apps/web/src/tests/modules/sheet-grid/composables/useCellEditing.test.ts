import { describe, expect, test } from "vitest";
import { useCellEditing } from "../../../../modules/sheet-grid/composables/useCellEditing";
import { useCellEditSession } from "../../../../shared/cell-editing/useCellEditSession";

describe("useCellEditing", () => {
  test("commits a composition before applying a deferred selection", () => {
    const commits: Array<{ address: { row: number; column: number }; input: string }> = [];
    const selections: unknown[] = [];
    const editing = useCellEditing({
      getActiveCell: () => ({ row: 2, column: 3 }),
      getInputValue: () => "",
      onClearClipboard: () => undefined,
      onCommit: (payload) => commits.push(payload),
      onSelectionChange: (selection) => selections.push(selection),
    });
    const destination = {
      active: { row: 4, column: 5 },
      anchor: { row: 4, column: 5 },
      focus: { row: 4, column: 5 },
      mode: "cells" as const,
    };

    editing.onCompositionStart();

    expect(editing.deferSelectionWhileComposing(destination)).toBe(true);

    editing.onCompositionEnd("input", { data: "input" } as CompositionEvent);

    expect(commits).toEqual([{ address: { row: 2, column: 3 }, input: "input" }]);
    expect(selections).toEqual([destination]);
    expect(editing.isEditing.value).toBe(false);
    expect(editing.isComposing.value).toBe(false);
  });

  test("retains the draft and selection when a commit is rejected", () => {
    const selections: unknown[] = [];
    const session = useCellEditSession({ onCommit: () => false });
    const editing = useCellEditing({
      session,
      getActiveCell: () => ({ row: 2, column: 3 }),
      getInputValue: () => "valid",
      onClearClipboard: () => undefined,
      onCommit: () => undefined,
      onSelectionChange: (selection) => selections.push(selection),
    });
    const destination = {
      active: { row: 4, column: 5 },
      anchor: { row: 4, column: 5 },
      focus: { row: 4, column: 5 },
      mode: "cells" as const,
    };

    editing.beginEdit("append");
    editing.onInput("invalid");
    expect(editing.finishEdit(destination)).toBe(false);

    expect(selections).toEqual([]);
    expect(editing.isEditing.value).toBe(true);
    expect(editing.editingValue.value).toBe("invalid");
    expect(session.state.owner).toEqual({ address: { row: 2, column: 3 } });
  });
});
