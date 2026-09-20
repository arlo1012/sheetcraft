import { describe, expect, test } from "vitest";
import { mountSheetGrid } from "./fixture";

describe("flash fill shortcut", () => {
  test("emits flash fill for Ctrl+E when the grid owns a cell selection", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "e", ctrlKey: true });

    expect(wrapper.emitted("flashFill")).toEqual([[]]);
  });

  test("does not invoke flash fill while editing or on a protected sheet", async () => {
    const { wrapper } = mountSheetGrid();
    const editor = wrapper.get("textarea.cell-editor");

    await editor.trigger("keydown", { key: "x" });
    await editor.trigger("keydown", { key: "e", ctrlKey: true });
    expect(wrapper.emitted("flashFill")).toBeUndefined();

    await editor.trigger("keydown", { key: "Escape" });
    await wrapper.setProps({ readOnly: true });
    await editor.trigger("keydown", { key: "e", ctrlKey: true });
    expect(wrapper.emitted("flashFill")).toBeUndefined();
  });
});
