import { describe, expect, test } from "vitest";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import {
  getFloatingMenu,
  mountSheetGrid,
  triggerAxisHeader,
  triggerAxisInsert,
  triggerHeaderCorner,
} from "./fixture";

function quickTools(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]) {
  return (
    wrapper.getComponent(SheetSurface).props("headers") as { quickTools: { enabled: boolean } }
  ).quickTools;
}

describe("SheetGrid axis quick tools", () => {
  test("inserts at a hovered row boundary without selecting that row", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });
    await triggerAxisInsert(wrapper, "row", 2);
    expect(wrapper.emitted("insertAxis")).toEqual([[{ axis: "row", index: 2, count: 1 }]]);
  });

  test("uses selected axis count at either insertion boundary", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });
    await triggerAxisHeader(wrapper, "row", 0);
    await triggerAxisHeader(wrapper, "row", 1, "pointerdown", { shiftKey: true });
    await triggerAxisInsert(wrapper, "row", 0);
    await triggerAxisInsert(wrapper, "row", 2);
    expect(wrapper.emitted("insertAxis")).toEqual([
      [{ axis: "row", index: 0, count: 2 }],
      [{ axis: "row", index: 2, count: 2 }],
    ]);
  });

  test("keeps axis context actions available from a canvas header", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });
    await triggerAxisHeader(wrapper, "column", 1, "contextmenu", { button: 2 });
    expect(getFloatingMenu().classes()).toContain("sheet-axis-context-menu");
  });

  test("shows quick tools only while feature state permits them", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });
    expect(quickTools(wrapper).enabled).toBe(true);
    await wrapper.setProps({ showAxisQuickTools: false });
    expect(quickTools(wrapper).enabled).toBe(false);
    await wrapper.setProps({ showAxisQuickTools: true, showHeaders: false });
    expect(quickTools(wrapper).enabled).toBe(false);
    await wrapper.setProps({ showHeaders: true, readOnly: true });
    expect(quickTools(wrapper).enabled).toBe(false);
  });

  test("starts a move from selected and unselected axis grips without collapsing selection", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });
    await triggerAxisHeader(wrapper, "row", 0);
    await triggerAxisHeader(wrapper, "row", 1, "pointerdown", { shiftKey: true });
    // Hover then use the gutter centre, which is the Canvas grip hit target.
    await triggerAxisHeader(wrapper, "row", 0, "pointermove");
    const surface = wrapper.getComponent(SheetSurface);
    const frame = surface.props("frame") as {
      headerSize: { width: number };
      rowHeaders: readonly { items: readonly { index: number; offset: number; size: number }[] }[];
      scale: number;
    };
    const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
    const row = frame.rowHeaders.flatMap((pane) => pane.items).find((item) => item.index === 0)!;
    const bounds = canvas.element.getBoundingClientRect();
    await canvas.trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: bounds.left + 8 * frame.scale,
      clientY: bounds.top + (row.offset + row.size / 2) * frame.scale,
    });
    expect(
      (
        surface.props("headers") as {
          selection: { mode: string; startRow: number; endRow: number };
        }
      ).selection,
    ).toMatchObject({ mode: "rows", startRow: 0, endRow: 1 });
  });

  test("changes an all selection into the clicked row or column axis", async () => {
    const { wrapper } = mountSheetGrid({ showAxisQuickTools: true });
    await triggerHeaderCorner(wrapper);
    await triggerAxisHeader(wrapper, "row", 2);
    expect(
      (wrapper.getComponent(SheetSurface).props("headers") as { selection: { mode: string } })
        .selection.mode,
    ).toBe("rows");
    await triggerHeaderCorner(wrapper);
    await triggerAxisHeader(wrapper, "column", 2);
    expect(
      (wrapper.getComponent(SheetSurface).props("headers") as { selection: { mode: string } })
        .selection.mode,
    ).toBe("columns");
  });
});
