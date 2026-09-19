import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { SheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";
import SheetInputErrorNotice from "../../../../../modules/sheet-grid/components/SheetInputErrorNotice.vue";

const wrappers: ReturnType<typeof mount>[] = [];

function createFrame(
  rect = { x: 40, y: 42, width: 90, height: 24 },
  pane = { id: "body", clip: { x: 0, y: 0, width: 800, height: 500 } },
) {
  return {
    body: { x: 40, y: 24, width: 800, height: 500 },
    panes: { [pane.id]: { clip: pane.clip } },
    layout: {
      getCellViewportRect: () => rect,
      getPaneForAddress: () => pane.id,
    },
  } as unknown as SheetRenderFrame;
}

function mountNotice(frame = createFrame()) {
  const wrapper = mount(SheetInputErrorNotice, {
    props: {
      frame,
      address: { row: 3, column: 1 },
      title: "Duplicate entry rejected",
      message: "This value has already been entered.",
      closeLabel: "Close",
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("SheetInputErrorNotice", () => {
  test("appears below the rejected cell", () => {
    const notice = mountNotice().get("[data-sheet-input-error-notice]");
    expect(notice.attributes("style")).toContain("left: 80px");
    expect(notice.attributes("style")).toContain("top: 92px");
    expect(notice.attributes("role")).toBe("alert");
  });

  test("flips above a cell at the bottom of its pane and keeps within the horizontal edge", () => {
    const notice = mountNotice(createFrame({ x: 760, y: 470, width: 80, height: 24 })).get(
      "[data-sheet-input-error-notice]",
    );
    expect(notice.attributes("style")).toContain("left: 560px");
    expect(notice.attributes("style")).toContain("top: 380px");
  });

  test("lets a notice from a frozen pane use the full body viewport", () => {
    const notice = mountNotice(
      createFrame(
        { x: 8, y: 0, width: 80, height: 24 },
        { id: "top", clip: { x: 0, y: 0, width: 800, height: 24 } },
      ),
    ).get("[data-sheet-input-error-notice]");
    expect(notice.attributes("style")).toContain("left: 48px");
    expect(notice.attributes("style")).toContain("top: 50px");
    expect(notice.attributes("style")).toContain("max-width: 280px");
  });

  test("hides when the cell no longer intersects its pane", () => {
    const wrapper = mountNotice(createFrame({ x: -100, y: 42, width: 90, height: 24 }));
    expect(wrapper.find("[data-sheet-input-error-notice]").exists()).toBe(false);
  });

  test("emits close without allowing the close pointer event to reach the grid", async () => {
    const wrapper = mountNotice();
    const close = wrapper.get("button");
    await close.trigger("pointerdown");
    await close.trigger("click");
    expect(wrapper.emitted("close")).toEqual([[]]);
  });
});
