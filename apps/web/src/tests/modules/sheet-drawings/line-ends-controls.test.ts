import { mount, type VueWrapper } from "@vue/test-utils";
import { isVNode, nextTick, type VNode } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { ShapeLineEndKind, ShapeLineEnds } from "@sheetcraft/core/shape-line-ends";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import ShapeLineEndsControls from "../../../modules/sheet-drawings/components/ShapeLineEndsControls.vue";
import { getShapeEndPaint } from "../../../modules/sheet-drawings/shape-line-paint";
import { getStandardShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});
function fixture(ends?: ShapeLineEnds, handler?: (next: ShapeLineEnds | undefined) => boolean) {
  const request = vi.mocked(
    handler ?? vi.fn<(next: ShapeLineEnds | undefined) => boolean>(() => true),
  );
  const wrapper = mount(ShapeLineEndsControls, {
    props: { ends, handler: request },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return { wrapper, handler: request };
}
const section = (wrapper: VueWrapper, side: "begin" | "end") =>
  wrapper.get(`[data-line-end="${side}"]`);
const select = (wrapper: VueWrapper, side: "begin" | "end") =>
  section(wrapper, side).getComponent(TSelect);
const sizeButton = (wrapper: VueWrapper, id: string) => wrapper.get(`[data-line-end-size="${id}"]`);
function typeCallback(wrapper: VueWrapper, side: "begin" | "end") {
  return select(wrapper, side).vm.$.vnode.props!.onChange as (value: unknown) => void;
}
function sizeCallback(wrapper: VueWrapper, id: string) {
  const visit = (node: VNode): (() => void) | undefined => {
    if (node.props?.["data-line-end-size"] === id) return node.props.onClick as () => void;
    if (Array.isArray(node.children))
      for (const child of node.children) {
        if (!isVNode(child)) continue;
        const result = visit(child);
        if (result) return result;
      }
  };
  const action = visit(wrapper.vm.$.subTree);
  if (!action) throw new Error(`Missing size callback: ${id}`);
  return action;
}
async function chooseType(wrapper: VueWrapper, side: "begin" | "end", value: unknown) {
  select(wrapper, side).vm.$emit("change", value);
  await nextTick();
}
const previewDrawing: SheetGraphicDrawing = {
  id: "test-line",
  kind: "shape",
  name: "",
  anchor: { row: 0, column: 0 },
  offsetX: 0,
  offsetY: 0,
  width: 56,
  height: 1,
  shape: "line",
  shapeGeometry: { preset: "line" },
  text: "",
  fill: "transparent",
  stroke: "#000000",
  strokeWidth: 2,
  color: "#000000",
  fontSize: 12,
  bold: false,
  italic: false,
  rotation: 0,
};
const dimensions = ["small", "medium", "large"] as const;
const sizes = dimensions.flatMap((width) => dimensions.map((length) => ({ width, length })));

describe("concrete line endpoint controls", () => {
  test("both type controls have all six choices and display controlled, independent values", async () => {
    const ends: ShapeLineEnds = {
      begin: { kind: "stealth", width: "large", length: "small" },
      end: { kind: "open", width: "small", length: "large" },
    };
    const { wrapper, handler } = fixture(ends);
    for (const side of ["begin", "end"] as const)
      expect(select(wrapper, side).props("options")).toEqual([
        { value: "none", label: "No Arrow" },
        { value: "triangle", label: "Arrow" },
        { value: "open", label: "Open Arrow" },
        { value: "stealth", label: "Notched Right Arrow" },
        { value: "diamond", label: "Diamond Arrow" },
        { value: "oval", label: "Oval Arrow" },
      ]);
    expect(select(wrapper, "begin").props("modelValue")).toBe("stealth");
    expect(select(wrapper, "end").props("modelValue")).toBe("open");
    expect(sizeButton(wrapper, "begin-large-small").attributes("aria-pressed")).toBe("true");
    expect(sizeButton(wrapper, "end-small-large").attributes("aria-pressed")).toBe("true");
    for (const kind of ["triangle", "open", "stealth", "diamond", "oval"] as const) {
      await chooseType(wrapper, "begin", kind);
      const next = handler.mock.calls.at(-1)![0] as ShapeLineEnds;
      expect(next).toEqual({ ...ends, begin: { ...ends.begin, kind } });
      expect(next).not.toBe(ends);
      expect(next.begin).not.toBe(ends.begin);
      expect(next.end).not.toBe(ends.end);
      expect(select(wrapper, "begin").props("modelValue")).toBe("stealth");
    }
    await chooseType(wrapper, "end", "oval");
    expect(handler).toHaveBeenLastCalledWith({ ...ends, end: { ...ends.end, kind: "oval" } });
    expect(ends.begin!.kind).toBe("stealth");
    expect(ends.end!.kind).toBe("open");
    await wrapper.setProps({ ends: handler.mock.calls.at(-1)![0] });
    expect(select(wrapper, "end").props("modelValue")).toBe("oval");
  });

  test("none disables only that size grid, and resets remove only the chosen endpoint", async () => {
    const ends: ShapeLineEnds = { end: { kind: "diamond", width: "large" } };
    const { wrapper, handler } = fixture(ends);
    expect(select(wrapper, "begin").props("modelValue")).toBe("none");
    expect(section(wrapper, "begin").findAll("button:disabled")).toHaveLength(9);
    expect(section(wrapper, "begin").findAll('[aria-pressed="true"]')).toHaveLength(0);
    expect(section(wrapper, "begin").findAll("[data-line-end-preview]")).toHaveLength(0);
    expect(section(wrapper, "end").findAll("button:disabled")).toHaveLength(0);
    await sizeButton(wrapper, "begin-large-large").trigger("click");
    sizeCallback(wrapper, "begin-large-large")();
    expect(handler).not.toHaveBeenCalled();
    await chooseType(wrapper, "begin", "triangle");
    expect(handler).toHaveBeenLastCalledWith({ ...ends, begin: { kind: "triangle" } });
    await wrapper.setProps({ ends: handler.mock.calls.at(-1)![0] });
    expect(sizeButton(wrapper, "begin-medium-medium").attributes("aria-pressed")).toBe("true");
    await chooseType(wrapper, "begin", "none");
    expect(handler).toHaveBeenLastCalledWith(ends);
    await wrapper.setProps({ ends: handler.mock.calls.at(-1)![0] });
    expect(section(wrapper, "begin").findAll("button:disabled")).toHaveLength(9);
    await chooseType(wrapper, "end", "none");
    expect(handler).toHaveBeenLastCalledWith(undefined);
    expect(ends).toEqual({ end: { kind: "diamond", width: "large" } });
    await wrapper.setProps({ ends: undefined });
    expect(wrapper.findAll("button:disabled")).toHaveLength(18);
  });

  test.each<ShapeLineEndKind>(["triangle", "open", "stealth", "diamond", "oval"])(
    "%s renders every width × length pair with real endpoint paint and sends sparse copied values",
    async (kind) => {
      const ends: ShapeLineEnds = {
        begin: { kind, width: "medium", length: "medium" },
        end: { kind },
      };
      const { wrapper, handler } = fixture(ends);
      const geometry = getStandardShapeGeometry(previewDrawing.shapeGeometry, 56, 1);
      for (const side of ["begin", "end"] as const) {
        const paths: string[] = [];
        for (const size of sizes) {
          const button = sizeButton(wrapper, `${side}-${size.width}-${size.length}`);
          expect(button.attributes("aria-label")).toContain(
            `Width ${size.width === "small" ? "Small" : size.width === "medium" ? "Medium" : "Large"}`,
          );
          expect(button.attributes("aria-label")).toContain(
            `Length ${size.length === "small" ? "Small" : size.length === "medium" ? "Medium" : "Large"}`,
          );
          const paint = getShapeEndPaint(
            { ...previewDrawing, shapeLineEnds: { [side]: { kind, ...size } } },
            geometry,
          )[0]!;
          const path = button.get("[data-line-end-preview]");
          expect(path.attributes("d")).toBe(paint.d);
          expect(path.attributes("fill")).toBe(paint.filled ? "currentColor" : "none");
          expect(path.attributes("d")).not.toMatch(/NaN|Infinity|undefined|https?:/u);
          paths.push(path.attributes("d")!);
          await button.trigger("click");
          const next = handler.mock.calls.at(-1)![0] as ShapeLineEnds;
          expect(next[side]).toEqual({
            kind,
            ...(size.width === "medium" ? {} : { width: size.width }),
            ...(size.length === "medium" ? {} : { length: size.length }),
          });
          expect(next.begin).not.toBe(ends.begin);
          expect(next.end).not.toBe(ends.end);
          expect(sizeButton(wrapper, `${side}-medium-medium`).attributes("aria-pressed")).toBe(
            "true",
          );
        }
        expect(new Set(paths).size).toBe(9);
      }
      expect(wrapper.find("img, image, use").exists()).toBe(false);
      expect(ends.begin).toEqual({ kind, width: "medium", length: "medium" });
      expect(ends.end).toEqual({ kind });
    },
  );

  test.each(["false", "throw"])(
    "%s rejection preserves controlled values and explains the failure",
    async (mode) => {
      const ends: ShapeLineEnds = {
        begin: { kind: "open" },
        end: { kind: "oval", width: "large" },
      };
      const handler = vi.fn(() => {
        if (mode === "throw") throw new Error("Rejected by owner");
        return false;
      });
      const { wrapper } = fixture(ends, handler);
      const previousPaths = wrapper
        .findAll("[data-line-end-preview]")
        .map((path) => path.attributes("d"));
      await chooseType(wrapper, "end", "diamond");
      expect(wrapper.get('[role="alert"]').text()).toContain("current values are preserved");
      expect(select(wrapper, "end").props("modelValue")).toBe("oval");
      await sizeButton(wrapper, "begin-small-large").trigger("click");
      expect(sizeButton(wrapper, "begin-medium-medium").attributes("aria-pressed")).toBe("true");
      expect(
        wrapper.findAll("[data-line-end-preview]").map((path) => path.attributes("d")),
      ).toEqual(previousPaths);
      expect(ends).toEqual({ begin: { kind: "open" }, end: { kind: "oval", width: "large" } });
      await wrapper.setProps({ handler: vi.fn(() => true) });
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    },
  );

  test("rejected handlers receive detached records even if they mutate the attempted values", async () => {
    const ends: ShapeLineEnds = {
      begin: { kind: "triangle" },
      end: { kind: "oval", width: "large" },
    };
    const handler = vi.fn((next: ShapeLineEnds | undefined) => {
      next!.end!.kind = "open";
      next!.begin!.width = "small";
      return false;
    });
    const { wrapper } = fixture(ends, handler);
    await chooseType(wrapper, "begin", "diamond");
    expect(ends).toEqual({ begin: { kind: "triangle" }, end: { kind: "oval", width: "large" } });
    expect(select(wrapper, "begin").props("modelValue")).toBe("triangle");
    expect(select(wrapper, "end").props("modelValue")).toBe("oval");
  });

  test("disabled controls block emitted events and captured callbacks without changing values", async () => {
    const { wrapper, handler } = fixture({ begin: { kind: "triangle" }, end: { kind: "open" } });
    const oldType = typeCallback(wrapper, "begin"),
      oldSize = sizeCallback(wrapper, "end-small-small");
    await wrapper.setProps({ disabled: true });
    expect(wrapper.findAll("button:disabled")).toHaveLength(18);
    expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(0);
    expect(select(wrapper, "begin").props("disabled")).toBe(true);
    expect(select(wrapper, "end").props("disabled")).toBe(true);
    oldType("oval");
    oldSize();
    await chooseType(wrapper, "begin", "diamond");
    sizeCallback(wrapper, "end-large-large")();
    expect(handler).not.toHaveBeenCalled();
    expect(select(wrapper, "begin").props("modelValue")).toBe("triangle");
    await wrapper.setProps({ disabled: false });
    oldType("oval");
    oldSize();
    expect(handler).not.toHaveBeenCalled();
  });

  test("callbacks cannot retarget a different handler, endpoint object, or remounted owner", async () => {
    const ends: ShapeLineEnds = { begin: { kind: "triangle" }, end: { kind: "open" } };
    const { wrapper, handler } = fixture(ends);
    const oldType = typeCallback(wrapper, "begin"),
      oldSize = sizeCallback(wrapper, "end-small-small");
    const replacement = vi.fn(() => true);
    await wrapper.setProps({ handler: replacement });
    oldType("oval");
    oldSize();
    expect(handler).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    const handlerType = typeCallback(wrapper, "begin"),
      handlerSize = sizeCallback(wrapper, "end-large-large");
    await wrapper.setProps({ ends: { begin: { kind: "diamond" }, end: { kind: "oval" } } });
    handlerType("open");
    handlerSize();
    expect(replacement).not.toHaveBeenCalled();
    await wrapper.setProps({ ends, handler });
    oldType("oval");
    oldSize();
    expect(handler).not.toHaveBeenCalled();
    const lastType = typeCallback(wrapper, "begin"),
      lastSize = sizeCallback(wrapper, "end-large-large");
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    lastType("oval");
    lastSize();
    expect(handler).not.toHaveBeenCalled();
  });

  test("grid arrow keys and Home/End move one roving focus without applying values; Tab and Escape stay normal", async () => {
    const { wrapper, handler } = fixture({ begin: { kind: "triangle" }, end: { kind: "open" } });
    const button = (id: string) => sizeButton(wrapper, `begin-${id}`).element as HTMLButtonElement;
    expect(wrapper.findAll('button[tabindex="0"]')).toHaveLength(2);
    button("medium-medium").focus();
    await sizeButton(wrapper, "begin-medium-medium").trigger("keydown", { key: "ArrowRight" });
    expect(document.activeElement).toBe(button("medium-large"));
    await sizeButton(wrapper, "begin-medium-large").trigger("keydown", { key: "ArrowRight" });
    expect(document.activeElement).toBe(button("medium-large"));
    await sizeButton(wrapper, "begin-medium-large").trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(button("large-large"));
    await sizeButton(wrapper, "begin-large-large").trigger("keydown", { key: "ArrowUp" });
    expect(document.activeElement).toBe(button("medium-large"));
    await sizeButton(wrapper, "begin-medium-large").trigger("keydown", { key: "ArrowLeft" });
    expect(document.activeElement).toBe(button("medium-medium"));
    await sizeButton(wrapper, "begin-medium-medium").trigger("keydown", { key: "Home" });
    expect(document.activeElement).toBe(button("small-small"));
    await sizeButton(wrapper, "begin-small-small").trigger("keydown", { key: "End" });
    expect(document.activeElement).toBe(button("large-large"));
    expect(section(wrapper, "begin").findAll('button[tabindex="0"]')).toHaveLength(1);
    expect(sizeButton(wrapper, "begin-medium-medium").attributes("aria-pressed")).toBe("true");
    expect(handler).not.toHaveBeenCalled();
    for (const key of ["Escape", "Tab", "Enter"]) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      button("large-large").dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    const shortcut = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    button("large-large").dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(button("large-large"));
  });

  test("composing grid keys do not move focus or consume input", () => {
    const { wrapper, handler } = fixture({ begin: { kind: "triangle" } });
    const button = sizeButton(wrapper, "begin-medium-medium").element as HTMLButtonElement;
    button.focus();
    for (const key of ["ArrowRight", "Home", "End"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(button);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  test("locale changes labels without changing stored endpoint values", async () => {
    const { wrapper, handler } = fixture({
      end: { kind: "stealth", width: "small", length: "large" },
    });
    await wrapper.setProps({ locale: "zh-CN" });
    expect(wrapper.attributes("aria-label")).toBe("线条箭头");
    expect(select(wrapper, "begin").attributes("aria-label")).toBe("起点箭头 类型");
    expect(select(wrapper, "end").props("options")).toContainEqual({
      value: "stealth",
      label: "燕尾箭头",
    });
    expect(sizeButton(wrapper, "end-small-large").attributes("aria-label")).toBe(
      "终点箭头 大小: 宽度 小, 长度 大",
    );
    expect(select(wrapper, "end").props("modelValue")).toBe("stealth");
    expect(handler).not.toHaveBeenCalled();
  });
});
