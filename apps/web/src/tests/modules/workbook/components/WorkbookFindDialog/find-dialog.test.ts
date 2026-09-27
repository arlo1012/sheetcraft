import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
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
});
