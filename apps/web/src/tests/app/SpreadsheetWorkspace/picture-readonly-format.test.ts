import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSetSheetProtectionCommand } from "@sheetcraft/core/commands";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import type { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetOwnedPictureGroupLayer from "../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import PictureOwnedLeafRibbon from "../../../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import PictureFormatPane from "../../../modules/sheet-images/components/format-pane/PictureFormatPane.vue";
import type { PictureFormatIntent } from "../../../modules/sheet-images/picture-format-pane-model";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { pictureGroup } from "../../modules/sheet-images/picture-group-fixture";
import { actualPng } from "../../modules/image-assets/image-header-fixtures";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
type Controller = ReturnType<typeof useSpreadsheetWorkspaceController>;

test("protected owned properties stay viewable without committing crop or any workbook history", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-focus");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const workbook = createWorkbook({ id: "focus-workbook", sheetId: "focus-sheet" }),
    group = pictureGroup();
  getActiveSheet(workbook).floatingImages = [group];
  const assets = createMemoryImageAssetStore();
  await assets.put({
    id: "synthetic-asset",
    mimeType: "image/png",
    width: 120,
    height: 80,
    blob: new Blob([new Uint8Array(actualPng)], { type: "image/png" }),
  });
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: async () => ({ revision: 2, savedAt: 2 }),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: assets,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  try {
    await flushPromises();
    const grid = wrapper.getComponent(SheetGrid);
    grid.vm.selectFloatingImages([group.id]);
    await flushPromises();
    wrapper
      .getComponent(SheetOwnedPictureGroupLayer)
      .vm.$emit("selectPath", [group.id, group.members[0]!.id]);
    await flushPromises();
    const state = (
      wrapper.vm.$ as unknown as {
        setupState: Pick<Controller, "session" | "executeCommand"> & {
          fileActions: { importJson: (file: Pick<File, "text">) => Promise<void> };
        };
      }
    ).setupState;
    const crop = vi.spyOn(
      grid.vm.$.exposed as { applyPendingPictureCrop: () => boolean },
      "applyPendingPictureCrop",
    );
    await wrapper
      .getComponent(PictureOwnedLeafRibbon)
      .get('[data-picture-tool="format"]')
      .trigger("click");
    await flushPromises();
    const editableSnapshot = wrapper.getComponent(PictureFormatPane).props("snapshot")!;
    const oldIntent: PictureFormatIntent = {
      owner: editableSnapshot.owner,
      baseRevision: editableSnapshot.revision,
      intentId: "old-edit",
      type: "set-field",
      field: "altTitle",
      value: "must not write",
    };
    wrapper.getComponent(PictureFormatPane).vm.$emit("close");
    await flushPromises();
    expect(
      state.executeCommand(createSetSheetProtectionCommand(grid.props("sheet").id, true)),
    ).toBe(true);
    await flushPromises();
    const before = serializeWorkbook(state.session.workbook);
    const undoLength = state.session.history.undoStack.length;
    const redoLength = state.session.history.redoStack.length;
    const ribbon = wrapper.getComponent(PictureOwnedLeafRibbon);
    expect(ribbon.props("disabled")).toBe(true);
    await ribbon.get('[data-picture-tool="format"]').trigger("click");
    await flushPromises();
    const pane = wrapper.getComponent(PictureFormatPane);
    expect(pane.props("snapshot")).not.toBeNull();
    const caps = pane.props("capabilities");
    for (const capabilities of [caps.fields, caps.detailed, caps.resets]) {
      expect(Object.values(capabilities ?? {}).every((item) => !item.enabled)).toBe(true);
    }
    expect(caps.cropShape?.enabled).toBe(false);
    expect(
      pane
        .findAll<HTMLInputElement>("[role=tabpanel] input")
        .every((input) => input.element.disabled),
    ).toBe(true);
    const snapshot = pane.props("snapshot")!;
    const identity = {
      owner: snapshot.owner,
      baseRevision: snapshot.revision,
      intentId: "protected-edit",
    };
    const intents: PictureFormatIntent[] = [
      oldIntent,
      { ...identity, type: "set-field", field: "altTitle", value: "blocked" },
      { ...identity, type: "set-detailed", category: "reflection", value: { kind: "none" } },
      { ...identity, type: "set-crop-shape", value: undefined },
      { ...identity, type: "reset-picture" },
    ];
    for (const intent of intents) expect(pane.props("onIntent")(intent)).toBe(false);
    crop.mockClear();
    expect(pane.props("beforeInteraction")!()).toBe(true);
    await pane.get('[role="tab"][id$="effects-tab"]').trigger("click");
    await pane.get('[role="tab"][id$="picture-tab"]').trigger("click");
    expect(crop).not.toHaveBeenCalled();
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    expect(state.session.history.undoStack).toHaveLength(undoLength);
    expect(state.session.history.redoStack).toHaveLength(redoLength);
    let finishRead!: (text: string) => void;
    const reading = new Promise<string>((resolve) => {
      finishRead = resolve;
    });
    const importing = state.fileActions.importJson({ text: () => reading });
    await flushPromises();
    expect(pane.props("beforeInteraction")!()).toBe(false);
    expect(crop).not.toHaveBeenCalled();
    pane.vm.$emit("close");
    await flushPromises();
    const busyRibbon = wrapper.getComponent(PictureOwnedLeafRibbon);
    expect(busyRibbon.props("busy")).toBe(true);
    await busyRibbon.get('[data-picture-tool="format"]').trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(PictureFormatPane).exists()).toBe(false);
    expect(serializeWorkbook(state.session.workbook)).toEqual(before);
    expect(state.session.history.undoStack).toHaveLength(undoLength);
    finishRead("invalid test JSON");
    await importing;
  } finally {
    wrapper.unmount();
  }
});
