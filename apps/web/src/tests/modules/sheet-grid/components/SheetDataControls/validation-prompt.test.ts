import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { SheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";
import SheetDataControls from "../../../../../modules/sheet-grid/components/SheetDataControls.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];

function createFrame(rect = { x: 10, y: 12, width: 90, height: 24 }): SheetRenderFrame {
  return {
    body: { x: 100, y: 200, width: 800, height: 500 },
    panes: { body: { clip: { x: 0, y: 0, width: 800, height: 500 } } },
    rowHeaders: [],
    columnHeaders: [],
    layout: {
      getCellViewportRect: () => rect,
      getPaneForAddress: () => "body",
      forEachVisibleCell: () => undefined,
    },
  } as unknown as SheetRenderFrame;
}

function mountControls(
  options: { frame?: SheetRenderFrame; suppressValidationPrompt?: boolean } = {},
) {
  const wrapper = mount(SheetDataControls, {
    props: {
      frame: options.frame ?? createFrame(),
      activeCell: { row: 1, column: 2 },
      validationInfo: {
        values: ["Open"],
        prompt: {
          title: "Configured title",
          message: "Configured prompt\nkeeps its line break.",
        },
      },
      suppressValidationPrompt: options.suppressValidationPrompt,
      showOutline: false,
      readOnly: false,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("SheetDataControls validation prompt", () => {
  test("reuses the passive cell notice and preserves configured prompt copy", () => {
    const wrapper = mountControls();
    const prompt = wrapper.get("[data-sheet-validation-prompt]");

    expect(prompt.attributes("data-sheet-cell-notice")).toBeDefined();
    expect(prompt.attributes("role")).toBe("status");
    expect(prompt.attributes("style")).toContain("left: 110px");
    expect(prompt.attributes("style")).toContain("top: 238px");
    expect(prompt.text()).toContain("Configured title");
    expect(prompt.get("p").text()).toBe("Configured prompt\nkeeps its line break.");
    expect(prompt.find("button").exists()).toBe(false);
  });

  test("hides while the validation list is open or another cell notice takes precedence", async () => {
    const wrapper = mountControls();
    expect(wrapper.find("[data-sheet-validation-prompt]").exists()).toBe(true);

    await wrapper.get(".sheet-data-controls__validation").trigger("click");
    expect(wrapper.find("[data-sheet-validation-prompt]").exists()).toBe(false);
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true);

    await wrapper.setProps({ suppressValidationPrompt: true });
    await wrapper.get(".sheet-data-controls__validation").trigger("click");
    expect(wrapper.find("[data-sheet-validation-prompt]").exists()).toBe(false);
  });

  test("does not create a notice when no input prompt was configured", async () => {
    const wrapper = mountControls();
    await wrapper.setProps({ validationInfo: { values: ["Open"] } });
    expect(wrapper.find("[data-sheet-validation-prompt]").exists()).toBe(false);
  });

  test("does not render a prompt for an active cell outside its pane", () => {
    const wrapper = mountControls({
      frame: createFrame({ x: -100, y: 12, width: 90, height: 24 }),
    });
    expect(wrapper.find("[data-sheet-validation-prompt]").exists()).toBe(false);
  });
});
