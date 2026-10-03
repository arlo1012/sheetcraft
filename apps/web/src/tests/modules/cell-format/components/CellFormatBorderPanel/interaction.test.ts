import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { CellBorderAction } from "@idea10/core/style";
import type { SelectionBorderState } from "@idea10/core/style-state";
import CellFormatBorderPanel from "../../../../../modules/cell-format/components/CellFormatBorderPanel.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
const border = { style: "thin", color: "#20242c" } as const;

function state(overrides: Partial<SelectionBorderState> = {}): SelectionBorderState {
  const empty = { value: undefined, mixed: false };
  return {
    top: empty,
    right: empty,
    bottom: empty,
    left: empty,
    innerHorizontal: empty,
    innerVertical: empty,
    diagonalUp: empty,
    diagonalDown: empty,
    ...overrides,
  };
}

function mountPanel(
  props: Partial<{
    state: SelectionBorderState;
    actions: CellBorderAction[];
    format: { style?: "double"; color?: string };
    capabilities: { innerHorizontal: boolean; innerVertical: boolean };
  }> = {},
) {
  const wrapper = mount(CellFormatBorderPanel, {
    props: { state: state(), actions: [], ...props },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));

describe("CellFormatBorderPanel", () => {
  test("replays preset actions into the side preview", async () => {
    const wrapper = mountPanel();
    await wrapper.get('[data-border-preset="outer"]').trigger("click");
    const actions = wrapper.emitted("update:actions")?.at(-1)?.[0] as CellBorderAction[];
    await wrapper.setProps({ actions });
    expect(wrapper.get('[data-border-side="top"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-border-side="innerHorizontal"]').attributes("aria-pressed")).toBe(
      "false",
    );
    await wrapper.setProps({ actions: [{ preset: "all", border }] });
    expect(wrapper.get('[data-border-side="innerHorizontal"]').attributes("aria-pressed")).toBe(
      "true",
    );
    expect(wrapper.get('[data-border-side="diagonalUp"]').attributes("aria-pressed")).toBe("false");
    expect(wrapper.get('[data-border-side="diagonalDown"]').attributes("aria-pressed")).toBe(
      "false",
    );
  });

  test("clears an existing matching side and applies to a mixed side", async () => {
    const wrapper = mountPanel({
      state: state({
        top: { value: border, mixed: false },
        right: { value: border, mixed: true },
      }),
    });
    await wrapper.get('[data-border-side="top"]').trigger("click");
    expect(wrapper.emitted("update:actions")?.at(-1)).toEqual([[{ preset: "top", border: null }]]);
    await wrapper.get('[data-border-side="right"]').trigger("click");
    expect(wrapper.emitted("update:actions")?.at(-1)).toEqual([[{ preset: "right", border }]]);
  });

  test("replays the format draft over visible borders before clearing a matching side", async () => {
    const wrapper = mountPanel({
      state: state({
        top: { value: { style: "thin", color: "#ff0000" }, mixed: false },
      }),
      format: { style: "double", color: "#a1b2c3" },
    });
    const preview = wrapper.get('[data-border-preview-edge="top"]');
    const lines = preview.findAll(".cell-format-border-preview-edge__line");
    expect(lines[0]!.attributes("stroke")).toBe("#a1b2c3");
    expect(lines).toHaveLength(2);
    await wrapper.get('[data-border-side="top"]').trigger("click");
    expect(wrapper.emitted("update:actions")?.at(-1)).toEqual([[{ preset: "top", border: null }]]);
  });

  test("clears all borders from the expanded line list and reuses the chosen style when drawing again", async () => {
    const wrapper = mountPanel({
      state: state({ top: { value: border, mixed: false } }),
    });
    await wrapper.get('[data-border-line-option="double"]').trigger("click");
    expect(wrapper.emitted("update:format")?.at(-1)).toEqual([{ style: "double" }]);
    await wrapper.setProps({ format: { style: "double" } });
    await wrapper.get('[data-border-line-option="none"]').trigger("click");
    const actions = wrapper.emitted("update:actions")?.at(-1)?.[0] as CellBorderAction[];
    expect(actions).toEqual([{ preset: "none" }]);
    await wrapper.setProps({ actions, format: { style: "double", color: "#a1b2c3" } });
    expect(wrapper.get('[data-border-line-option="none"]').attributes("aria-checked")).toBe("true");
    expect(wrapper.get('[data-border-side="top"]').attributes("aria-pressed")).toBe("false");
    await wrapper.get('[data-border-preset="outer"]').trigger("click");
    expect(wrapper.emitted("update:actions")?.at(-1)).toEqual([
      [{ preset: "none" }, { preset: "outer", border: { style: "double", color: "#a1b2c3" } }],
    ]);
  });

  test("toggles diagonal borders from the preview with pointer and keyboard actions", async () => {
    const wrapper = mountPanel();
    await wrapper.get('[data-border-preview-edge="diagonalUp"] line').trigger("click");
    const actions = wrapper.emitted("update:actions")?.at(-1)?.[0] as CellBorderAction[];
    expect(actions).toEqual([{ preset: "diagonalUp", border }]);
    await wrapper.setProps({ actions });
    expect(wrapper.get('[data-border-side="diagonalUp"]').attributes("aria-pressed")).toBe("true");
    await wrapper.get('[data-border-preview-edge="diagonalUp"]').trigger("keydown", { key: " " });
    expect(wrapper.emitted("update:actions")?.at(-1)).toEqual([
      [
        { preset: "diagonalUp", border },
        { preset: "diagonalUp", border: null },
      ],
    ]);
  });

  test("disables unavailable internal borders and keeps presets from drawing them in the preview", async () => {
    const wrapper = mountPanel({
      capabilities: { innerHorizontal: false, innerVertical: false },
    });
    expect(wrapper.get('[data-border-preset="inner"]').attributes("aria-disabled")).toBe("true");
    expect(wrapper.get('[data-border-side="innerHorizontal"]').attributes("aria-disabled")).toBe(
      "true",
    );
    expect(wrapper.get('[data-border-side="innerVertical"]').attributes("aria-disabled")).toBe(
      "true",
    );
    expect(wrapper.findAll(".cell-format-border-preview__samples > span")).toHaveLength(1);
    await wrapper
      .get('[data-border-preview-edge="innerHorizontal"]')
      .trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:actions")).toBeUndefined();
    await wrapper.setProps({ actions: [{ preset: "all", border }] });
    expect(wrapper.get('[data-border-side="top"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.get('[data-border-side="innerHorizontal"]').attributes("aria-pressed")).toBe(
      "false",
    );
    expect(
      wrapper.get('[data-border-preview-edge="innerHorizontal"]').findAll("line"),
    ).toHaveLength(0);
  });
});
