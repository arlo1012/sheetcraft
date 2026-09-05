import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import XlsxFileActions from "../../../modules/workbook-xlsx/components/XlsxFileActions.vue";
import XlsxFileFeedback from "../../../modules/workbook-xlsx/components/XlsxFileFeedback.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("XLSX controls", () => {
  test("uses localized labels for the import and export controls", () => {
    const wrapper = mount(XlsxFileActions, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { busy: false, disabled: false },
    });
    mounted.push(wrapper);

    expect(wrapper.get("[data-xlsx-import]").text()).toContain("Import XLSX");
    expect(wrapper.get("[data-xlsx-export]").text()).toContain("Export XLSX");
    expect(wrapper.get("[data-xlsx-file-input]").attributes("aria-label")).toBe(
      "Select an XLSX workbook",
    );
  });

  test("shows descriptive compatibility details inside the import confirmation without missing-key warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const wrapper = mount(XlsxFileFeedback, {
      attachTo: document.body,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        busy: false,
        confirmation: "import",
        report: {
          issues: [
            {
              code: "image-omitted",
              severity: "warning",
              count: 2,
              locations: ["Sheet1!A1", "Sheet1!B2"],
            },
          ],
        },
      },
    });
    mounted.push(wrapper);

    const dialog = new DOMWrapper(document.body).get("[data-xlsx-confirmation-report]");
    expect(dialog.text()).toContain("Images are not included in the exported file");
    expect(dialog.text()).toContain("2 items");
    expect(dialog.text()).toContain("Sheet1!A1");
    expect(document.body.textContent).toContain("Import XLSX workbook?");
    expect(warn).not.toHaveBeenCalled();
  });
});
