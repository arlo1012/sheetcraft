import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, effectScope, h, type ComponentPublicInstance } from "vue";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSetFloatingImageCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createSheet,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type FloatingImage,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { useSheetImageActions } from "../../../modules/sheet-images/useSheetImageActions";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { prepareImageAsset } from "../../../modules/image-assets/prepareImageAsset";

vi.mock("../../../modules/image-assets/prepareImageAsset", () => ({ prepareImageAsset: vi.fn() }));
const file = new File(["fixture"], "synthetic.png", { type: "image/png" });
const asset = { id: "asset", blob: file, mimeType: "image/png", width: 200, height: 100 };
const cleanups: Array<() => void> = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const other = createSheet("Other", "other");
  insertSheet(session.workbook, other);
  let active = sheet;
  let generation = 0;
  const store = createMemoryImageAssetStore();
  const scope = effectScope();
  const execute = vi.fn((image: FloatingImage, sheetId: string) =>
    executeWorkbookCommand(session, createSetFloatingImageCommand(sheetId, image)),
  );
  const actions = scope.run(() =>
    useSheetImageActions({
      assetStore: store,
      getWorkbook: () => session.workbook,
      getSheet: () => active,
      getGeneration: () => generation,
      getAddress: () => ({ row: 0, column: 0 }),
      flushPendingEdits: () => true,
      setCellImage: vi.fn(() => true),
      setFloatingImage: execute,
      convertCellImageToFloating: vi.fn(() => true),
    }),
  )!;
  cleanups.push(() => scope.stop());
  return {
    session,
    sheet,
    other,
    store,
    actions,
    execute,
    scope,
    navigate: () => {
      active = other;
      generation += 1;
    },
    returnToSheet: () => {
      active = sheet;
      generation += 1;
    },
  };
}
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset);
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

describe("picture image-operation owners", () => {
  test.each(["sheet", "visit-back", "cancel", "dispose"] as const)(
    "delayed decoding does not edit or store after %s",
    async (change) => {
      const f = fixture();
      const pending = deferred<typeof asset>();
      vi.mocked(prepareImageAsset).mockReturnValue(pending.promise);
      const before = serializeWorkbook(f.session.workbook);
      const inserting = f.actions.insertFile(file);
      if (change === "sheet" || change === "visit-back") f.navigate();
      if (change === "visit-back") f.returnToSheet();
      if (change === "cancel") f.actions.cancelPending();
      if (change === "dispose") f.scope.stop();
      pending.resolve(asset);
      await inserting;
      expect(f.execute).not.toHaveBeenCalled();
      expect(await f.store.get(asset.id)).toBeUndefined();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.actions.busy.value).toBe(false);
    },
  );
  test("stale decoding failure leaves a newer feedback message intact", async () => {
    const f = fixture();
    const pending = deferred<typeof asset>();
    vi.mocked(prepareImageAsset).mockReturnValue(pending.promise);
    const inserting = f.actions.insertFile(file);
    f.actions.cancelPending();
    f.actions.reportFeedback("picture.noSmaller");
    pending.reject(new Error("late decode"));
    await inserting;
    expect(f.actions.feedback.value).toBe("picture.noSmaller");
  });
  test.each(["paste", "convert"] as const)(
    "late missing %s asset does not replace a new owner message",
    async (kind) => {
      const f = fixture();
      const pending = deferred<undefined>();
      vi.spyOn(f.store, "get").mockReturnValue(pending.promise);
      const image: FloatingImage = {
        id: "copied",
        assetId: "missing",
        altText: "",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 200,
        height: 100,
      };
      if (kind === "convert")
        setCellContent(
          f.sheet,
          { row: 0, column: 0 },
          {
            kind: "image",
            image: { assetId: image.assetId, altText: image.altText, transform: image.transform },
          },
        );
      const operation =
        kind === "paste"
          ? f.actions.pasteFloatingImage(image)
          : f.actions.convertCellImageToFloating({ row: 0, column: 0 });
      f.navigate();
      f.actions.reportFeedback("picture.noSmaller");
      pending.resolve(undefined);
      await operation;
      expect(f.actions.feedback.value).toBe("picture.noSmaller");
      expect(f.execute).not.toHaveBeenCalled();
    },
  );
  test("keyed native picker rejects an old input's change/cancel without consuming the new request", async () => {
    const f = fixture();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h("input", {
            type: "file",
            key: f.actions.pickerKey.value,
            ref: (node: Element | ComponentPublicInstance | null) => {
              f.actions.fileInput.value = node as HTMLInputElement | null;
            },
            onChange: f.actions.onFileChange,
            onCancel: f.actions.onFileCancel,
          }),
      }),
    );
    cleanups.push(() => wrapper.unmount());
    await f.actions.requestInsert("floating");
    const old = wrapper.element as HTMLInputElement;
    await f.actions.requestInsert("floating");
    const current = wrapper.element as HTMLInputElement;
    expect(current).not.toBe(old);
    Object.defineProperty(old, "files", { value: [file] });
    f.actions.onFileChange({ target: old } as unknown as Event);
    f.actions.onFileCancel({ target: old } as unknown as Event);
    expect(prepareImageAsset).not.toHaveBeenCalled();
    Object.defineProperty(current, "files", { value: [file] });
    current.dispatchEvent(new Event("change"));
    await flushPromises();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("current picker cancel and click failure revoke pending insertion", async () => {
    const f = fixture();
    const input = document.createElement("input");
    input.type = "file";
    f.actions.fileInput.value = input;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    await f.actions.requestInsert("floating");
    f.actions.onFileCancel({ target: input } as unknown as Event);
    Object.defineProperty(input, "files", { value: [file] });
    f.actions.onFileChange({ target: input } as unknown as Event);
    expect(prepareImageAsset).not.toHaveBeenCalled();
    click.mockImplementation(() => {
      throw new Error("picker failure");
    });
    await expect(f.actions.requestInsert("floating")).resolves.toBeUndefined();
    expect(f.actions.feedback.value).toBe("image.insertionFailed");
    f.actions.onFileChange({ target: input } as unknown as Event);
    expect(prepareImageAsset).not.toHaveBeenCalled();
  });
});
