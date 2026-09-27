import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { AutoComplete } from "tdesign-vue-next/es/auto-complete";
import { Popup } from "tdesign-vue-next/es/popup";
import WorkbookFindDialog from "../../../../../modules/workbook/components/WorkbookFindDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("WorkbookFindDialog", () => {
  beforeEach(() => {
    // Happy DOM has no layout; Popper otherwise treats the input as hidden.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 240, 32),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(wrapper.emitted("updateExpanded")).toEqual([[true]]);
    await wrapper.setProps({ expanded: true });
    const scope = wrapper.findAllComponents(TSelect)[0];
    scope?.vm.$emit("change", "workbook");
    await body.get("button[aria-controls='find-options']").trigger("click");
    await wrapper.setProps({ expanded: false });
    await body.get("button[aria-controls='find-options']").trigger("click");
    await wrapper.setProps({ expanded: true });
    expect(wrapper.emitted("updateOptions")).toEqual([[{ scope: "workbook" }]]);
    expect(body.find("[data-find-format='clear']").exists()).toBe(false);
    wrapper.unmount();
  });

  test("hides format controls and disables format-only search while options are collapsed", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, query: "", formatSummary: "Fill: blue" },
    });
    const body = new DOMWrapper(document.body);
    const findAll = () => body.findAll("button").find((button) => button.text() === "Find all")!;
    const hasFormat = () => body.findAll("button").some((button) => button.text() === "Format");
    expect(hasFormat()).toBe(false);
    expect(findAll().element.disabled).toBe(true);
    await wrapper.setProps({ expanded: true });
    expect(hasFormat()).toBe(true);
    expect(findAll().element.disabled).toBe(false);
    await wrapper.setProps({ expanded: false, query: "needle" });
    expect(hasFormat()).toBe(false);
    expect(findAll().element.disabled).toBe(false);
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
    await flushPromises();
    await body.get("button[aria-label='Special content']").trigger("click");
    await vi.waitFor(() =>
      expect(body.find("[data-find-special='line-break']").exists()).toBe(true),
    );
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
    await input.trigger("focus");
    await input.trigger("keydown", { key: "ArrowDown" });
    // The first arrow opens the history; subsequent arrows navigate native options.
    await flushPromises();
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("updateQuery")?.at(-1)).toEqual(["^l"]);
    expect(wrapper.emitted("find")).toBeUndefined();
    await wrapper.setProps({ query: "^l" });
    await flushPromises();
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("find")).toEqual([["forward"]]);
    wrapper.unmount();
  });
  test("opens history only on request, keeping focus and typing quiet", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, query: "other", history: ["^l", "1"] },
    });
    const body = new DOMWrapper(document.body);
    const input = body.get<HTMLInputElement>("[data-search-input] input");
    const popup = wrapper.getComponent(AutoComplete).getComponent(Popup);
    await input.trigger("focus");
    expect(popup.props("visible")).toBe(false);
    await input.setValue("needle");
    expect(popup.props("visible")).toBe(false);
    const arrow = body.get("[role='button'][aria-label='Find history']");
    await arrow.trigger("click");
    expect(popup.props("visible")).toBe(true);
    await flushPromises();
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Escape" });
    await input.trigger("focus");
    expect(popup.props("visible")).toBe(false);
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("find")).toEqual([["forward"]]);
    expect(wrapper.emitted("updateQuery")).toEqual([["needle"]]);
    await flushPromises();
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
