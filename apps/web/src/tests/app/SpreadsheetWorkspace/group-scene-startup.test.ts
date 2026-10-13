import { mount, flushPromises } from "@vue/test-utils";
import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ShapeGroupDrawing } from "@sheetcraft/core/shape-group";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { framedShape } from "../../modules/sheet-drawings/framed-shape-fixture";
import type { useWorkbookPersistence } from "../../../modules/workbook-persistence/useWorkbookPersistence";

test("real Workspace preserves unsupported shared-scene recovery without replacing or saving an empty workbook", async () => {
  const stored = createWorkbook({ id: "scene-recovery", sheetId: "scene-sheet" }),
    { shapeFrame, ...appearance } = framedShape(),
    group: ShapeGroupDrawing = {
      kind: "shapeGroup",
      id: "root",
      name: "Group",
      rotation: 0,
      shapeFrame,
      group3d: {
        rotation3d: {
          kind: "value",
          value: {
            projection: "parallel",
            xDeg: 30,
            yDeg: 0,
            zDeg: 0,
            distanceFromGroundPt: 0,
          },
        },
      },
      members: [
        {
          ...appearance,
          groupFrame: {
            kind: "shape-group-local-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
          },
        },
      ],
    };
  getActiveSheet(stored).drawings = [group];
  const snapshot = serializeWorkbook(stored),
    save = vi.fn(async () => ({ revision: 2, savedAt: 2 })),
    replace = vi.fn(async () => ({ revision: 2, savedAt: 2 }));
  const wrapper = mount(SpreadsheetWorkspace, {
    props: {
      workbookStore: { load: async () => ({ revision: 1, savedAt: 1, snapshot }), save, replace },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    await flushPromises();
    const state = (wrapper.vm.$ as unknown as { setupState: unknown }).setupState as {
      saveError: string | undefined;
      session: { workbook: ReturnType<typeof createWorkbook> };
      persistence: ReturnType<typeof useWorkbookPersistence>;
    };
    expect(state.saveError).toBe("unsupported-shape-frame");
    expect(state.session.workbook.id).not.toBe(stored.id);
    expect(await state.persistence.saveNow()).toBe(false);
    expect(await state.persistence.resetDocument()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(serializeWorkbook(stored)).toEqual(snapshot);
  } finally {
    wrapper.unmount();
    vi.restoreAllMocks();
  }
});
