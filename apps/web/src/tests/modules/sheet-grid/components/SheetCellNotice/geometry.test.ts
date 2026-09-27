import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { SheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";
import SheetCellNotice from "../../../../../modules/sheet-grid/components/SheetCellNotice.vue";

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

function mountNotice(
  options: {
    frame?: SheetRenderFrame;
    title?: string;
    message?: string;
    closeLabel?: string;
    tone?: "warning" | "information";
    marker?: string;
  } = {},
) {
  const wrapper = mount(SheetCellNotice, {
    attrs: options.marker ? { [options.marker]: "" } : undefined,
    props: {
      frame: options.frame ?? createFrame(),
      address: { row: 3, column: 1 },
      title: options.title,
      message: options.message ?? "This value has already been entered.",
      closeLabel: options.closeLabel,
      tone: options.tone ?? "warning",
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("SheetCellNotice", () => {
  test("renders a warning below the rejected cell with its title, message, and close action", async () => {
    const wrapper = mountNotice({
      title: "Duplicate entry rejected",
      closeLabel: "Close",
      marker: "data-sheet-input-error-notice",
    });
    const notice = wrapper.get("[data-sheet-input-error-notice]");

    expect(notice.attributes("style")).toContain("left: 80px");
    expect(notice.attributes("style")).toContain("top: 92px");
    expect(notice.attributes("role")).toBe("alert");
    expect(notice.text()).toContain("Duplicate entry rejected");
    expect(notice.text()).toContain("This value has already been entered.");

    const close = wrapper.get("button");
    await close.trigger("pointerdown");
    await close.trigger("click");
    expect(wrapper.emitted("close")).toEqual([[]]);
  });

  test("renders an informational prompt without a close action and preserves the supplied text", () => {
    const wrapper = mountNotice({
      tone: "information",
      title: "Input information",
      message: "Choose a value from the list.\nLeave blank to skip.",
      marker: "data-sheet-validation-prompt",
    });
    const notice = wrapper.get("[data-sheet-validation-prompt]");

    expect(notice.attributes("role")).toBe("status");
    expect(notice.text()).toContain("Input information");
    expect(notice.get("p").text()).toBe("Choose a value from the list.\nLeave blank to skip.");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  test("omits an optional title", () => {
    const wrapper = mountNotice({ tone: "information", message: "Only the configured message." });
    expect(wrapper.find("strong").exists()).toBe(false);
    expect(wrapper.text()).toContain("Only the configured message.");
  });

  test("flips above a cell at the bottom of its pane and keeps within the horizontal edge", () => {
    const notice = mountNotice({
      frame: createFrame({ x: 760, y: 470, width: 80, height: 24 }),
      closeLabel: "Close",
    }).get("section");
    expect(notice.attributes("style")).toContain("left: 560px");
    expect(notice.attributes("style")).toContain("top: 380px");
  });

  test("lets a notice from a frozen pane use the full body viewport", () => {
    const notice = mountNotice({
      frame: createFrame(
        { x: 8, y: 0, width: 80, height: 24 },
        { id: "top", clip: { x: 0, y: 0, width: 800, height: 24 } },
      ),
      closeLabel: "Close",
    }).get("section");
    expect(notice.attributes("style")).toContain("left: 48px");
    expect(notice.attributes("style")).toContain("top: 50px");
    expect(notice.attributes("style")).toContain("max-width: 280px");
  });

  test("hides when the cell no longer intersects its pane", () => {
    const wrapper = mountNotice({ frame: createFrame({ x: -100, y: 42, width: 90, height: 24 }) });
    expect(wrapper.find("section").exists()).toBe(false);
  });
});
