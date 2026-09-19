import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import WorkbookFormulaBar from "../../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountFormulaBar(locale: "en-US" | "zh-CN" = "en-US") {
  return mount(WorkbookFormulaBar, {
    global: { plugins: [createAppI18n(locale)] },
    props: {
      address: { row: 0, column: 0 },
      addressLabel: "A1",
      inputValue: "",
      searchQuery: "",
    },
  });
}

describe("WorkbookFormulaBar", () => {
  test("exposes localized address and formula semantics", () => {
    const wrapper = mountFormulaBar("zh-CN");

    expect(wrapper.get("[data-formula-bar]").attributes("role")).toBe("group");
    expect(wrapper.get("[data-formula-bar]").attributes("aria-label")).toBe("地址和公式栏");
    expect(wrapper.get("form").attributes("aria-label")).toBe("转到单元格");
    expect(wrapper.get("[data-address-input]").attributes("aria-label")).toBe("单元格地址");
    expect(wrapper.get("[data-formula-input]").attributes("aria-label")).toBe("编辑单元格 A1");
    expect(wrapper.get("[data-formula-input]").attributes("aria-keyshortcuts")).toBe(
      "Alt+Enter Control+F2 F2 F4",
    );
    expect(wrapper.get("[data-formula-input]").element).toBeInstanceOf(HTMLTextAreaElement);
    expect(wrapper.get("[data-search-input]").attributes("aria-label")).toBe("在工作表中查找");
    expect(wrapper.get(".workbook-formula-bar__fx").attributes("aria-hidden")).toBe("true");
  });

  test("normalizes address navigation and restores the selected address", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLInputElement>("[data-address-input]");

    await input.setValue("b12");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("navigate")).toEqual([["B12"]]);
    expect(input.element.value).toBe("A1");

    await input.setValue("invalid");
    await input.trigger("keydown", { key: "Escape" });
    expect(input.element.value).toBe("A1");

    await wrapper.setProps({ address: { row: 2, column: 2 }, addressLabel: "C3" });
    expect(input.element.value).toBe("C3");
  });

  test("commits the formula draft to the cell that owned the edit", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("001");
    await wrapper.setProps({ address: { row: 2, column: 2 }, addressLabel: "C3", inputValue: "" });
    await input.trigger("keydown", { key: "Enter" });
    await input.trigger("blur");

    expect(wrapper.emitted("commitCell")).toEqual([
      [{ address: { row: 0, column: 0 }, input: "001", confirmPendingWarning: true }],
    ]);
    expect(wrapper.emitted("traverse")).toEqual([
      [{ address: { row: 0, column: 0 }, direction: "down" }],
    ]);

    await wrapper.setProps({ inputValue: "1" });
    expect(input.element.value).toBe("1");
  });

  test("traverses from an unchanged draft and searches in both directions", async () => {
    const wrapper = mountFormulaBar();
    const formulaInput = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    const searchInput = wrapper.get<HTMLInputElement>("[data-search-input]");

    await formulaInput.trigger("focus");
    await formulaInput.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(wrapper.emitted("traverse")).toEqual([
      [{ address: { row: 0, column: 0 }, direction: "up" }],
    ]);

    await searchInput.setValue("needle");
    await searchInput.trigger("keydown", { key: "Enter" });
    await searchInput.trigger("keydown", { key: "Enter", shiftKey: true });
    await wrapper.get('[aria-label="Find next"]').trigger("click");
    await wrapper.get('[aria-label="Find previous"]').trigger("click");

    expect(wrapper.emitted("updateSearchQuery")).toEqual([["needle"]]);
    expect(wrapper.emitted("find")).toEqual([["forward"], ["backward"], ["forward"], ["backward"]]);
  });

  test("cancels with Escape and defers commit during IME composition", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("draft");
    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(input.element.value).toBe("");

    await input.trigger("focus");
    await input.trigger("compositionstart");
    await input.setValue("中文");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(wrapper.emitted("traverse")).toBeUndefined();
    await input.trigger("compositionend", { data: "中文" });
    await input.trigger("blur");

    expect(wrapper.emitted("commitCell")).toEqual([
      [{ address: { row: 0, column: 0 }, input: "中文" }],
    ]);
  });

  test("inserts a line break with Alt+Enter and commits it with plain Enter", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("firstsecond");
    input.element.setSelectionRange(5, 5);
    await input.trigger("keydown", { key: "Enter", altKey: true });

    expect(input.element.value).toBe("first\nsecond");
    expect(input.element.selectionStart).toBe(6);
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(wrapper.emitted("traverse")).toBeUndefined();

    await input.trigger("keydown", { key: "Enter" });
    await input.trigger("blur");
    expect(wrapper.emitted("commitCell")).toEqual([
      [
        {
          address: { row: 0, column: 0 },
          input: "first\nsecond",
          confirmPendingWarning: true,
        },
      ],
    ]);
    expect(wrapper.emitted("traverse")).toEqual([
      [{ address: { row: 0, column: 0 }, direction: "down" }],
    ]);
  });
});
