import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import XlsxFileFeedback from "../../../modules/workbook-xlsx/components/XlsxFileFeedback.vue";
import type { useWorkbookXlsxActions } from "../../../modules/workbook-xlsx/useWorkbookXlsxActions";
import type {
  XlsxWorkerRequest,
  XlsxWorkerResponse,
} from "../../../modules/workbook-xlsx/xlsxWorkerProtocol";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

test("the real Workspace routes export compatibility details and cancel/confirm without replacing the document", async () => {
  const report = {
    issues: [
      {
        code: "image-omitted",
        severity: "warning" as const,
        count: 2,
        locations: ["Sheet1!A1", 'Sheet1.floatingImages["logo"]'],
      },
    ],
  };
  vi.stubGlobal(
    "Worker",
    class {
      onmessage: ((event: MessageEvent<XlsxWorkerResponse>) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      postMessage(request: XlsxWorkerRequest) {
        queueMicrotask(() =>
          this.onmessage?.(
            new MessageEvent<XlsxWorkerResponse>("message", {
              data: {
                id: request.id,
                type: "encode",
                ok: true,
                bytes: new Uint8Array([1, 2]).buffer,
                report,
              },
            }),
          ),
        );
      }
      terminate() {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-xlsx");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const replace = vi.fn(async () => ({ revision: 2, savedAt: 2 }));
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => undefined,
        save: async () => ({ revision: 1, savedAt: 1 }),
        replace,
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    await flushPromises();
    const state = (
      wrapper.vm.$ as unknown as {
        setupState: { xlsxActions: ReturnType<typeof useWorkbookXlsxActions> };
      }
    ).setupState;
    const feedback = wrapper.findComponent(XlsxFileFeedback);
    expect(feedback.props("report")).toBeUndefined();
    await state.xlsxActions.exportXlsx();
    await flushPromises();
    expect(feedback.props("confirmation")).toBe("export");
    expect(feedback.props("report")).toEqual(report);
    expect(document.body.querySelector("[data-xlsx-confirmation-report]")?.textContent).toContain(
      'Sheet1.floatingImages["logo"]',
    );
    expect(click).not.toHaveBeenCalled();
    feedback.vm.$emit("cancel");
    await flushPromises();
    expect(feedback.props("confirmation")).toBeUndefined();
    expect(feedback.props("report")).toBeUndefined();
    expect(click).not.toHaveBeenCalled();
    await state.xlsxActions.exportXlsx();
    await flushPromises();
    feedback.vm.$emit("confirm");
    await flushPromises();
    expect(click).toHaveBeenCalledOnce();
    expect(feedback.props("confirmation")).toBeUndefined();
    expect(replace).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
  }
});
