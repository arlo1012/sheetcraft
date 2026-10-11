import { actualPng, png } from "./image-header-fixtures";
import { createApp, nextTick, ref, type Ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  type LegacyFloatingImage,
  type Workbook,
} from "@sheetcraft/core/workbook";
import type {
  GroupedGroup,
  GroupedPicture,
  PictureGroup,
  PictureGroupChild,
} from "@sheetcraft/core/picture-group";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
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
function floatingImage(id: string, assetId: string): LegacyFloatingImage {
  return {
    id,
    assetId,
    altText: "",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 100,
  };
}
function groupedPicture(id: string, assetId: string): GroupedPicture {
  return {
    kind: "grouped-picture-v1",
    id,
    assetId,
    altText: "",
    frame: {
      kind: "group-member-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      angleDeg: 0,
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
    },
  };
}
function groupedGroup(id: string, members: PictureGroupChild[]): GroupedGroup {
  return {
    kind: "grouped-group-v1",
    id,
    altText: "",
    frame: {
      kind: "group-local-frame-v1",
      rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
      angleDeg: 0,
    },
    members,
  };
}
function pictureGroup(id: string, members: PictureGroupChild[]): PictureGroup {
  return {
    kind: "picture-group-v1",
    id,
    altText: "",
    frame: {
      kind: "group-frame-v1",
      anchor: { mode: "fixed", x: 0, y: 0, size: { width: 100, height: 100 } },
      angleDeg: 0,
    },
    members,
  };
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
  test("collects nested hidden group leaves alongside all existing image references", () => {
    const workbook = imageWorkbook("shared");
    workbook.watermarkPresets = [
      {
        id: "saved-preset",
        name: "Saved",
        watermark: {
          ...DEFAULT_SHEET_WATERMARK,
          image: { assetId: "saved", scale: null, washout: true, angle: 0 },
        },
      },
    ];
    const sheet = getActiveSheet(workbook);
    sheet.pageDecoration = {
      backgroundAssetId: "background",
      watermark: {
        ...DEFAULT_SHEET_WATERMARK,
        image: { assetId: "watermark", scale: null, washout: true, angle: 0 },
      },
    };
    const hiddenLeaf = { ...groupedPicture("hidden-leaf", "hidden"), hidden: true };
    const nested = { ...groupedGroup("nested", [hiddenLeaf]), hidden: true };
    const group = {
      ...pictureGroup("root", [
        groupedPicture("shared-leaf", "shared"),
        groupedPicture("reused-leaf", "shared"),
        nested,
      ]),
      hidden: true,
    };
    const framed: FramedFloatingImage = {
      id: "framed",
      assetId: "framed-asset",
      altText: "",
      frame: {
        kind: "object-frame-v1",
        anchor: { mode: "fixed", x: 0, y: 0, size: { width: 100, height: 100 } },
        source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
        angleDeg: 0,
      },
    };
    sheet.floatingImages = [floatingImage("legacy", "legacy-asset"), framed, group];
    const second = createWorkbook({ id: "second-book", sheetId: "second-sheet" });
    const secondSheet = getActiveSheet(second);
    secondSheet.floatingImages = [
      pictureGroup("second-root", [groupedPicture("second-leaf", "second-asset")]),
    ];
    workbook.sheets.set(secondSheet.id, secondSheet);

    expect(collectWorkbookImageAssetIds(workbook)).toEqual(
      new Set([
        "shared",
        "saved",
        "background",
        "watermark",
        "legacy-asset",
        "framed-asset",
        "hidden",
        "second-asset",
      ]),
    );
    expect(sheet.floatingImages[2]).toBe(group);
    expect(group.members[2]).toBe(nested);
    expect(nested.members[0]).toBe(hiddenLeaf);
  });
  test("keeps existing URLs through grouping, hidden nesting, and ungrouping", async () => {
    const workbook = ref(createWorkbook({ id: "grouping-book", sheetId: "sheet" }));
    const sheet = getActiveSheet(workbook.value);
    sheet.floatingImages = [floatingImage("first", "first"), floatingImage("second", "second")];
    const get = vi.fn(async (id: string) => asset(id));
    const create = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const fixture = mount(workbook, { get, put: async () => {} });
    await fixture.value.refresh();
    const original = new Map(fixture.value.urls.value);

    sheet.floatingImages = [
      pictureGroup("root", [
        groupedPicture("first", "first"),
        {
          ...groupedGroup("nested", [{ ...groupedPicture("second", "second"), hidden: true }]),
          hidden: true,
        },
      ]),
    ];
    await nextTick();
    await fixture.value.refresh();
    expect(fixture.value.urls.value).toEqual(original);
    expect(revoke).not.toHaveBeenCalled();

    sheet.floatingImages = [floatingImage("second", "second"), floatingImage("first", "first")];
    await nextTick();
    await fixture.value.refresh();
    expect(fixture.value.urls.value).toEqual(original);
    expect(create).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(2);
    expect(revoke).not.toHaveBeenCalled();
    fixture.unmount();
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith("blob:first");
    expect(revoke).toHaveBeenCalledWith("blob:second");
  });
  test("releases a removed group leaf while retaining an asset shared with cell content", async () => {
    const workbook = ref(imageWorkbook("shared"));
    const sheet = getActiveSheet(workbook.value);
    sheet.floatingImages = [
      pictureGroup("root", [
        groupedPicture("shared-leaf", "shared"),
        groupedPicture("removed-leaf", "removed"),
      ]),
    ];
    const get = vi.fn(async (id: string) => asset(id));
    const create = vi.fn().mockReturnValueOnce("blob:shared").mockReturnValueOnce("blob:removed");
    const revoke = vi.fn();
    const put = vi.fn(async () => {});
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const fixture = mount(workbook, { get, put });
    await fixture.value.refresh();

    sheet.floatingImages = [];
    await nextTick();
    await fixture.value.refresh();
    expect(fixture.value.urls.value).toEqual(new Map([["shared", "blob:shared"]]));
    expect(revoke).toHaveBeenCalledWith("blob:removed");
    expect(revoke).not.toHaveBeenCalledWith("blob:shared");
    expect(create).toHaveBeenCalledTimes(2);
    expect(get.mock.calls).toEqual([["shared"], ["removed"]]);
    expect(put).not.toHaveBeenCalled();
    fixture.unmount();
  });
  test("does not publish a delayed group leaf from an older workbook generation", async () => {
    const pending = deferred<ReturnType<typeof asset> | undefined>();
    const oldBook = createWorkbook({ id: "old-group-book", sheetId: "sheet" });
    getActiveSheet(oldBook).floatingImages = [
      pictureGroup("old-root", [groupedPicture("old-leaf", "old")]),
    ];
    const workbook = ref(oldBook);
    const get = vi.fn((id: string) =>
      id === "old" ? pending.promise : Promise.resolve(asset(id)),
    );
    const create = vi.fn(() => "blob:new");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const fixture = mount(workbook, { get, put: async () => {} });
    const stale = fixture.value.refresh();

    workbook.value = imageWorkbook("new");
    await nextTick();
    await fixture.value.refresh();
    pending.resolve(asset("old"));
    await stale;
    expect(fixture.value.urls.value).toEqual(new Map([["new", "blob:new"]]));
    expect(fixture.value.loading.value).toEqual(new Set());
    expect(fixture.value.missing.value).toEqual(new Set());
    expect(get.mock.calls).toEqual([["old"], ["new"]]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    fixture.unmount();
  });
  test("reuses an in-flight shared asset read when a group is replaced by cell content", async () => {
    const pending = deferred<ReturnType<typeof asset> | undefined>();
    const grouped = createWorkbook({ id: "pending-group-book", sheetId: "sheet" });
    getActiveSheet(grouped).floatingImages = [
      pictureGroup("root", [groupedPicture("first", "shared"), groupedPicture("second", "shared")]),
    ];
    const workbook = ref(grouped);
    const get = vi.fn(() => pending.promise);
    const create = vi.fn(() => "blob:shared");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const fixture = mount(workbook, { get, put: async () => {} });
    const stale = fixture.value.refresh();

    workbook.value = imageWorkbook("shared");
    await nextTick();
    const latest = fixture.value.refresh();
    pending.resolve(asset("shared"));
    await Promise.all([stale, latest]);
    expect(fixture.value.urls.value).toEqual(new Map([["shared", "blob:shared"]]));
    expect(fixture.value.loading.value).toEqual(new Set());
    expect(fixture.value.missing.value).toEqual(new Set());
    expect(get.mock.calls).toEqual([["shared"]]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    fixture.unmount();
  });
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
