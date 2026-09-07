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
    const preview = wrapper.get('[data-border-side="top"] svg');
    expect(preview.get("line").attributes("stroke")).toBe("#a1b2c3");
    expect(preview.findAll("line")).toHaveLength(2);
    await wrapper.get('[data-border-side="top"]').trigger("click");
    expect(wrapper.emitted("update:actions")?.at(-1)).toEqual([[{ preset: "top", border: null }]]);
  });
});
