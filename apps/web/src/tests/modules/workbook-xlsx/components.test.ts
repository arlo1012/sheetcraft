import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
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

describe("XLSX feedback", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "shows import/export loss counts, locations and explicit continue/cancel actions (%s)",
    async (locale) => {
      const wrapper = mount(XlsxFileFeedback, {
        attachTo: createFeedbackHost(),
        global: { plugins: [createAppI18n(locale)] },
        props: {
          busy: false,
          confirmation: "import",
          report: {
            issues: [
              {
                code: "image-omitted",
                severity: "warning",
                count: 12,
                locations: ["Sheet1!B2", "Sheet1.floatingImages[logo]"],
              },
              { code: "future-feature", severity: "warning", count: 1, locations: [] },
            ],
          },
        },
      });
      mounted.push(wrapper);
      await flushPromises();
      const body = new DOMWrapper(document.body);
      const report = body.get("[data-xlsx-confirmation-report]");
      expect(report.text()).toContain("12");
      expect(report.text()).toContain("10");
      expect(report.text()).toContain("Sheet1!B2");
      expect(report.text()).toContain("Sheet1.floatingImages[logo]");
      expect(report.text()).toContain("future-feature");
      expect(report.text()).not.toContain("xlsx.report");
      expect(body.findAll("[data-xlsx-issue]")).toHaveLength(2);
      await wrapper.setProps({ confirmation: "export" });
      await flushPromises();
      const confirm = body
        .findAll("button")
        .find(
          (button) =>
            button.text() === (locale === "en-US" ? "Continue and download" : "继续并下载"),
        );
      expect(confirm).toBeDefined();
      await confirm!.trigger("click");
      expect(wrapper.emitted("confirm")).toHaveLength(1);
      const cancel = body
        .findAll("button")
        .find((button) => button.text() === (locale === "en-US" ? "Cancel" : "取消"));
      await cancel!.trigger("click");
      expect(wrapper.emitted("cancel")).toHaveLength(1);
    },
  );

  test("shows blocking details without offering a continue action", async () => {
    const wrapper = mount(XlsxFileFeedback, {
      attachTo: createFeedbackHost(),
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        busy: false,
        feedback: { key: "xlsx.feedback.blocked", error: true },
        report: {
          issues: [
            {
              code: "feature-omitted",
              severity: "block",
              count: 1,
              locations: ["Sheet1.drawings[chart].chart.type"],
            },
          ],
        },
      },
    });
    mounted.push(wrapper);
    await flushPromises();
    const body = new DOMWrapper(document.body);
    expect(body.get("[data-xlsx-error]").text()).toContain("Compatibility checks");
    expect(body.get("[data-xlsx-error-report]").text()).toContain(
      "Sheet1.drawings[chart].chart.type",
    );
    expect(body.get("[data-xlsx-error-report]").text()).toContain("Blocked");
    expect(body.find(".t-dialog__footer").exists()).toBe(false);
    await body.get(".t-dialog__close").trigger("click");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  test.each(["en-US", "zh-CN"] as const)(
    "renders a numeric total's location and JSON backup guidance (%s)",
    async (locale) => {
      const wrapper = mount(XlsxFileFeedback, {
        attachTo: createFeedbackHost(),
        global: { plugins: [createAppI18n(locale)] },
        props: {
          busy: false,
          feedback: {
            key: "xlsx.feedback.numericTableTotals",
            error: true,
            locations: "Sheet1!E7 (Sales[Constant])",
          },
        },
      });
      mounted.push(wrapper);
      await flushPromises();
      const body = new DOMWrapper(document.body);
      expect(body.get("[data-xlsx-error]").text()).toContain("Sheet1!E7 (Sales[Constant])");
      expect(body.get("[data-xlsx-error]").text()).toContain("JSON");
      expect(body.get("[data-xlsx-error]").text()).not.toContain("{locations}");
      await body.get(".t-dialog__close").trigger("click");
      expect(wrapper.emitted("dismiss")).toHaveLength(1);
    },
  );
  test("asks to replace the document without extra details for a lossless import", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const host = createFeedbackHost();
    const wrapper = mount(XlsxFileFeedback, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        busy: false,
        confirmation: "import",
      },
    });
    mounted.push(wrapper);
    await flushPromises();

    expect(document.body.textContent).toContain("replace the current document");
    expect(document.body.textContent).toContain("Import XLSX workbook?");
    expect(document.body.textContent).not.toContain("compatibility");
    expect(document.querySelector("[data-xlsx-confirmation-report]")).toBeNull();
    expect(document.querySelector("[data-xlsx-feedback]")).toBeNull();
    expect(document.querySelector("[data-xlsx-report]")).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test("leaves no inline notice after the import dialog closes or export succeeds", async () => {
    const host = createFeedbackHost();
    const wrapper = mount(XlsxFileFeedback, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        busy: false,
        confirmation: "import",
      },
    });
    mounted.push(wrapper);
    await flushPromises();

    const body = new DOMWrapper(document.body);
    expect(body.findAll("[data-xlsx-confirmation-report]")).toHaveLength(0);
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
  });

  test("shows failures in a dismissible dialog without rendering a workspace banner", async () => {
    const host = createFeedbackHost();
    const wrapper = mount(XlsxFileFeedback, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        busy: false,
        feedback: { key: "xlsx.feedback.blocked", error: true },
      },
    });
    mounted.push(wrapper);
    await flushPromises();

    const body = new DOMWrapper(document.body);
    expect(body.get("[data-xlsx-error]").text()).toContain("Check its format and size");
    expect(body.find("[data-xlsx-error-report]").exists()).toBe(false);
    expect(host.textContent).toBe("");
    expect(body.find("[data-xlsx-feedback]").exists()).toBe(false);
    // Error dialogs intentionally have no footer. Exercise their actual titlebar close affordance.
    expect(body.find(".t-dialog__footer").exists()).toBe(false);
    await body.get(".t-dialog__close").trigger("click");
    expect(wrapper.emitted("dismiss")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("cancel")).toBeUndefined();
    await wrapper.setProps({ feedback: undefined });
    expect(body.find("[data-xlsx-error]").exists()).toBe(false);
    expect(body.text()).not.toContain("XLSX compatibility report");
  });
});
