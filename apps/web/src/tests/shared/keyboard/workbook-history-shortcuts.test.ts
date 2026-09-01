import { describe, expect, test } from "vitest";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";

function dispatchShortcut(
  target: HTMLElement,
  init: KeyboardEventInit,
  allowEditableTarget = false,
) {
  let shortcut: ReturnType<typeof getWorkbookHistoryShortcut>;
  target.addEventListener(
    "keydown",
    (event) => {
      shortcut = getWorkbookHistoryShortcut(event, { allowEditableTarget });
    },
    { once: true },
  );
  target.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
  return shortcut;
}

describe("getWorkbookHistoryShortcut", () => {
  test("classifies the cross-platform undo and redo chords", () => {
    const button = document.createElement("button");
    expect(dispatchShortcut(button, { key: "z", ctrlKey: true })).toBe("undo");
    expect(dispatchShortcut(button, { key: "Z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(dispatchShortcut(button, { key: "y", ctrlKey: true })).toBe("redo");
    expect(dispatchShortcut(button, { key: "z" })).toBeUndefined();
  });

  test("preserves native editable history unless the owning surface opts in", () => {
    const textarea = document.createElement("textarea");
    expect(dispatchShortcut(textarea, { key: "z", ctrlKey: true })).toBeUndefined();
    expect(dispatchShortcut(textarea, { key: "z", ctrlKey: true }, true)).toBe("undo");
  });
});
