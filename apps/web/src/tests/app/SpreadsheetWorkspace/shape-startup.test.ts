import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import type { useShapeCreation } from "../../../modules/sheet-drawings/useShapeCreation";
import { SHAPE_GALLERY } from "../../../modules/sheet-drawings/shape-gallery";
import { createAppI18n } from "../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

// Mount the real Workspace and its children: no shape-creation or watch mocks.
function setupState(wrapper: VueWrapper) {
  return (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
    shapeCreation: ReturnType<typeof useShapeCreation>;
    shapeInteractionBlocked: boolean;
    fileActions: ReturnType<
      typeof import("../../../modules/workbook-persistence/useWorkbookFileActions").useWorkbookFileActions
    >;
    xlsxActions: ReturnType<
      typeof import("../../../modules/workbook-xlsx/useWorkbookXlsxActions").useWorkbookXlsxActions
    >;
    session: { workbook: ReturnType<typeof createWorkbook> };
  };
}
function fixture(
  load: () => Promise<
    | undefined
    | { revision: number; savedAt: number; snapshot: ReturnType<typeof serializeWorkbook> }
  >,
) {
  const wrapper = mount(SpreadsheetWorkspace, {
    props: {
      workbookStore: {
        load,
        save: vi.fn(async () => ({ revision: 1, savedAt: 1 })),
        replace: vi.fn(async () => ({ revision: 1, savedAt: 1 })),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe("Workspace shape startup", () => {
  test("initializes the real shape watch before persistence resolves and keeps all busy gates", async () => {
    let finishLoad!: (value: undefined) => void;
    const wrapper = fixture(
      () =>
        new Promise<undefined>((resolve) => {
          finishLoad = resolve;
        }),
    );
    const state = setupState(wrapper);
    const choice = SHAPE_GALLERY[0]!.items[0]!;
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    expect(state.shapeCreation.request.value).toBeUndefined();
    await flushPromises();
    finishLoad(undefined);
    await flushPromises();
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    expect(state.shapeCreation.request.value?.choice).toBe(choice);
    let rejectJson!: (error: Error) => void;
    const jsonPending = state.fileActions.importJson({
      text: () =>
        new Promise<string>((_, reject) => {
          rejectJson = reject;
        }),
    });
    expect(state.shapeCreation.request.value).toBeUndefined();
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    rejectJson(new Error("Synthetic read cancelled"));
    await jsonPending;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    let rejectBytes!: (error: Error) => void;
    const xlsxPending = state.xlsxActions.importXlsx({
      size: 1,
      arrayBuffer: () =>
        new Promise<ArrayBuffer>((_, reject) => {
          rejectBytes = reject;
        }),
    });
    expect(state.shapeCreation.request.value).toBeUndefined();
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    rejectBytes(new Error("Synthetic read cancelled"));
    await xlsxPending;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    state.shapeInteractionBlocked = true;
    expect(state.shapeCreation.request.value).toBeUndefined();
    expect(state.shapeCreation.start(choice, false)).toBe(false);
    state.shapeInteractionBlocked = false;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    state.shapeCreation.cancel();
    expect(getActiveSheet(state.session.workbook).drawings ?? []).toEqual([]);
  });
  test("starts from a saved workbook and creates a shape through the real command port", async () => {
    const workbook = createWorkbook({ id: "startup", sheetId: "startup-sheet" });
    const wrapper = fixture(async () => ({
      revision: 1,
      savedAt: 1,
      snapshot: serializeWorkbook(workbook),
    }));
    await flushPromises();
    const state = setupState(wrapper);
    const choice = SHAPE_GALLERY[0]!.items[0]!;
    expect(state.shapeCreation.start(choice, false)).toBe(true);
    const request = state.shapeCreation.request.value!;
    expect(
      state.shapeCreation.commit(request, {
        ...request.base,
        shapeGeometry: { preset: "line" },
        width: 100,
        height: 50,
      }),
    ).toBe(true);
    expect(getActiveSheet(state.session.workbook).drawings).toHaveLength(1);
    expect(state.shapeCreation.request.value).toBeUndefined();
  });
});
