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
  test("only asks to replace the document when importing without compatibility details", async () => {
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
