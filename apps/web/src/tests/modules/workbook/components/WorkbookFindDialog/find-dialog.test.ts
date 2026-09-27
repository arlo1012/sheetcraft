import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import WorkbookFindDialog from "../../../../../modules/workbook/components/WorkbookFindDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("WorkbookFindDialog", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  test("searches in both directions from the independent dialog", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: {
        plugins: [createAppI18n("en-US")],
      },
      props: { visible: true, query: "needle" },
    });
    const dialog = new DOMWrapper(document.body);
    const searchInput = dialog.get<HTMLInputElement>("[data-search-input] input");
    await searchInput.setValue("updated");
    await searchInput.trigger("keydown", { key: "Enter" });
    await searchInput.trigger("keydown", { key: "Enter", shiftKey: true });
    const buttons = dialog.findAll("button");
    await buttons.find((button) => button.text() === "Find next")!.trigger("click");
    await buttons.find((button) => button.text() === "Find previous")!.trigger("click");

    expect(wrapper.emitted("updateQuery")).toEqual([["updated"]]);
    expect(wrapper.emitted("find")).toEqual([["forward"], ["backward"], ["forward"], ["backward"]]);
    wrapper.unmount();
  });

  test("keeps expanded options controlled and emits only the selected option change", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        visible: true,
        query: "",
        options: {
          scope: "sheet",
          order: "rows",
          lookIn: "smart",
          matchCase: false,
          matchEntireCell: false,
          matchWidth: false,
        },
        formatSummary: "Fill: blue",
      },
    });
    const body = new DOMWrapper(document.body);
    await body.get("button[aria-controls='find-options']").trigger("click");
    const scope = wrapper.findAllComponents(TSelect)[0];
    scope?.vm.$emit("change", "workbook");
    await body.get("button[aria-controls='find-options']").trigger("click");
    await body.get("button[aria-controls='find-options']").trigger("click");
    expect(wrapper.emitted("updateOptions")).toEqual([[{ scope: "workbook" }]]);
    expect(body.find("[data-find-format='clear']").exists()).toBe(false);
    wrapper.unmount();
  });

  test("inserts visible newline tokens at the combobox caret", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, query: "ac" },
    });
    const body = new DOMWrapper(document.body);
    const input = body.get<HTMLInputElement>("[data-search-input] input");
    input.element.setSelectionRange(1, 1);
    await body.get("button[aria-label='Special content']").trigger("click");
    await body.get("[data-find-special='line-break']").trigger("click");
    expect(wrapper.emitted("updateQuery")).toEqual([["a^lc"]]);
    await wrapper.setProps({ query: "^l" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("find")?.at(-1)).toEqual(["forward"]);
    wrapper.unmount();
  });
  test("recalls history with the keyboard without immediately searching", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, query: "other", history: ["^l", "1"] },
    });
    const input = new DOMWrapper(document.body).get<HTMLInputElement>("[data-search-input] input");
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("updateQuery")?.at(-1)).toEqual(["^l"]);
    expect(wrapper.emitted("find")).toBeUndefined();
    await wrapper.setProps({ query: "^l" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("find")).toEqual([["forward"]]);
    wrapper.unmount();
  });
  test("preserves pasted line breaks as visible search tokens", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, query: "ab" },
    });
    const input = new DOMWrapper(document.body).get<HTMLInputElement>("[data-search-input] input");
    input.element.setSelectionRange(1, 1);
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "x\ny");
    await input.trigger("paste", { clipboardData });
    expect(wrapper.emitted("updateQuery")?.at(-1)).toEqual(["ax^lyb"]);
    wrapper.unmount();
  });
});
