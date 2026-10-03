import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { serializeWorkbook } from "@idea10/core/serialization";
import type { CellStyleDefinition } from "@idea10/core/cell-styles";
import { getCellStyle } from "@idea10/core/workbook";
import { createSheetGridViewState } from "@idea10/sheet-engine/view-state";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { useCellStylesController } from "../../../modules/cell-styles/useCellStylesController";
import { createAppI18n } from "../../../shared/i18n";

let wrapper: ReturnType<typeof mount>;

function fixture() {
  let workspace!: ReturnType<typeof useSpreadsheetWorkspaceController>;
  let styles!: ReturnType<typeof useCellStylesController>;
  const generation = ref(0);
  wrapper = mount(
    defineComponent({
      setup() {
        workspace = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        styles = useCellStylesController({
          getWorkbook: () => workspace.session.workbook,
          getSheet: () => workspace.activeSheet.value,
          getAddress: () => workspace.activeAddress.value,
          getSelection: () => workspace.activeSelectionRange.value,
          getGeneration: () => generation.value,
          getRevision: () => workspace.workbookRevision.value,
          isBusy: () => false,
          finishEditing: () => true,
          execute: workspace.executeCommand,
          focus: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  const address = { row: 0, column: 0 };
  workspace.updateActiveSheetViewState(
    createSheetGridViewState({
      selection: { active: address, anchor: address, focus: address, mode: "cells" },
    }),
  );
  return { workspace, styles, generation };
}

afterEach(() => wrapper.unmount());

describe("cell styles controller", () => {
  test("applies a gallery style through one reversible cell-style command", () => {
    const { workspace, styles } = fixture();
    const style: CellStyleDefinition = {
      id: "emphasis",
      name: "Emphasis",
      category: "custom",
      style: { bold: true, fillColor: "#c6efce" },
    };

    styles.applyStyle(style);
    expect(getCellStyle(workspace.activeSheet.value, { row: 0, column: 0 })).toMatchObject(
      style.style,
    );
    workspace.undo();
    expect(getCellStyle(workspace.activeSheet.value, { row: 0, column: 0 })).toBeUndefined();
  });

  test("captures the active style for a new draft and saves it as a workbook style", () => {
    const { workspace, styles } = fixture();
    workspace.applyCellStyle({ italic: true, textColor: "#0563c1" });

    styles.createStyle();
    expect(styles.styleDraft.value?.initialStyle).toMatchObject({
      italic: true,
      textColor: "#0563c1",
    });
    styles.saveStyle({
      id: "link-like",
      name: "Link-like",
      category: "custom",
      style: styles.styleDraft.value!.initialStyle,
    });
    expect(workspace.session.workbook.cellStyles).toEqual([
      expect.objectContaining({ id: "link-like", name: "Link-like" }),
    ]);
    workspace.undo();
    expect(workspace.session.workbook.cellStyles).toEqual([]);
  });

  test("a style created from a blank cell clears formatting when applied later", () => {
    const { workspace, styles } = fixture();
    styles.createStyle();
    styles.saveStyle({
      id: "blank",
      name: "Blank",
      category: "custom",
      style: styles.styleDraft.value!.initialStyle,
    });
    workspace.applyCellStyle({ bold: true, fillColor: "#ffeb9c" });

    styles.applyStyle(workspace.session.workbook.cellStyles![0]!);
    expect(getCellStyle(workspace.activeSheet.value, { row: 0, column: 0 })).toBeUndefined();
  });

  test("merges by name and remaps colliding incoming IDs", () => {
    const { workspace, styles } = fixture();
    styles.saveStyle({ id: "shared", name: "Existing", category: "custom", style: { bold: true } });
    styles.openMerge();
    styles.mergeStyles({
      replaceExisting: false,
      styles: [
        { id: "shared", name: "Existing", category: "custom", style: { italic: true } },
        { id: "shared", name: "Imported", category: "custom", style: { fillColor: "#ffeb9c" } },
      ],
    });

    expect(workspace.session.workbook.cellStyles).toEqual([
      expect.objectContaining({ id: "shared", name: "Existing", style: { bold: true } }),
      expect.objectContaining({ name: "Imported", style: { fillColor: "#ffeb9c" } }),
    ]);
    expect(workspace.session.workbook.cellStyles?.[1]?.id).not.toBe("shared");

    styles.openMerge();
    styles.mergeStyles({
      replaceExisting: true,
      styles: [{ id: "other", name: "Existing", category: "custom", style: { italic: true } }],
    });
    expect(workspace.session.workbook.cellStyles?.[0]).toMatchObject({
      id: "shared",
      name: "Existing",
      style: { italic: true },
    });
  });

  test("discards an imported file when its workbook generation becomes stale", async () => {
    const { workspace, styles, generation } = fixture();
    const snapshot = serializeWorkbook({
      ...workspace.session.workbook,
      cellStyles: [
        { id: "from-file", name: "From file", category: "custom", style: { italic: true } },
      ],
    });
    let resolveText!: (text: string) => void;
    const file = {
      name: "styles.json",
      type: "application/json",
      text: () =>
        new Promise<string>((resolve) => {
          resolveText = resolve;
        }),
      arrayBuffer: async () => new ArrayBuffer(0),
    };

    styles.openMerge();
    const loading = styles.importMergeFile(file);
    generation.value += 1;
    resolveText(JSON.stringify(snapshot));
    await loading;
    await nextTick();

    expect(styles.importedStyles.value).toEqual([]);
    expect(styles.mergeOpen.value).toBe(false);
  });
});
