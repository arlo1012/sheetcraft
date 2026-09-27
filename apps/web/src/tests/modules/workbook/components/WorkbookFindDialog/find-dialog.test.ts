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
    const searchInput = dialog.get<HTMLTextAreaElement>("[data-search-input] textarea");
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

  test("inserts special content at the textarea caret and retains newline queries", async () => {
    const wrapper = mount(WorkbookFindDialog, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: { visible: true, query: "ac" },
    });
    const body = new DOMWrapper(document.body);
    const input = body.get<HTMLTextAreaElement>("[data-search-input] textarea");
    input.element.setSelectionRange(1, 1);
    await body.get("button[aria-label='Special content']").trigger("click");
    await body.get("[data-find-special='single']").trigger("click");
    expect(wrapper.emitted("updateQuery")).toEqual([["a?c"]]);
    await wrapper.setProps({ query: "\n" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("find")?.at(-1)).toEqual(["forward"]);
    wrapper.unmount();
  });
});
