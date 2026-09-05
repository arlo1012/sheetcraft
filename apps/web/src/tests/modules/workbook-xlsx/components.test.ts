import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import XlsxFileActions from "../../../modules/workbook-xlsx/components/XlsxFileActions.vue";
import XlsxFileFeedback from "../../../modules/workbook-xlsx/components/XlsxFileFeedback.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

function createFeedbackHost(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  return host;
}

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

  test("shows descriptive compatibility details only inside the import dialog without missing-key warnings", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const host = createFeedbackHost();
    const wrapper = mount(XlsxFileFeedback, {
      attachTo: host,
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
    await flushPromises();

    const dialog = new DOMWrapper(document.body).get("[data-xlsx-confirmation-report]");
    expect(dialog.text()).toContain("Images are not included in the exported file");
    expect(dialog.text()).toContain("2 items");
    expect(dialog.text()).toContain("Sheet1!A1");
    expect(document.body.textContent).toContain("Import XLSX workbook?");
    expect(host.querySelector("[data-xlsx-confirmation-report]")).toBeNull();
    expect(document.querySelector("[data-xlsx-feedback]")).toBeNull();
    expect(document.querySelector("[data-xlsx-report]")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test.each(["import", "export"] as const)(
    "leaves no inline report or success notice after the %s dialog closes",
    async (confirmation) => {
      const host = createFeedbackHost();
      const wrapper = mount(XlsxFileFeedback, {
        attachTo: host,
        global: { plugins: [createAppI18n("en-US")] },
        props: {
          busy: false,
          confirmation,
          report: {
            issues: [
              { code: "dimension-approximated", severity: "warning", count: 1, locations: ["A"] },
            ],
          },
        },
      });
      mounted.push(wrapper);
      await flushPromises();

      const body = new DOMWrapper(document.body);
      expect(body.findAll("[data-xlsx-confirmation-report]")).toHaveLength(1);
      expect(host.textContent).toBe("");
      const cancel = body.findAll("button").find((button) => button.text() === "Cancel");
      expect(cancel).toBeDefined();
      await cancel!.trigger("click");
      expect(wrapper.emitted("cancel")).toHaveLength(1);
      await wrapper.setProps({ confirmation: undefined });
      expect(body.find("[data-xlsx-confirmation-report]").exists()).toBe(false);
      expect(body.text()).not.toContain("XLSX compatibility report");

      await wrapper.setProps({ feedback: { key: "xlsx.feedback.exported", error: false } });
      expect(body.text()).not.toContain("XLSX download started");
      expect(wrapper.text()).toBe("");
    },
  );

  test("shows failures in a dismissible dialog without rendering a workspace banner", async () => {
    const host = createFeedbackHost();
    const wrapper = mount(XlsxFileFeedback, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        busy: false,
        feedback: { key: "xlsx.feedback.blocked", error: true },
        report: {
          issues: [{ code: "archive-invalid", severity: "block", count: 1, locations: [] }],
        },
      },
    });
    mounted.push(wrapper);
    await flushPromises();

    const body = new DOMWrapper(document.body);
    expect(body.get("[data-xlsx-error]").text()).toContain("The operation was stopped");
    expect(body.get("[data-xlsx-error-report]").text()).toContain("Invalid or unsupported XLSX");
    expect(host.textContent).toBe("");
    expect(body.find("[data-xlsx-feedback]").exists()).toBe(false);
    const close = body.findAll("button").find((button) => button.text() === "Close");
    expect(close).toBeDefined();
    await close!.trigger("click");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("cancel")).toBeUndefined();
    await wrapper.setProps({ feedback: undefined });
    expect(body.find("[data-xlsx-error]").exists()).toBe(false);
    expect(body.text()).not.toContain("XLSX compatibility report");
  });
});
