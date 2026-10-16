import { webcrypto } from "node:crypto";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, type Workbook } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createMemoryImageAssetStore } from "../../../../modules/image-assets/imageAssetStore";
import { useWorkbookXlsxActions } from "../../../../modules/workbook-xlsx/useWorkbookXlsxActions";
import XlsxFileFeedback from "../../../../modules/workbook-xlsx/components/XlsxFileFeedback.vue";
import type { XlsxWorkerPort } from "../../../../modules/workbook-xlsx/workbookXlsxWorker";
import { createAppI18n, type AppLocale } from "../../../../shared/i18n";
import { actualPng } from "../../image-assets/image-header-fixtures";
import { framedPicture } from "../../sheet-images/framed-picture-fixture";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function fixture(locale: AppLocale = "en-US", mode: "move-only" | "move-and-size" = "move-only") {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:decoded"), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 2;
      naturalHeight = 1;
      onload?: () => void;
      set src(value: string) {
        if (value) queueMicrotask(() => this.onload?.());
      }
    },
  );
  const incoming = createWorkbook({ id: "incoming", sheetId: "images" });
  const picture = framedPicture();
  picture.assetId = "temporary-image";
  const start = { column: { index: 0, offset: 110.25 }, row: { index: 0, offset: 30.5 } };
  picture.frame.anchor =
    mode === "move-only"
      ? { mode, offsetMode: "free-pixels", origin: start, size: { width: 80, height: 40 } }
      : {
          mode,
          offsetMode: "free-pixels",
          start,
          end: { column: { index: 2, offset: 40 }, row: { index: 3, offset: 5 } },
        };
  getActiveSheet(incoming).floatingImages = [picture];
  const snapshot = serializeWorkbook(incoming);
  const report = {
    issues: [
      {
        code: "picture-geometry-approximated",
        severity: "warning" as const,
        count: 1,
        locations: ['xl/drawings/drawing1.xml/picture["native-marker"]'],
      },
    ],
  };
  let workbook = createWorkbook({ id: "original", sheetId: "original-sheet" });
  const original = workbook;
  let revision = 1;
  const assetStore = createMemoryImageAssetStore();
  const put = vi.spyOn(assetStore, "put");
  const putAll = assetStore.putAll ? vi.spyOn(assetStore, "putAll") : undefined;
  const replaceDocument = vi.fn(async (next: Workbook) => {
    workbook = next;
    revision++;
  });
  const port: XlsxWorkerPort = {
    onerror: null,
    onmessage: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage(request) {
      queueMicrotask(() =>
        port.onmessage?.({
          data: {
            id: request.id,
            ok: true,
            type: "decode",
            snapshot,
            images: [
              {
                assetId: "temporary-image",
                bytes: new Uint8Array(actualPng).buffer,
                extension: "png",
              },
            ],
            report,
          },
        } as MessageEvent),
      );
    },
  };
  let actions!: ReturnType<typeof useWorkbookXlsxActions>;
  const wrapper = mount(
    defineComponent({
      setup() {
        actions = useWorkbookXlsxActions({
          persistence: { loading: ref(false), replaceDocument } as never,
          getWorkbook: () => workbook,
          getRevision: () => revision,
          flushPendingEdits: () => true,
          hasPendingEdits: () => false,
          workerFactory: () => port,
          assetStore,
        });
        return () =>
          h(XlsxFileFeedback, {
            busy: actions.busy.value,
            confirmation: actions.confirmation.value,
            feedback: actions.feedback.value,
            report: actions.report.value,
            onConfirm: () => {
              void actions.confirm();
            },
            onCancel: actions.cancel,
            onDismiss: actions.dismissFeedback,
          });
      },
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n(locale)] } },
  );
  mounted.push(wrapper);
  return {
    actions,
    wrapper,
    original,
    picture,
    snapshot,
    report,
    put,
    putAll,
    replaceDocument,
    getWorkbook: () => workbook,
    start: async () => {
      await actions.importXlsx({
        size: 3,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });
      await flushPromises();
    },
  };
}

describe("native free-pixel picture import confirmation", () => {
  test.each([
    { locale: "en-US" as const, explanation: "Picture positions or sizes", cancel: "Cancel" },
    { locale: "zh-CN" as const, explanation: "图片位置或尺寸", cancel: "取消" },
  ])(
    "$locale explains picture changes before confirmation and cancel has no document or asset writes",
    async ({ locale, explanation, cancel }) => {
      const f = fixture(locale);
      await f.start();
      expect(f.actions.confirmation.value).toBe("import");
      expect(f.actions.report.value).toEqual(f.report);
      const details = document.body.querySelector("[data-xlsx-confirmation-report]");
      expect(details?.textContent).toContain(explanation);
      expect(details?.textContent).toContain(f.report.issues[0]!.locations[0]);
      expect(f.getWorkbook()).toBe(f.original);
      expect(f.put).not.toHaveBeenCalled();
      expect(f.putAll).not.toHaveBeenCalled();
      expect(f.replaceDocument).not.toHaveBeenCalled();
      const button = Array.from(document.body.querySelectorAll("button")).find(
        (entry) => entry.textContent?.trim() === cancel,
      );
      expect(button).toBeDefined();
      button!.click();
      await flushPromises();
      expect(f.actions.confirmation.value).toBeUndefined();
      await f.actions.confirm();
      expect(f.getWorkbook()).toBe(f.original);
      expect(f.put).not.toHaveBeenCalled();
      expect(f.putAll).not.toHaveBeenCalled();
      expect(f.replaceDocument).not.toHaveBeenCalled();
    },
  );

  test.each(["move-only", "move-and-size"] as const)(
    "confirmed %s imports persist V86 with raw markers and policy intact",
    async (mode) => {
      const f = fixture("en-US", mode);
      await f.start();
      await f.actions.confirm();
      expect(f.actions.feedback.value?.error).not.toBe(true);
      expect(f.putAll).toHaveBeenCalledOnce();
      expect(f.replaceDocument).toHaveBeenCalledOnce();
      const saved = serializeWorkbook(f.getWorkbook());
      expect(saved.version).toBe(86);
      expect(saved.sheets[0]?.floatingImages?.[0]).toMatchObject({
        assetId: expect.stringMatching(/^image-[a-f0-9]{64}$/),
        frame: f.picture.frame,
      });
      expect(f.snapshot.sheets[0]?.floatingImages?.[0]).toMatchObject({
        assetId: "temporary-image",
        frame: f.picture.frame,
      });
    },
  );
});

test("an unknown compatibility issue still renders its code and location without crashing", async () => {
  const wrapper = mount(XlsxFileFeedback, {
    attachTo: document.body,
    props: {
      busy: false,
      confirmation: "import",
      report: {
        issues: [
          {
            code: "future-picture-warning",
            severity: "warning",
            count: 1,
            locations: ["xl/drawings/drawing2.xml/picture[2]"],
          },
        ],
      },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  const details = document.body.querySelector("[data-xlsx-confirmation-report]");
  expect(details?.textContent).toContain("Unsupported content (future-picture-warning)");
  expect(details?.textContent).toContain("xl/drawings/drawing2.xml/picture[2]");
});
