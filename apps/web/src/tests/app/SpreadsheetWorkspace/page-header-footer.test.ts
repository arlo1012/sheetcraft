import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import type { Sheet } from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import CustomHeaderFooterDialog from "../../../modules/page-layout/components/CustomHeaderFooterDialog.vue";
import PageSetupDialog from "../../../modules/page-layout/components/PageSetupDialog.vue";
import WorkbookStatusBar from "../../../modules/workbook/components/WorkbookStatusBar.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

function mountWorkspace() {
  return mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => undefined,
        save: async () => ({ revision: 1, savedAt: 1 }),
        replace: async () => ({ revision: 1, savedAt: 1 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
}

describe("workspace header/footer dialog", () => {
  test("opens the requested section and keeps cancelled drafts out of workbook history", async () => {
    const wrapper = mountWorkspace();
    try {
      await flushPromises();
      const grid = wrapper.getComponent(SheetGrid);
      const revision = grid.props("workbookRevision");
      grid.vm.$emit("openHeaderFooter", { section: "footer", part: "right", variant: "odd" });
      await flushPromises();
      const dialog = wrapper.getComponent(PageSetupDialog);
      expect(dialog.props()).toMatchObject({
        visible: true,
        initialTab: "header-footer",
        headerFooterTarget: { section: "footer", part: "right", variant: "odd" },
      });

      await dialog.get('[data-page-setup="custom-footer"]').trigger("click");
      const customDialog = wrapper.getComponent(CustomHeaderFooterDialog);
      await customDialog
        .get('[data-page-setup="footer-left"] textarea')
        .setValue("Cancelled footer");
      customDialog.findComponent({ name: "TDialog" }).vm.$emit("close");
      await flushPromises();
      expect(dialog.props("visible")).toBe(true);
      dialog.findComponent({ name: "TDialog" }).vm.$emit("close");
      await flushPromises();
      expect(dialog.props("visible")).toBe(false);
      expect(grid.props("workbookRevision")).toBe(revision);
      expect((grid.props("sheet") as Sheet).pageSetup?.footer.right ?? "").toBe("");

      grid.vm.$emit("openHeaderFooter", { section: "footer", part: "right", variant: "odd" });
      await flushPromises();
      await dialog.get('[data-page-setup="custom-footer"]').trigger("click");
      const savedCustomDialog = wrapper.getComponent(CustomHeaderFooterDialog);
      await savedCustomDialog
        .get('[data-page-setup="footer-left"] textarea')
        .setValue("Saved &[Page]");
      savedCustomDialog.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await flushPromises();
      expect(dialog.props("visible")).toBe(true);
      expect(grid.props("workbookRevision")).toBe(revision);
      dialog.findComponent({ name: "TDialog" }).vm.$emit("confirm");
      await flushPromises();
      expect(dialog.props("visible")).toBe(false);
      expect((grid.props("sheet") as Sheet).pageSetup?.footer.left).toContain("Saved &P");
      expect(grid.props("workbookRevision")).toBe(Number(revision) + 1);

      wrapper.getComponent(WorkbookStatusBar).vm.$emit("update:viewMode", "page-layout");
      grid.vm.$emit("update:showPageWhiteSpace", false);
      await flushPromises();
      expect(grid.props("showPageWhiteSpace")).toBe(false);
      expect(grid.find("[data-page-header-footer]").exists()).toBe(false);
      grid.vm.$emit("openHeaderFooter", { section: "footer", part: "right", variant: "odd" });
      await flushPromises();
      await dialog.get('[data-page-setup="custom-footer"]').trigger("click");
      const reopenedCustomDialog = wrapper.getComponent(CustomHeaderFooterDialog);
      expect(
        reopenedCustomDialog.get<HTMLTextAreaElement>('[data-page-setup="footer-left"] textarea')
          .element.value,
      ).toBe("Saved &[Page]");
      expect(grid.props("workbookRevision")).toBe(Number(revision) + 1);
    } finally {
      wrapper.unmount();
      document.body.replaceChildren();
    }
  });
});
