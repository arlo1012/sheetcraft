import { describe, expect, test } from "vitest";
import { DOMWrapper, mount } from "@vue/test-utils";
import { createBuiltinTableStyles, createThemedTableStyles } from "@sheetcraft/core/table-styles";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { createAppI18n } from "../../../shared/i18n";
import TableStyleGallery from "../../../modules/table-styles/components/TableStyleGallery.vue";
import TableStylePreview from "../../../modules/table-styles/components/TableStylePreview.vue";
import TableStylesMenu from "../../../modules/table-styles/components/TableStylesMenu.vue";
import NewTableStyleDialog from "../../../modules/table-styles/components/NewTableStyleDialog.vue";
import CellFormatDialog from "../../../modules/cell-format/components/CellFormatDialog.vue";
import { previewCells } from "../../../modules/table-styles/table-style-presentation";
import { previewPivotCells } from "../../../modules/table-styles/table-style-presentation";
import type { TableStyleDefinition } from "@sheetcraft/core/table-styles";
import type { PivotTableStyleDefinition } from "@sheetcraft/core/pivot-table-styles";
import { mergeStyleFormatChange } from "../../../shared/cell-format/style-format-dialog";

const editableStyle = {
  id: "table-custom-report",
  name: "Report",
  category: "custom" as const,
  elements: {
    wholeTable: { style: { fillColor: "#ffffff" } },
    headerRow: { style: { fillColor: "#4f81bd", bold: true } },
  },
};
const editablePivotStyle: PivotTableStyleDefinition = {
  id: "pivot-custom-report",
  name: "Pivot report",
  category: "custom",
  elements: {
    wholeTable: { style: { fillColor: "#ffffff" } },
    firstSubtotalRow: { style: { fillColor: "#4f81bd", bold: true } },
    pageFieldLabels: { style: { fillColor: "#c0504d" } },
  },
};

function mountStyleDialog(props: Partial<InstanceType<typeof NewTableStyleDialog>["$props"]> = {}) {
  return mount(NewTableStyleDialog, {
    attachTo: document.body,
    props: { existingNames: [], ...props },
    global: { plugins: [createAppI18n("en-US")] },
  });
}

function confirmedPayload(wrapper: ReturnType<typeof mountStyleDialog>): {
  style: TableStyleDefinition;
  setAsDefault: boolean;
} {
  return wrapper.emitted("confirm")?.[0]?.[0] as {
    style: TableStyleDefinition;
    setAsDefault: boolean;
  };
}

describe("table style gallery", () => {
  const styles = createBuiltinTableStyles("#4f81bd");

  test("renders the complete Excel-style catalog in a seven-column selectable gallery", () => {
    const wrapper = mount(TableStyleGallery, {
      props: { styles, columns: 7, selectedStyleId: styles[0]!.id },
      global: { plugins: [createAppI18n("en-US")] },
    });

    expect(wrapper.findAll(".table-style-gallery__tile")).toHaveLength(60);
    expect(wrapper.findAllComponents(TableStylePreview)).toHaveLength(60);
    expect(wrapper.get(".table-style-gallery__tile").attributes("aria-pressed")).toBe("true");
  });

  test("localizes built-in preset labels but preserves custom style names", () => {
    const custom = {
      id: "custom-report",
      name: "销售看板",
      category: "custom" as const,
      elements: {},
    };
    const wrapper = mount(TableStyleGallery, {
      props: { styles: [...styles, custom] },
      global: { plugins: [createAppI18n("zh-CN")] },
    });

    expect(wrapper.get('[data-table-style-id="table-medium-1"]').attributes("title")).toBe(
      "中等 1",
    );
    expect(wrapper.get('[data-table-style-id="custom-report"]').attributes("title")).toBe(
      "销售看板",
    );
  });

  test("emits the selected definition without mutating its preset data", async () => {
    const wrapper = mount(TableStyleGallery, {
      props: { styles },
      global: { plugins: [createAppI18n("en-US")] },
    });

    await wrapper.findAll(".table-style-gallery__tile")[3]!.trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual([styles[3]]);
  });

  test("opens custom style actions from its context-menu pointer", async () => {
    const custom = {
      id: "custom-report",
      name: "Report",
      category: "custom" as const,
      elements: {},
    };
    const wrapper = mount(TableStyleGallery, {
      attachTo: document.body,
      props: { styles: [custom] },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const tile = wrapper.get('[data-table-style-id="custom-report"]');
    await tile.trigger("contextmenu");
    await new DOMWrapper(document.body).get('[data-custom-style-action="delete"]').trigger("click");
    expect(wrapper.emitted("delete")).toEqual([[custom]]);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("opens the same custom-style actions from Shift+F10", async () => {
    const wrapper = mount(TableStyleGallery, {
      attachTo: document.body,
      props: { styles: [editableStyle] },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const tile = wrapper.get(`[data-table-style-id="${editableStyle.id}"]`);
    await tile.trigger("keydown", { key: "F10", shiftKey: true });
    await new DOMWrapper(document.body).get('[data-custom-style-action="delete"]').trigger("click");
    expect(wrapper.emitted("delete")).toEqual([[editableStyle]]);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("moves through the seven-column gallery with the arrow and boundary keys", async () => {
    const wrapper = mount(TableStyleGallery, {
      attachTo: document.body,
      props: { styles, columns: 7 },
      global: { plugins: [createAppI18n("en-US")] },
    });
    const first = wrapper.get('[data-table-style-id="table-light-1"]');
    (first.element as HTMLButtonElement).focus();
    await first.trigger("keydown", { key: "ArrowRight" });
    expect((document.activeElement as HTMLElement).dataset.tableStyleId).toBe("table-light-2");
    await new DOMWrapper(document.activeElement as HTMLElement).trigger("keydown", {
      key: "ArrowDown",
    });
    expect((document.activeElement as HTMLElement).dataset.tableStyleId).toBe("table-light-9");
    await new DOMWrapper(document.activeElement as HTMLElement).trigger("keydown", { key: "End" });
    expect((document.activeElement as HTMLElement).dataset.tableStyleId).toBe("table-dark-11");
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("uses Core table-style resolution for the complete seven-by-five preview", () => {
    const cells = previewCells(styles.find((style) => style.id === "table-medium-2")!);
    expect(cells).toHaveLength(35);
    expect(cells[0]?.style?.fillColor).toBe("#4f81bd");
    expect(cells.at(-1)?.style?.bold).toBe(true);
  });

  test.each(["#4f81bd", "#c0504d"])(
    "previews colored first-column presets in theme %s",
    (color) => {
      const presets = createThemedTableStyles(color);
      for (const id of ["table-wps-medium-3", "table-wps-medium-4"]) {
        const cells = previewCells(presets.find((style) => style.id === id)!);
        for (let row = 0; row < 7; row += 1)
          expect(cells[row * 5]?.style).toMatchObject({ fillColor: color, textColor: "#ffffff" });
        expect(cells[6]?.style?.fillColor).not.toBe(color);
      }
      const regular = previewCells(presets.find((style) => style.id === "table-wps-medium-1")!);
      expect(regular[5]?.style?.fillColor).toBe(regular[6]?.style?.fillColor);
    },
  );

  test("renders PivotTable-specific subtotal and report-filter elements in its preview", () => {
    const cells = previewPivotCells(editablePivotStyle);
    expect(cells).toHaveLength(35);
    expect(cells[0]?.style?.fillColor).toBe("#c0504d");
    expect(cells[25]?.style?.fillColor).toBe("#4f81bd");
    expect(cells[25]?.style?.bold).toBe(true);
  });

  test("reflects PivotTable stripe sizes and inner borders in its preview", () => {
    const border = { style: "thin" as const, color: "#222222" };
    const cells = previewPivotCells({
      ...editablePivotStyle,
      elements: {
        wholeTable: { style: {}, innerHorizontal: border, innerVertical: border },
        firstRowStripe: { style: { fillColor: "#4f81bd" }, stripeSize: 1 },
        secondRowStripe: { style: { fillColor: "#c0504d" }, stripeSize: 2 },
      },
    });
    expect(cells[7]?.style).toMatchObject({ fillColor: "#4f81bd", borderBottom: border });
    expect(cells[12]?.style?.fillColor).toBe("#c0504d");
    expect(cells[17]?.style?.fillColor).toBe("#c0504d");
    expect(cells[7]?.style?.borderRight).toEqual(border);
  });

  test("keeps PivotTable inner and outline borders within each element boundary", () => {
    const outline = { style: "thin" as const, color: "#4f81bd" };
    const inner = { style: "thin" as const, color: "#c0504d" };
    const cells = previewPivotCells({
      ...editablePivotStyle,
      elements: {
        wholeTable: {
          style: {
            borderTop: outline,
            borderRight: outline,
            borderBottom: outline,
            borderLeft: outline,
          },
        },
        headerRow: { style: {}, innerHorizontal: inner },
      },
    });
    expect(cells[0]?.style).toMatchObject({ borderTop: outline, borderLeft: outline });
    expect(cells[6]?.style).not.toMatchObject({
      borderTop: outline,
      borderRight: outline,
      borderBottom: outline,
      borderLeft: outline,
    });
    expect(cells[1]?.style?.borderBottom).toBeUndefined();
  });

  test("switches between the complete catalog and recolored WPS quick styles", async () => {
    const wrapper = mount(TableStylesMenu, {
      attachTo: document.body,
      props: { selectedStyleId: "table-wps-light-1", selectedAccentColor: "#9bbb59" },
      global: { plugins: [createAppI18n("en-US")] },
    });
    await wrapper.get('[data-ribbon-action="table-styles"]').trigger("click");
    const menu = new DOMWrapper(document.body);
    expect(menu.findAll(".table-style-gallery__tile")).toHaveLength(32);
    expect(menu.get('[role="radio"][aria-label="#9bbb59"]').attributes("aria-checked")).toBe(
      "true",
    );
    await menu.get('[role="switch"]').trigger("click");
    expect(menu.findAll(".table-style-gallery__tile")).toHaveLength(60);

    await menu.get('[role="switch"]').trigger("click");
    await menu.get('[role="radio"][aria-label="#8064a2"]').trigger("click");
    expect(menu.get('[data-table-style-id="table-wps-light-1"]').attributes("aria-pressed")).toBe(
      "false",
    );
    await menu.get('[role="radio"][aria-label="#9bbb59"]').trigger("click");
    expect(menu.findAll(".table-style-gallery__tile")).toHaveLength(32);
    const first = menu.get('[data-table-style-id="table-wps-light-1"]');
    await first.trigger("click");
    expect(wrapper.emitted("apply")?.[0]).toEqual([createThemedTableStyles("#9bbb59")[0]]);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("keeps the PivotTable gallery scrollable and starts its editor from either action", async () => {
    const wrapper = mount(TableStylesMenu, {
      attachTo: document.body,
      props: { customPivotStyles: [editablePivotStyle] },
      global: { plugins: [createAppI18n("en-US")] },
    });
    await wrapper.get('[data-ribbon-action="table-styles"]').trigger("click");
    const menu = new DOMWrapper(document.body);
    expect(menu.get(".table-styles-menu__galleries").classes()).toContain(
      "table-styles-menu__galleries",
    );
    await menu.get('[data-table-style-id="pivot-custom-report"]').trigger("click");
    expect(wrapper.emitted("editPivot")?.[0]).toEqual([editablePivotStyle]);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("keeps the parent menu open while deleting a custom style from its teleported context menu", async () => {
    const wrapper = mount(TableStylesMenu, {
      attachTo: document.body,
      props: { customStyles: [editableStyle] },
      global: { plugins: [createAppI18n("en-US")] },
    });
    await wrapper.get('[data-ribbon-action="table-styles"]').trigger("click");
    const body = new DOMWrapper(document.body);
    await body.get('[data-table-style-id="table-custom-report"]').trigger("contextmenu");
    const action = body.get('[data-custom-style-action="delete"]');
    await action.trigger("pointerdown");
    await action.trigger("click");
    expect(wrapper.emitted("delete")).toEqual([[editableStyle]]);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("shows the complete table-element list in the custom-style dialog", () => {
    const wrapper = mountStyleDialog();

    expect(wrapper.findAll('[role="option"]')).toHaveLength(13);
    expect(wrapper.findComponent(TableStylePreview).exists()).toBe(true);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("edits the complete PivotTable element list and emits the PivotTable payload", async () => {
    const wrapper = mountStyleDialog({ kind: "pivot", style: editablePivotStyle });
    expect(wrapper.findAll('[role="option"]')).toHaveLength(25);
    await wrapper.get('[data-table-style-element="pageFieldLabels"]').trigger("click");
    await wrapper.get('[data-table-style-action="clear"]').trigger("click");
    await wrapper.findComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("confirmPivot")?.[0]?.[0]).toMatchObject({
      style: { elements: { firstSubtotalRow: editablePivotStyle.elements.firstSubtotalRow } },
    });
    expect(wrapper.text()).toContain("Grand total row");
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("clears only the selected element and keeps the rest of the draft", async () => {
    const wrapper = mountStyleDialog({ style: editableStyle });
    await wrapper.get('[data-table-style-element="headerRow"]').trigger("click");
    await wrapper.get('[data-table-style-action="clear"]').trigger("click");
    await wrapper.findComponent(Dialog).vm.$emit("confirm");

    expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
      style: { elements: { wholeTable: { style: { fillColor: "#ffffff" } } } },
    });
    expect(confirmedPayload(wrapper).style.elements.headerRow).toBeUndefined();
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test.each([
    ["table", "Table Style"],
    ["pivot", "PivotTable Style"],
  ] as const)("numbers new %s styles without colliding with existing names", (kind, prefix) => {
    const wrapper = mountStyleDialog({
      kind,
      existingNames: [`${prefix} 1`, `${prefix.toLowerCase()} 2`, `${prefix} 4`],
    });
    expect((wrapper.get("[data-table-style-name] input").element as HTMLInputElement).value).toBe(
      `${prefix} 3`,
    );
    expect(wrapper.findComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("does not confirm a duplicate name and cancel never saves", async () => {
    const wrapper = mountStyleDialog({ existingNames: ["Existing"] });
    await wrapper.get("[data-table-style-name] input").setValue("Existing");
    expect(wrapper.findComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    await wrapper.findComponent(Dialog).vm.$emit("close");

    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("keeps the draft on format cancel and only updates the active element on confirmation", async () => {
    const wrapper = mountStyleDialog({ style: editableStyle });
    await wrapper.get('[data-table-style-element="headerRow"]').trigger("click");
    await wrapper.get('[data-table-style-action="format"]').trigger("click");
    const format = wrapper.findComponent(CellFormatDialog);
    await format.vm.$emit("cancel");
    await wrapper.findComponent(Dialog).vm.$emit("confirm");
    expect(confirmedPayload(wrapper).style.elements.headerRow).toEqual(
      editableStyle.elements.headerRow,
    );

    wrapper.unmount();
    document.body.replaceChildren();

    const confirmed = mountStyleDialog({ style: editableStyle });
    await confirmed.get('[data-table-style-element="headerRow"]').trigger("click");
    await confirmed.get('[data-table-style-action="format"]').trigger("click");
    await confirmed.findComponent(CellFormatDialog).vm.$emit("confirm", {
      style: { fillColor: "#123456" },
    });
    await confirmed.findComponent(Dialog).vm.$emit("confirm");
    expect(confirmed.emitted("confirm")?.[0]?.[0]).toMatchObject({
      style: {
        elements: {
          wholeTable: editableStyle.elements.wholeTable,
          headerRow: { style: { fillColor: "#123456" } },
        },
      },
    });
    confirmed.unmount();
    document.body.replaceChildren();
  });

  test("updates the selected column stripe preview after formatting and preserves its stripe size", async () => {
    const wrapper = mountStyleDialog({
      style: {
        ...editableStyle,
        elements: {
          ...editableStyle.elements,
          firstColumnStripe: { style: { fillColor: "#eeeeee" }, stripeSize: 2 },
          secondColumnStripe: { style: {}, stripeSize: 1 },
        },
      },
    });
    await wrapper.get('[data-table-style-element="secondColumnStripe"]').trigger("click");
    await wrapper.findComponent({ name: "TInputNumber" }).vm.$emit("change", 4);
    await wrapper.get('[data-table-style-action="format"]').trigger("click");
    await wrapper.findComponent(CellFormatDialog).vm.$emit("confirm", {
      style: { fillColor: "#123456", underline: "double", fontSize: 16 },
    });
    const cell = wrapper.get('[data-preview-cell="1-2"]').element as HTMLElement;
    expect(cell.style.backgroundColor).toBe("#123456");
    expect(cell.style.textDecoration).toBe("underline double");
    expect(cell.style.fontSize).toBe("16px");
    expect(wrapper.findComponent({ name: "TInputNumber" }).props("modelValue")).toBe(4);
    expect(wrapper.findAll("[data-preview-cell]")).toHaveLength(42);
    await wrapper.findComponent(Dialog).vm.$emit("confirm");
    expect(confirmedPayload(wrapper).style.elements.secondColumnStripe).toMatchObject({
      stripeSize: 4,
      style: { fillColor: "#123456", underline: "double", fontSize: 16 },
    });
    await wrapper.get('[data-table-style-action="clear"]').trigger("click");
    expect(
      (wrapper.get('[data-preview-cell="1-2"]').element as HTMLElement).style.backgroundColor,
    ).toBe("#ffffff");
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("includes the default-style checkbox in the confirmation payload", async () => {
    const wrapper = mountStyleDialog();
    expect(wrapper.findComponent(TCheckbox).props("modelValue")).toBe(false);
    await wrapper.findComponent(TCheckbox).vm.$emit("update:modelValue", true);
    await wrapper.findComponent(Dialog).vm.$emit("confirm");

    expect(confirmedPayload(wrapper).setAsDefault).toBe(true);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("restores the default designation when editing an existing default style", () => {
    const wrapper = mountStyleDialog({ style: editableStyle, defaultStyleId: editableStyle.id });
    expect(wrapper.findComponent(TCheckbox).props("modelValue")).toBe(true);
    wrapper.unmount();
    document.body.replaceChildren();
  });

  test("keeps table-internal borders when the format dialog applies all, inner, or clear actions", () => {
    const border = { style: "thin" as const, color: "#4f81bd" };
    const all = mergeStyleFormatChange({ style: {} }, { borders: [{ preset: "all", border }] });
    expect(all).toMatchObject({
      style: { borderTop: border, borderRight: border, borderBottom: border, borderLeft: border },
      innerHorizontal: border,
      innerVertical: border,
    });
    const cleared = mergeStyleFormatChange(all, { borders: [{ preset: "none" }] });
    expect(cleared.innerHorizontal).toBeNull();
    expect(cleared.innerVertical).toBeNull();
    expect(cleared.style.borderTop).toBeNull();
  });
});
