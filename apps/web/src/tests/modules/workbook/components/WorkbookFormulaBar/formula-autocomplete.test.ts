import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { getFormulaFunctionMetadata } from "@sheetcraft/core/formula";
import WorkbookFormulaBar from "../../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

function mountFormulaBar(inputValue = "", sheetId?: string) {
  const wrapper = mount(WorkbookFormulaBar, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      address: { row: 0, column: 0 },
      addressLabel: "A1",
      inputValue,
      sheetId,
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

function getAutocomplete() {
  return new DOMWrapper(document.body).get('[role="listbox"]');
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("WorkbookFormulaBar formula autocomplete", () => {
  test("offers all matching Core functions while keeping SUM as the selected default for an =s prefix", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=s");

    const suggestions = getAutocomplete();
    expect(suggestions.get('[role="option"]').text()).toContain("SUM");
    expect(suggestions.findAll('[role="option"]')).toHaveLength(
      getFormulaFunctionMetadata().filter((item) => item.name.startsWith("S")).length,
    );
    expect(suggestions.get('[data-formula-suggestion="SUM"]').attributes("aria-selected")).toBe(
      "true",
    );
  });

  test.each(["Enter", "Tab"])(
    "inserts SUM( with %s before committing or traversing",
    async (key) => {
      const wrapper = mountFormulaBar();
      const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

      await input.trigger("focus");
      await input.setValue("=s");
      await input.trigger("keydown", { key });

      expect(input.element.value).toBe("=SUM(");
      expect(wrapper.emitted("commitCell")).toBeUndefined();
      expect(wrapper.emitted("traverse")).toBeUndefined();
      expect(document.body.querySelector('[role="listbox"]')).toBeNull();
      expect(new DOMWrapper(document.body).get("[data-formula-help]").text()).toContain("SUM");
    },
  );

  test("uses Escape first to close autocomplete and then to cancel the shared draft", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=s");
    await input.trigger("keydown", { key: "Escape" });

    expect(input.element.value).toBe("=s");
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(wrapper.emitted("commitCell")).toBeUndefined();

    await input.trigger("keydown", { key: "Escape" });
    expect(input.element.value).toBe("");
    expect(wrapper.emitted("commitCell")).toBeUndefined();
  });

  test("does not accept an autocomplete suggestion during IME composition", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=s");
    await input.trigger("compositionstart");
    await input.trigger("keydown", { key: "Enter", isComposing: true });

    expect(input.element.value).toBe("=s");
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(wrapper.emitted("traverse")).toBeUndefined();
  });

  test("commits to the captured sheet and address after external selection props change", async () => {
    const wrapper = mountFormulaBar("", "first-sheet");
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=SUM(1)");
    await wrapper.setProps({
      sheetId: "second-sheet",
      address: { row: 2, column: 2 },
      addressLabel: "C3",
      inputValue: "other",
    });
    await input.trigger("blur");

    expect(wrapper.emitted("commitCell")).toEqual([
      [
        {
          sheetId: "first-sheet",
          address: { row: 0, column: 0 },
          input: "=SUM(1)",
        },
      ],
    ]);
  });

  test("finishes a blurred IME formula draft only after composition ends", async () => {
    const wrapper = mountFormulaBar("", "sheet-1");
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.trigger("compositionstart");
    await input.setValue("中文");
    await input.trigger("blur");
    expect(wrapper.emitted("commitCell")).toBeUndefined();

    await input.trigger("compositionend", { data: "中文" });
    expect(wrapper.emitted("commitCell")).toEqual([
      [{ sheetId: "sheet-1", address: { row: 0, column: 0 }, input: "中文" }],
    ]);
  });
});
