import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { h, nextTick } from "vue";
import WorkbookFileActions from "../../../../../modules/workbook-persistence/components/WorkbookFileActions.vue";
import XlsxFileActions from "../../../../../modules/workbook-xlsx/components/XlsxFileActions.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountFileMenu() {
  const wrapper = mount(WorkbookFileActions, {
    props: { status: "idle", disabled: false },
    slots: {
      "extra-menu-actions": ({ close }: { close: () => void }) =>
        h(XlsxFileActions, {
          busy: false,
          disabled: false,
          onClose: close,
        }),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("XLSX file menu actions", () => {
  test("renders localized import and export items only after the file menu opens", async () => {
    const wrapper = mountFileMenu();
    expect(wrapper.find("[data-xlsx-import]").exists()).toBe(false);

    await wrapper.get('[data-workbook-file="menu"]').trigger("click");
    await nextTick();

    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    expect(menu.get("[data-xlsx-import]").text()).toContain("Import XLSX");
    expect(menu.get("[data-xlsx-export]").text()).toContain("Export XLSX");
    expect(menu.get("[data-xlsx-file-input]").attributes("aria-label")).toBe(
      "Select an XLSX workbook",
    );
  });

  test("keeps the XLSX input mounted after selecting import from the file menu", async () => {
    const wrapper = mountFileMenu();
    await wrapper.get('[data-workbook-file="menu"]').trigger("click");
    await nextTick();

    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    const actions = wrapper.findComponent(XlsxFileActions);
    const input = menu.get<HTMLInputElement>("[data-xlsx-file-input]");
    const click = vi.spyOn(input.element, "click");
    await menu.get("[data-xlsx-import]").trigger("click");

    expect(menu.attributes("aria-hidden")).toBe("true");
    expect(click).toHaveBeenCalledOnce();
    const file = new File(["xlsx"], "book.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    Object.defineProperty(input.element, "files", {
      configurable: true,
      value: [file],
    });
    await input.trigger("change");

    expect(actions.emitted("importXlsx")).toEqual([[file]]);
    expect(input.element.value).toBe("");
  });

  test("closes the file menu before exporting and ignores disabled or busy actions", async () => {
    const wrapper = mountFileMenu();
    await wrapper.get('[data-workbook-file="menu"]').trigger("keydown", { key: "ArrowUp" });
    await nextTick();

    const menu = new DOMWrapper(document.body).get('[role="menu"]');
    const actions = wrapper.findComponent(XlsxFileActions);
    await new DOMWrapper(document.activeElement as HTMLElement).trigger("keydown", {
      key: "ArrowUp",
    });
    const exportItem = menu.get("[data-xlsx-export]");
    expect(document.activeElement).toBe(exportItem.element);
    await exportItem.trigger("keydown", { key: "Enter" });
    expect(actions.emitted("exportXlsx")).toEqual([[]]);
    expect(menu.attributes("aria-hidden")).toBe("true");

    for (const props of [
      { disabled: true, busy: false },
      { disabled: false, busy: true },
    ]) {
      const unavailableActions = mount(XlsxFileActions, {
        props,
        global: { plugins: [createAppI18n("en-US")] },
      });
      mounted.push(unavailableActions);
      await unavailableActions.get("[data-xlsx-import]").trigger("click");
      await unavailableActions.get("[data-xlsx-export]").trigger("click");
      expect(unavailableActions.emitted("close")).toBeUndefined();
      expect(unavailableActions.emitted("importXlsx")).toBeUndefined();
      expect(unavailableActions.emitted("exportXlsx")).toBeUndefined();
    }
  });
});
