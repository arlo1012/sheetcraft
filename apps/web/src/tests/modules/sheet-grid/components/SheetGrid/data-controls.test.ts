import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCanvasLayout, mountSheetGrid } from "./fixture";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import type { SheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";

describe("SheetGrid data controls", () => {
  test("anchors a request to the visible filter header cell and reflects an applied column", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(target) {
        target.filter = {
          range: { start: { row: 0, column: 0 }, end: { row: 6, column: 2 } },
          columns: [{ column: 1, allowedValues: [{ kind: "string", value: "open" }] }],
        };
      },
    });
    await nextTick();

    const buttons = wrapper.findAll(".sheet-data-controls__filter");
    expect(buttons).toHaveLength(3);
    expect(buttons[1]!.classes()).toContain("is-active");
    await buttons[1]!.trigger("click");
    expect(wrapper.emitted("filterColumnRequest")?.[0]?.[0]).toMatchObject({ column: 1 });
    expect(sheet.filter?.range.start.row).toBe(0);
  });

  test("keeps a collapsed group reopen control on a visible header boundary", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.outlineGroups = [{ id: "rows-1-3", axis: "row", start: 1, end: 3, collapsed: true }];
      },
    });
    await nextTick();

    expect(getCanvasLayout(wrapper).panes.body.rows.map((item) => item.index)).not.toEqual(
      expect.arrayContaining([1, 2, 3]),
    );
    const control = wrapper.get(".sheet-data-controls__outline");
    await control.trigger("click");
    expect(wrapper.emitted("outlineToggle")?.[0]?.[0]).toEqual({
      id: "rows-1-3",
      collapsed: false,
    });
  });

  test("shows three row levels when subtotal detail groups have a total parent group", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.outlineGroups = [
          { id: "subtotal-total", axis: "row", start: 1, end: 6, collapsed: false },
          { id: "subtotal-a", axis: "row", start: 1, end: 2, collapsed: false },
          { id: "subtotal-b", axis: "row", start: 4, end: 5, collapsed: false },
        ];
      },
    });
    await nextTick();

    const levels = wrapper.findAll(".sheet-data-controls__outline-levels--rows button");
    expect(levels.map((level) => level.text())).toEqual(["1", "2", "3"]);
    expect(wrapper.get(".sheet-grid").attributes("style")).toContain(
      "--sheet-row-header-width: 96px",
    );
    await levels[0]!.trigger("click");
    await levels[1]!.trigger("click");
    await levels[2]!.trigger("click");
    expect(wrapper.emitted("outlineLevel")?.map(([payload]) => payload)).toEqual([
      { axis: "row", level: 0 },
      { axis: "row", level: 1 },
      { axis: "row", level: 2 },
    ]);
  });

  test("reserves separate outline space when row and column quick tools are enabled", async () => {
    const { wrapper } = mountSheetGrid({
      showAxisQuickTools: true,
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 1, columns: 1 };
        sheet.outlineGroups = [
          { id: "row-total", axis: "row", start: 1, end: 6, collapsed: false },
          { id: "row-detail", axis: "row", start: 1, end: 2, collapsed: false },
          { id: "column-total", axis: "column", start: 1, end: 6, collapsed: false },
          { id: "column-detail", axis: "column", start: 1, end: 2, collapsed: false },
        ];
      },
    });
    await nextTick();

    expect(wrapper.get(".sheet-grid").attributes("style")).toContain(
      "--sheet-row-header-width: 116px",
    );
    expect(wrapper.get(".sheet-grid").attributes("style")).toContain(
      "--sheet-column-header-height: 50px",
    );
    expect(
      wrapper.get(".sheet-data-controls__outline-levels--rows").element.getAttribute("style"),
    ).toContain("left: 22px");
    expect(
      wrapper.get(".sheet-data-controls__outline-levels--columns").element.getAttribute("style"),
    ).toContain("top: 22px");
    const frame = wrapper.getComponent(SheetSurface).props("frame") as SheetRenderFrame;
    expect(frame.headerSize).toEqual({ width: 116, height: 50 });
    expect(frame.body).toMatchObject({ x: 116, y: 50 });
    expect(frame.layout.freeze).toEqual({ rows: 1, columns: 1 });
    const columnControls = wrapper
      .findAll(".sheet-data-controls__outline")
      .map((control) => control.element as HTMLElement)
      .filter((control) => Number.parseFloat(control.style.top) < frame.headerSize.height);
    expect(columnControls).toHaveLength(2);
    expect(columnControls.every((control) => Number.parseFloat(control.style.top) >= 22)).toBe(
      true,
    );
    expect(
      columnControls.every(
        (control) => Number.parseFloat(control.style.top) + 16 <= frame.headerSize.height,
      ),
    ).toBe(true);
  });

  test("shows only the collapsed total control until it is expanded", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(target) {
        target.outlineGroups = [
          { id: "total", axis: "row", start: 1, end: 6, collapsed: true },
          { id: "detail-a", axis: "row", start: 1, end: 2, collapsed: true },
          { id: "detail-b", axis: "row", start: 4, end: 5, collapsed: true },
        ];
      },
    });
    await nextTick();

    expect(wrapper.findAll(".sheet-data-controls__outline")).toHaveLength(1);
    await wrapper.get(".sheet-data-controls__outline").trigger("click");
    expect(wrapper.emitted("outlineToggle")?.[0]?.[0]).toEqual({ id: "total", collapsed: false });

    sheet.outlineGroups![0]!.collapsed = false;
    await nextTick();
    expect(wrapper.findAll(".sheet-data-controls__outline")).toHaveLength(3);
  });

  test.each([
    { id: "below", start: 1, end: 2, summaryRow: 3, summaryBelow: true, collapsed: true },
    { id: "below", start: 1, end: 2, summaryRow: 3, summaryBelow: true, collapsed: false },
    { id: "above", start: 2, end: 3, summaryRow: 1, summaryBelow: false, collapsed: true },
    { id: "above", start: 2, end: 3, summaryRow: 1, summaryBelow: false, collapsed: false },
  ])(
    "anchors a subtotal control on its summary row (%s)",
    async ({ id, start, end, summaryRow, summaryBelow, collapsed }) => {
      const { sheet, wrapper } = mountSheetGrid({
        beforeMount(target) {
          target.outlineGroups = [{ id: `${id}-group-0`, axis: "row", start, end, collapsed }];
          target.subtotalMetadata = [
            {
              id,
              range: { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
              generatedRows: [summaryRow],
              summaryBelow,
            },
          ];
        },
      });
      await nextTick();

      expect(sheet.subtotalMetadata?.[0]?.summaryBelow).toBe(summaryBelow);
      const frame = wrapper.getComponent(SheetSurface).props("frame") as SheetRenderFrame;
      const summaryItem = frame.rowHeaders
        .flatMap((pane) => pane.items)
        .find((item) => item.index === summaryRow)!;
      const control = wrapper.get(".sheet-data-controls__outline");
      expect(Number.parseFloat((control.element as HTMLElement).style.top) + 8).toBe(
        summaryItem.offset + summaryItem.size / 2,
      );
    },
  );

  test("emits a selected validation literal without changing the cell directly", async () => {
    const { wrapper } = mountSheetGrid({
      validationInfo: { values: ["=literal", 7, true], prompt: { message: "Choose a status" } },
    });
    await nextTick();

    await wrapper.get(".sheet-data-controls__validation").trigger("click");
    await wrapper.findAll('[role="option"]')[0]!.trigger("click");
    expect(wrapper.emitted("validationChoose")?.[0]?.[0]).toEqual({
      address: { row: 0, column: 0 },
      value: "=literal",
    });
  });
});
