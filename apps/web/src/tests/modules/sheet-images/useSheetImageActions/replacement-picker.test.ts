import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, type ComponentPublicInstance } from "vue";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { prepareImageAsset } from "../../../../modules/image-assets/prepareImageAsset";
import { asset, file, fixture } from "./replacement-fixture";

vi.mock("../../../../modules/image-assets/prepareImageAsset", () => ({
  prepareImageAsset: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(prepareImageAsset).mockReset().mockResolvedValue(asset);
});
afterEach(() => vi.restoreAllMocks());

function picker(f: ReturnType<typeof fixture>) {
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
  return mount(
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
}
function change(f: ReturnType<typeof fixture>, input: HTMLInputElement) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  f.actions.onFileChange({ target: input } as unknown as Event);
}

describe("source replacement native picker ownership", () => {
  test("an old replacement input change or cancellation cannot consume a newer owned replacement", async () => {
    const f = fixture();
    const wrapper = picker(f);
    await f.actions.requestReplace("framed");
    const oldInput = wrapper.element as HTMLInputElement;
    f.selectOwned();
    await f.actions.requestReplace(f.leafPath[0]!, f.leafPath);
    const current = wrapper.element as HTMLInputElement;
    expect(current).not.toBe(oldInput);
    expect(current.multiple).toBe(false);
    change(f, oldInput);
    f.actions.onFileCancel({ target: oldInput } as unknown as Event);
    expect(prepareImageAsset).not.toHaveBeenCalled();
    change(f, current);
    await flushPromises();
    expect(f.currentLeaf().assetId).toBe(asset.id);
    expect(f.currentFramed().assetId).toBe("old");
    expect(f.session.history.undoStack).toHaveLength(1);
    wrapper.unmount();
    f.scope.stop();
  });
  test.each([
    "source",
    "crop",
    "selection",
    "permission",
    "same-id-sheet",
    "generation",
    "cancel",
    "dispose",
  ] as const)("%s changing while the picker is open refuses before decoding", async (kind) => {
    const f = fixture();
    const wrapper = picker(f);
    await f.actions.requestReplace("framed");
    const input = wrapper.element as HTMLInputElement;
    if (kind === "source") f.currentFramed().assetId = "new-source";
    if (kind === "crop") f.currentFramed().frame.source.widthRatio = 4;
    if (kind === "selection") f.selectOwned();
    if (kind === "permission") f.sheet.properties.protected = true;
    if (kind === "same-id-sheet") f.replaceSheet({ ...f.sheet });
    if (kind === "generation") f.changeGeneration();
    if (kind === "cancel") f.actions.onFileCancel({ target: input } as unknown as Event);
    if (kind === "dispose") f.scope.stop();
    const before = serializeWorkbook(f.session.workbook);
    change(f, input);
    await flushPromises();
    expect(prepareImageAsset).not.toHaveBeenCalled();
    expect(f.put).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    wrapper.unmount();
    f.scope.stop();
  });
  test.each([
    "container",
    "subgroup",
    "missing-context",
    "invalid-metrics",
    "wrong-path",
    "multi-selection",
  ] as const)(
    "%s replacement is unsupported before editor flush or picker/source work",
    async (kind) => {
      const f = fixture();
      const wrapper = picker(f);
      let id = "framed";
      let path: readonly string[] | undefined;
      if (kind === "container") {
        id = f.leafPath[0]!;
        f.select(id);
      }
      if (kind === "subgroup") {
        const group = f.currentGroup();
        const members = group.members.splice(0);
        group.members.push({
          kind: "grouped-group-v1",
          id: "subgroup",
          altText: "Subgroup",
          frame: {
            kind: "group-local-frame-v1",
            angleDeg: 0,
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          },
          members,
        });
        id = group.id;
        path = [id, "subgroup"];
        f.select(id, path);
      }
      if (kind === "missing-context") f.setContext(undefined);
      if (kind === "invalid-metrics")
        (f.getContext()!.metrics.rows as { count: number }).count = NaN;
      if (kind === "wrong-path") {
        id = f.leafPath[0]!;
        path = [id, "missing-leaf"];
        f.select(id, path);
      }
      if (kind === "multi-selection") f.setSelectedIds(["framed", "legacy"]);
      expect(f.actions.canReplace(id, path)).toBe(false);
      await f.actions.requestReplace(id, path);
      expect(f.flush).not.toHaveBeenCalled();
      expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled();
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.actions.feedback.value).toBe("picture.operationFailed");
      wrapper.unmount();
      f.scope.stop();
    },
  );
  test.each(["accessor", "iterator", "sparse", "over-budget"] as const)(
    "%s paths refuse before executing path code or opening the picker",
    async (kind) => {
      const f = fixture();
      const wrapper = picker(f);
      const read = vi.fn(() => f.leafPath[1]);
      const path = [...f.leafPath];
      if (kind === "accessor") Object.defineProperty(path, "1", { get: read });
      if (kind === "iterator") Object.defineProperty(path, Symbol.iterator, { value: read });
      if (kind === "sparse") delete path[1];
      if (kind === "over-budget")
        path.push(...Array.from({ length: 40 }, (_, index) => `owner-${index}`));
      await f.actions.requestReplace(f.leafPath[0]!, path);
      expect(read).not.toHaveBeenCalled();
      expect(f.flush).not.toHaveBeenCalled();
      expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled();
      expect(prepareImageAsset).not.toHaveBeenCalled();
      wrapper.unmount();
      f.scope.stop();
    },
  );
  test.each(["picker", "direct"] as const)(
    "%s capture refuses a same-ID Sheet replacement during editor flush",
    async (kind) => {
      const f = fixture();
      const wrapper = picker(f);
      f.flush.mockImplementation(() => {
        f.replaceSheet({ ...f.sheet });
        return true;
      });
      if (kind === "picker") await f.actions.requestReplace("framed");
      else await f.actions.insertFile(file, "floating", undefined, "framed");
      expect(HTMLInputElement.prototype.click).not.toHaveBeenCalled();
      expect(prepareImageAsset).not.toHaveBeenCalled();
      expect(f.put).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      wrapper.unmount();
      f.scope.stop();
    },
  );
  test("exact leaf paths can be queried using the root ID or actual leaf ID", () => {
    const f = fixture();
    f.selectOwned();
    expect(f.actions.canReplace(f.leafPath[0]!, f.leafPath)).toBe(true);
    expect(f.actions.canReplace(f.leafPath[1]!, f.leafPath)).toBe(true);
    f.scope.stop();
  });
});
