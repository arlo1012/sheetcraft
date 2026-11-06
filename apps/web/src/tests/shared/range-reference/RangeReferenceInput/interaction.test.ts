// 未执行：按用户要求仅编写测试，不运行检查。
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import RangeReferenceInput from "../../../../shared/range-reference/RangeReferenceInput.vue";
import { createAppI18n } from "../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});

function mountInput(
  value: string,
  selectReference: (current: string) => Promise<string | undefined>,
  insertReference = true,
  label?: string,
) {
  const wrapper = mount(RangeReferenceInput, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { modelValue: value, selectReference, insertReference, label },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("RangeReferenceInput", () => {
  test("exposes focus for a dialog to target its missing range", async () => {
    const wrapper = mountInput("", async () => undefined, false, "Location range");
    await flushPromises();
    wrapper.vm.focus();
    expect(document.activeElement).toBe(wrapper.get("input").element);
  });

  test.each([
    { label: undefined, expected: "Reference" },
    { label: "Data range", expected: "Data range" },
  ])("names the native input $expected", async ({ label, expected }) => {
    const wrapper = mountInput("A1:C3", async () => undefined, true, label);
    await flushPromises();

    expect(wrapper.get("input").attributes("aria-label")).toBe(expected);
  });

  test("updates the native input name when its label changes and restores the default when removed", async () => {
    const wrapper = mountInput("A1:C3", async () => undefined, true, "Source range");
    await flushPromises();
    expect(wrapper.get("input").attributes("aria-label")).toBe("Source range");

    await wrapper.setProps({ label: "Destination range" });
    await flushPromises();
    expect(wrapper.get("input").attributes("aria-label")).toBe("Destination range");

    await wrapper.setProps({ label: undefined });
    await flushPromises();
    expect(wrapper.get("input").attributes("aria-label")).toBe("Reference");
  });

  test("inserts the selected range at the saved caret inside a formula", async () => {
    const wrapper = mountInput("=SUM()", async () => "=Budget!$A$1:$A$3");
    const input = wrapper.get<HTMLInputElement>("input");
    input.element.focus();
    input.element.setSelectionRange(5, 5);
    await input.trigger("select");

    await wrapper.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toEqual([["=SUM(Budget!$A$1:$A$3)"]]);
    expect(document.activeElement).toBe(input.element);
    expect(input.element.selectionStart).toBe("=SUM(Budget!$A$1:$A$3)".length - 1);
  });

  test("replaces the saved selected reference without disturbing the formula", async () => {
    const wrapper = mountInput("=SUM(Old!$A$1)+1", async () => "=Budget!$B$2");
    const input = wrapper.get<HTMLInputElement>("input");
    const start = "=SUM(".length;
    input.element.focus();
    input.element.setSelectionRange(start, start + "Old!$A$1".length);
    await input.trigger("select");

    await wrapper.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toEqual([["=SUM(Budget!$B$2)+1"]]);
  });

  test("keeps the content and restores the saved selection when picking is cancelled", async () => {
    const wrapper = mountInput("=SUM()", async () => undefined);
    const input = wrapper.get<HTMLInputElement>("input");
    input.element.focus();
    input.element.setSelectionRange(5, 5);
    await input.trigger("select");

    await wrapper.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(input.element.value).toBe("=SUM()");
    expect(document.activeElement).toBe(input.element);
    expect(input.element.selectionStart).toBe(5);
    expect(input.element.selectionEnd).toBe(5);
  });
  test.each(["", "=SUM(A1)>0"])(
    "keeps a leading equals sign when replacing all of %s",
    async (value) => {
      const wrapper = mountInput(value, async () => "=Budget!$B$2");
      const input = wrapper.get<HTMLInputElement>("input");
      input.element.setSelectionRange(0, value.length);
      await wrapper.get("[data-select-formula-reference]").trigger("click");
      await flushPromises();
      expect(wrapper.emitted("update:modelValue")).toEqual([["=Budget!$B$2"]]);
    },
  );
  test("does not insert the entire formula when the picker confirms without a new selection", async () => {
    const wrapper = mountInput("=SUM()>0", async (current) => current);
    const input = wrapper.get<HTMLInputElement>("input");
    input.element.setSelectionRange(5, 5);
    await wrapper.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(input.element.value).toBe("=SUM()>0");
  });
});
