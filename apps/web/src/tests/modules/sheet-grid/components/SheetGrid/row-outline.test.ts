import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getSheetRenderFrame, mountSheetGrid } from "./fixture";

describe("SheetGrid row outlines", () => {
  test("uses separate nested lanes and keeps level buttons clear of row labels", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.outlineGroups = [
          { id: "outer", axis: "row", start: 1, end: 5, collapsed: false },
          { id: "inner", axis: "row", start: 1, end: 2, collapsed: false },
        ];
      },
    });
    await nextTick();
    const frame = getSheetRenderFrame(wrapper);
    const tracks = wrapper.findAll<HTMLElement>(".sheet-data-controls__row-outline-track");
    expect(tracks).toHaveLength(2);
    expect(tracks.map((track) => Number.parseFloat(track.element.style.left))).toEqual([2, 22]);
    expect(
      tracks.every(
        (track) => Number.parseFloat(track.element.style.left) + 16 < frame.headerSize.width - 48,
      ),
    ).toBe(true);
    expect(
      wrapper.findAll(".sheet-data-controls__row-outline-line.has-start.has-button"),
    ).toHaveLength(2);
    const levelBar = wrapper.get<HTMLElement>(".sheet-data-controls__outline-levels--rows");
    expect(Number.parseFloat(levelBar.element.style.top)).toBe(frame.headerSize.height - 18);
    const levels = levelBar.findAll("button");
    expect(levels.map((level) => level.text())).toEqual(["1", "2", "3"]);
    await levels[1]!.trigger("click");
    expect(wrapper.emitted("outlineLevel")?.[0]?.[0]).toEqual({ axis: "row", level: 1 });
    await wrapper.get('[data-outline-id="inner"]').trigger("click");
    expect(wrapper.emitted("outlineToggle")?.[0]?.[0]).toEqual({ id: "inner", collapsed: true });
  });

  test.each([false, true])(
    "centers a row toggle at different row heights (collapsed: %s)",
    async (collapsed) => {
      const { wrapper } = mountSheetGrid({
        beforeMount(sheet) {
          sheet.rowHeights.set(0, 36);
          sheet.rowHeights.set(1, 32);
          sheet.rowHeights.set(2, 48);
          sheet.outlineGroups = [{ id: "rows", axis: "row", start: 1, end: 2, collapsed }];
        },
      });
      await nextTick();
      const headers = getSheetRenderFrame(wrapper).rowHeaders.flatMap((pane) => pane.items);
      const anchor = headers.find((item) => item.index === (collapsed ? 0 : 2))!;
      const control = wrapper.get<HTMLElement>('[data-outline-id="rows"]');
      const track = control.element.parentElement!;
      const pane = track.parentElement!;
      const paneTop = Number.parseFloat(pane.style.top);
      const trackTop = Number.parseFloat(track.style.top);
      expect(paneTop + trackTop + Number.parseFloat(control.element.style.top) + 8).toBe(
        anchor.offset + anchor.size / 2,
      );
      if (!collapsed) {
        const detail = headers.find((item) => item.index === 1)!;
        expect(paneTop + trackTop).toBe(detail.offset);
        const dot = wrapper.get<HTMLElement>(
          ".sheet-data-controls__row-outline-pane .sheet-data-controls__outline-dot",
        );
        expect(paneTop + Number.parseFloat(dot.element.style.top)).toBe(
          detail.offset + detail.size / 2,
        );
      }
    },
  );

  test("keeps a group starting at row 1 reopenable and hides nested controls", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.outlineGroups = [
          { id: "outer", axis: "row", start: 0, end: 3, collapsed: true },
          { id: "inner", axis: "row", start: 1, end: 2, collapsed: true },
        ];
      },
    });
    await nextTick();
    expect(
      getSheetRenderFrame(wrapper)
        .rowHeaders.flatMap((pane) => pane.items)
        .some((item) => item.index < 4),
    ).toBe(false);
    expect(wrapper.findAll(".sheet-data-controls__outline--row")).toHaveLength(1);
    expect(wrapper.findAll(".sheet-data-controls__row-outline-line")).toHaveLength(0);
    const control = wrapper.get('[data-outline-id="outer"]');
    expect(control.attributes("aria-expanded")).toBe("false");
    await control.trigger("click");
    expect(wrapper.emitted("outlineToggle")?.[0]?.[0]).toEqual({ id: "outer", collapsed: false });
  });

  test("clips brackets across frozen rows and renders the toggle only at the group end", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 2, columns: 0 };
        sheet.outlineGroups = [{ id: "crossing", axis: "row", start: 0, end: 4, collapsed: false }];
      },
    });
    await nextTick();
    expect(wrapper.findAll(".sheet-data-controls__row-outline-track")).toHaveLength(2);
    expect(wrapper.findAll(".sheet-data-controls__row-outline-line.has-start")).toHaveLength(1);
    expect(wrapper.findAll('[data-outline-id="crossing"]')).toHaveLength(1);
    const frame = getSheetRenderFrame(wrapper);
    const panes = wrapper.findAll<HTMLElement>(".sheet-data-controls__row-outline-pane");
    expect(panes.map((pane) => Number.parseFloat(pane.element.style.top))).toEqual(
      frame.rowHeaders.map((pane) => pane.clip.y),
    );
    expect(panes.map((pane) => Number.parseFloat(pane.element.style.height))).toEqual(
      frame.rowHeaders.map((pane) => pane.clip.height),
    );
  });

  test.each([true, false])(
    "connects the bracket to a subtotal summary (below: %s)",
    async (summaryBelow) => {
      const { wrapper } = mountSheetGrid({
        beforeMount(sheet) {
          sheet.outlineGroups = [
            { id: "subtotal-group-0", axis: "row", start: 2, end: 4, collapsed: false },
          ];
          sheet.subtotalMetadata = [
            {
              id: "subtotal",
              range: { start: { row: 1, column: 0 }, end: { row: 5, column: 1 } },
              generatedRows: [summaryBelow ? 5 : 1],
              summaryBelow,
            },
          ];
        },
      });
      await nextTick();
      const line = wrapper.get(".sheet-data-controls__row-outline-line");
      expect(line.classes().includes("has-start")).toBe(summaryBelow);
      expect(line.classes().includes("has-end")).toBe(!summaryBelow);
      expect(line.classes().includes("has-button-at-start")).toBe(!summaryBelow);
    },
  );
});
