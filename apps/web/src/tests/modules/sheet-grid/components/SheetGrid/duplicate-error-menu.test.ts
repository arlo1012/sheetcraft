import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid duplicate-entry error menu", () => {
  test("shows for an idle editor and hides only while formula editing is active", async () => {
    const { wrapper } = mountSheetGrid({ errorCells: new Set(["0:0"]) });
    expect(wrapper.find("[data-sheet-cell-error-trigger]").exists()).toBe(true);

    const editor = wrapper.get<HTMLTextAreaElement>("textarea.cell-editor");
    await editor.trigger("keydown", { key: "=" });
    await editor.setValue("=SUM(");
    await nextTick();

    expect(wrapper.find("[data-sheet-cell-error-trigger]").exists()).toBe(false);
  });
});
