import { describe, expect, test } from "vitest";
import { useCellEditing } from "../../../../modules/sheet-grid/composables/useCellEditing";

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
});
