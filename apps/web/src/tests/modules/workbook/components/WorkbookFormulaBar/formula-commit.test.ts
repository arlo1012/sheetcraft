import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import WorkbookFormulaBar from "../../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

function mountFormulaBar() {
  const wrapper = mount(WorkbookFormulaBar, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      address: { row: 0, column: 0 },
      addressLabel: "A1",
      inputValue: "",
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe("WorkbookFormulaBar formula commit completion", () => {
  test.each([
    ["Enter", "down"],
    ["Tab", "right"],
  ] as const)(
    "closes one unmatched SUM parenthesis before %s traversal",
    async (key, direction) => {
      const wrapper = mountFormulaBar();
      const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

      await input.trigger("focus");
      await input.setValue("=SUM(B1:C2");
      await input.trigger("keydown", { key });

      expect(wrapper.emitted("commitCell")).toEqual([
        [
          {
            address: { row: 0, column: 0 },
            input: "=SUM(B1:C2)",
            ...(key === "Enter" ? { confirmPendingWarning: true } : {}),
          },
        ],
      ]);
      expect(wrapper.emitted("traverse")).toEqual([
        [{ address: { row: 0, column: 0 }, direction }],
      ]);
    },
  );

  test("does not add a duplicate close and balances nested unmatched calls", async () => {
    const alreadyClosed = mountFormulaBar();
    const closedInput = alreadyClosed.get<HTMLTextAreaElement>("[data-formula-input]");
    await closedInput.trigger("focus");
    await closedInput.setValue("=SUM(B1)");
    await closedInput.trigger("keydown", { key: "Enter" });

    expect(alreadyClosed.emitted("commitCell")).toEqual([
      [{ address: { row: 0, column: 0 }, input: "=SUM(B1)", confirmPendingWarning: true }],
    ]);

    const nested = mountFormulaBar();
    const nestedInput = nested.get<HTMLTextAreaElement>("[data-formula-input]");
    await nestedInput.trigger("focus");
    await nestedInput.setValue("=SUM(SUM(B1),C2");
    await nestedInput.trigger("keydown", { key: "Enter" });

    expect(nested.emitted("commitCell")).toEqual([
      [
        {
          address: { row: 0, column: 0 },
          input: "=SUM(SUM(B1),C2)",
          confirmPendingWarning: true,
        },
      ],
    ]);
  });

  test("accepts a visible suggestion before it commits or traverses", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.setValue("=s");
    await input.trigger("keydown", { key: "Enter" });

    expect(input.element.value).toBe("=SUM(");
    expect(wrapper.emitted("commitCell")).toBeUndefined();
    expect(wrapper.emitted("traverse")).toBeUndefined();
  });

  test("does not close or commit during IME, and preserves Alt+Enter as a line break", async () => {
    const wrapper = mountFormulaBar();
    const input = wrapper.get<HTMLTextAreaElement>("[data-formula-input]");

    await input.trigger("focus");
    await input.trigger("compositionstart");
    await input.setValue("=SUM(B1:C2");
    await input.trigger("keydown", { key: "Enter", isComposing: true });
    expect(input.element.value).toBe("=SUM(B1:C2");
    expect(wrapper.emitted("commitCell")).toBeUndefined();

    await input.trigger("compositionend", { data: "2" });
    input.element.setSelectionRange(input.element.value.length, input.element.value.length);
    await input.trigger("keydown", { key: "Enter", altKey: true });
    expect(input.element.value).toBe("=SUM(B1:C2\n");
    expect(wrapper.emitted("commitCell")).toBeUndefined();
  });
});
