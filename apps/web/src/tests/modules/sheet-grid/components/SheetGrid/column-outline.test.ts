import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getSheetRenderFrame, mountSheetGrid } from "./fixture";

describe("SheetGrid column outlines", () => {
  test("separates nested range brackets from column labels and offers every level", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.outlineGroups = [
          { id: "outer", axis: "column", start: 1, end: 5, collapsed: false },
          { id: "inner", axis: "column", start: 1, end: 2, collapsed: false },
        ];
      },
    });
    await nextTick();
    const frame = getSheetRenderFrame(wrapper);
    const tracks = wrapper.findAll<HTMLElement>(".sheet-data-controls__column-outline-track");
    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => Number.parseFloat(track.element.style.top))).toEqual([2, 22]);
    expect(
      tracks.every(
        (track) => Number.parseFloat(track.element.style.top) + 16 < frame.headerSize.height - 28,
      ),
    ).toBe(true);
    expect(
      wrapper.findAll(".sheet-data-controls__column-outline-line.has-start.has-button"),
    ).toHaveLength(2);
    const levels = wrapper.findAll(".sheet-data-controls__outline-levels--columns button");
    expect(levels.map((level) => level.text())).toEqual(["1", "2", "3"]);
    await levels[1]!.trigger("click");
    expect(wrapper.emitted("outlineLevel")?.[0]?.[0]).toEqual({ axis: "column", level: 1 });
    await wrapper.get('[data-outline-id="inner"]').trigger("click");
    expect(wrapper.emitted("outlineToggle")?.[0]?.[0]).toEqual({ id: "inner", collapsed: true });
  });

  test.each([
    { collapsed: false, start: 1, anchorIndex: 2 },
    { collapsed: true, start: 1, anchorIndex: 0 },
    { collapsed: true, start: 0, anchorIndex: 3 },
  ])("centers the toggle in its visible column (%j)", async ({ collapsed, start, anchorIndex }) => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.columnWidths.set(anchorIndex, 140);
        sheet.outlineGroups = [{ id: "columns", axis: "column", start, end: 2, collapsed }];
      },
    });
    await nextTick();
    const assertCentered = () => {
      const anchor = getSheetRenderFrame(wrapper)
        .columnHeaders.flatMap((pane) => pane.items)
        .find((item) => item.index === anchorIndex)!;
      const control = wrapper.get<HTMLElement>('[data-outline-id="columns"]');
      const track = control.element.parentElement!;
      const pane = track.parentElement!;
      const center =
        Number.parseFloat(pane.style.left) +
        Number.parseFloat(track.style.left) +
        Number.parseFloat(track.style.width) -
        8;
      expect(center).toBe(anchor.offset + anchor.size / 2);
    };
    assertCentered();
    sheet.columnWidths.set(anchorIndex, 72);
    await nextTick();
    assertCentered();
  });

  test("keeps a group starting at A reopenable and hides its collapsed descendants", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.outlineGroups = [
          { id: "outer", axis: "column", start: 0, end: 3, collapsed: true },
          { id: "inner", axis: "column", start: 1, end: 2, collapsed: true },
        ];
      },
    });
    await nextTick();
    expect(
      getSheetRenderFrame(wrapper)
        .columnHeaders.flatMap((pane) => pane.items)
        .some((item) => item.index < 4),
    ).toBe(false);
    expect(wrapper.findAll(".sheet-data-controls__outline--column")).toHaveLength(1);
    expect(wrapper.findAll(".sheet-data-controls__column-outline-line")).toHaveLength(0);
    const control = wrapper.get('[data-outline-id="outer"]');
    expect(control.attributes("aria-expanded")).toBe("false");
    await control.trigger("click");
    expect(wrapper.emitted("outlineToggle")?.[0]?.[0]).toEqual({ id: "outer", collapsed: false });
  });

  test("splits a group crossing frozen columns into clipped brackets with one toggle", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 0, columns: 2 };
        sheet.outlineGroups = [
          { id: "crossing", axis: "column", start: 0, end: 4, collapsed: false },
        ];
      },
    });
    await nextTick();
    expect(wrapper.findAll(".sheet-data-controls__column-outline-track")).toHaveLength(2);
    expect(wrapper.findAll(".sheet-data-controls__column-outline-line.has-start")).toHaveLength(1);
    expect(wrapper.findAll('[data-outline-id="crossing"]')).toHaveLength(1);
    const frame = getSheetRenderFrame(wrapper);
    const panes = wrapper.findAll<HTMLElement>(".sheet-data-controls__column-outline-pane");
    expect(panes.map((pane) => Number.parseFloat(pane.element.style.left))).toEqual(
      frame.columnHeaders.map((pane) => pane.clip.x),
    );
    expect(panes.map((pane) => Number.parseFloat(pane.element.style.width))).toEqual(
      frame.columnHeaders.map((pane) => pane.clip.width),
    );
  });
});
