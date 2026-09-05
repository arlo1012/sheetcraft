import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import WorkbookFormulaBar from "../../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

type FormulaBarSaveContract = {
  flushPendingEdit: () => boolean;
  hasPendingEdit: () => boolean;
};

function mountFormulaBar() {
  return mount(WorkbookFormulaBar, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      address: { row: 0, column: 0 },
      addressLabel: "A1",
      inputValue: "",
      searchQuery: "",
    },
  });
}

function getSaveContract(wrapper: ReturnType<typeof mountFormulaBar>): FormulaBarSaveContract {
  return wrapper.vm as unknown as FormulaBarSaveContract;
}

describe("WorkbookFormulaBar save contract", () => {
  test("flushes an unconfirmed draft once without requiring Enter", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    const saveContract = getSaveContract(wrapper);

    await input.trigger("focus");
    await input.setValue("Draft");

    expect(saveContract.hasPendingEdit()).toBe(true);
    expect(saveContract.flushPendingEdit()).toBe(true);
    expect(wrapper.emitted("commitCell")).toEqual([
      [{ address: { row: 0, column: 0 }, input: "Draft" }],
    ]);

    await input.trigger("blur");
    expect(wrapper.emitted("commitCell")).toHaveLength(1);
    expect(saveContract.hasPendingEdit()).toBe(false);
  });

  test("keeps an IME draft until composition ends", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");
    const saveContract = getSaveContract(wrapper);

    await input.trigger("focus");
    await input.trigger("compositionstart");
    await input.setValue("中文");

    expect(saveContract.hasPendingEdit()).toBe(true);
    expect(saveContract.flushPendingEdit()).toBe(false);
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(input.element.value).toBe("中文");

    await input.trigger("compositionend");
    expect(saveContract.flushPendingEdit()).toBe(true);
    expect(wrapper.emitted("commitCell")).toEqual([
      [{ address: { row: 0, column: 0 }, input: "中文" }],
    ]);
  });
});
