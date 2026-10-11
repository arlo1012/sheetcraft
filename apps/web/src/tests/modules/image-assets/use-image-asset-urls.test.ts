import { actualPng, png } from "./image-header-fixtures";
import { createApp, nextTick, ref, type Ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type { ImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import {
  collectWorkbookImageAssetIds,
  useImageAssetUrls,
} from "../../../modules/image-assets/useImageAssetUrls";
import { DEFAULT_SHEET_WATERMARK } from "@sheetcraft/core/page-decoration";
function imageWorkbook(id: string): Workbook {
  const workbook = createWorkbook({ id: `book-${id}`, sheetId: "sheet", sheetName: "Sheet" });
  setCellContent(
    getActiveSheet(workbook),
    { row: 0, column: 0 },
    { kind: "image", image: { assetId: id, altText: "" } },
  );
  return workbook;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}
function mount(workbook: Ref<Workbook>, store: ImageAssetStore) {
  let value!: ReturnType<typeof useImageAssetUrls>;
  const app = createApp({
    setup: () => {
      value = useImageAssetUrls(() => workbook.value, store);
      return () => null;
    },
  });
  app.mount(document.createElement("div"));
  return { value, unmount: () => app.unmount() };
}
const asset = (id: string) => ({
  id,
  mimeType: "image/png",
  width: 1,
  height: 1,
  blob: new Blob([actualPng], { type: "image/png" }),
});
afterEach(() => vi.unstubAllGlobals());
describe("useImageAssetUrls", () => {
  test("retains pictures used only by saved watermark presets", () => {
    const workbook = createWorkbook({ id: "preset-book", sheetId: "sheet" });
    workbook.watermarkPresets = [
      {
        id: "logo-preset",
        name: "Logo",
        watermark: {
          ...DEFAULT_SHEET_WATERMARK,
          image: { assetId: "saved-logo", scale: null, washout: true, angle: 0 },
        },
      },
    ];
    expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set(["saved-logo"]));
  });
  test("collects image-only watermarks for display and portable saves", () => {
    const workbook = createWorkbook({ id: "watermarked", sheetId: "sheet" });
    getActiveSheet(workbook).pageDecoration = {
      watermark: {
        ...DEFAULT_SHEET_WATERMARK,
        image: { assetId: "logo", scale: null, washout: true, angle: 0 },
      },
    };
    expect(collectWorkbookImageAssetIds(workbook)).toEqual(new Set(["logo"]));
  });
  test("keeps a URL for the same image through unrelated workbook edits", async () => {
    const workbook = ref(imageWorkbook("asset"));
    const create = vi.fn(() => "blob:asset");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    const fixture = mount(workbook, { get: async () => asset("asset"), put: async () => {} });
    await fixture.value.refresh();
    const count = create.mock.calls.length;
    setCellContent(
      getActiveSheet(workbook.value),
      { row: 4, column: 4 },
      { kind: "literal", value: "unrelated" },
    );
    await fixture.value.refresh();
    expect(create).toHaveBeenCalledTimes(count);
    expect(fixture.value.urls.value.get("asset")).toBe("blob:asset");
    fixture.unmount();
  });
  test("does not leak a URL from a stale load after switch and disposal", async () => {
    const pending = deferred<ReturnType<typeof asset> | undefined>();
    const workbook = ref(imageWorkbook("old"));
    const create = vi.fn(() => "blob:late");
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    const fixture = mount(workbook, { get: () => pending.promise, put: async () => {} });
    workbook.value = imageWorkbook("new");
    await nextTick();
    fixture.unmount();
    pending.resolve(asset("old"));
    await Promise.resolve();
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });
  test.each(["bad-header", "pixel-limit"] as const)(
    "does not expose %s stored bytes to a decoder",
    async (failure) => {
      const workbook = ref(imageWorkbook("bad"));
      const create = vi.fn();
      vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
      const bytes = failure === "bad-header" ? new Uint8Array([1, 2, 3]) : png(16385, 1);
      const fixture = mount(workbook, {
        get: async () => ({ ...asset("bad"), blob: new Blob([bytes]) }),
        put: async () => {},
      });
      await fixture.value.refresh();
      expect(create).not.toHaveBeenCalled();
      expect(fixture.value.missing.value.has("bad")).toBe(true);
      fixture.unmount();
    },
  );
  test("a generation change during header reading cannot leak a source URL", async () => {
    const pending = deferred<ArrayBuffer>();
    const workbook = ref(imageWorkbook("old"));
    const create = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: vi.fn() });
    const original = asset("old");
    vi.spyOn(original.blob, "arrayBuffer").mockReturnValue(pending.promise);
    const fixture = mount(workbook, { get: async () => original, put: async () => {} });
    const reading = fixture.value.refresh();
    await Promise.resolve();
    await Promise.resolve();
    fixture.unmount();
    pending.resolve(actualPng.slice().buffer);
    await reading;
    expect(create).not.toHaveBeenCalled();
  });
  test("marks rejected asset lookups as missing", async () => {
    const workbook = ref(imageWorkbook("broken"));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() });
    const fixture = mount(workbook, {
      get: async () => Promise.reject(new Error("read failed")),
      put: async () => {},
    });
    await fixture.value.refresh();
    expect(fixture.value.missing.value).toEqual(new Set(["broken"]));
    fixture.unmount();
  });
});
