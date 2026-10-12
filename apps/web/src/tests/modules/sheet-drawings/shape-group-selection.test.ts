import { mount, type VueWrapper } from "@vue/test-utils";
import { isVNode, nextTick, type VNode } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import ShapeGroupSelection from "../../../modules/sheet-drawings/components/ShapeGroupSelection.vue";
import { createAppI18n } from "../../../shared/i18n";
import * as floatingPanel from "../../../shared/floating/useFloatingPanel";

const mounted: VueWrapper[] = [];
const rect: ShapeFrameRect = { x: 400, y: 300, width: 100, height: 80 };
const fragment: FloatingImageViewportFragment = {
  paneId: "body",
  rect: { x: 100, y: 100, width: 200, height: 160 },
  clippedRect: { x: 90, y: 60, width: 250, height: 220 },
};
const paneClip: Rect = { x: 20, y: 10, width: 780, height: 590 };
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function fixture(
  props: {
    rotation?: number;
    disabled?: boolean;
    locale?: string;
    paneClip?: Rect;
    fragment?: FloatingImageViewportFragment;
    rect?: ShapeFrameRect;
    selectionKey?: string;
    showHandles?: boolean;
    showAction?: boolean;
    showFormat?: boolean;
  } = {},
): VueWrapper {
  const wrapper = mount(ShapeGroupSelection, {
    attachTo: document.body,
    props: { rect, fragment, paneClip, rotation: 0, selectionKey: "sheet-1:group-a", ...props },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
function pointer(element: Element, button = 0): PointerEvent {
  const event = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button,
    pointerId: 7,
    clientX: 200,
    clientY: 100,
  });
  element.dispatchEvent(event);
  return event;
}
function key(element: Element, name: string, extra: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  element.dispatchEvent(event);
  return event;
}
function ungroupButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>("[data-shape-group-ungroup]");
  if (!button) throw new Error("Missing floating Ungroup action.");
  return button;
}
function renderedCallback(
  wrapper: VueWrapper,
  marker: string,
  eventName: string,
): (event: Event) => void {
  function find(node: VNode): VNode | undefined {
    if (node.props && marker in node.props) return node;
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        if (!isVNode(child)) continue;
        const match = find(child);
        if (match) return match;
      }
    }
    return undefined;
  }
  const callback: unknown = find(wrapper.vm.$.subTree)?.props?.[eventName];
  if (typeof callback !== "function") throw new Error(`Missing rendered callback: ${marker}`);
  return callback as (event: Event) => void;
}

describe("genuine shape group selection frame", () => {
  test("uses the complete projected frame rather than the canonical sheet rect or a fake graphic", () => {
    const wrapper = fixture({ rotation: 37 });
    const outline = wrapper.get("[data-shape-group-outline]");
    expect(outline.attributes("x")).toBe("80");
    expect(outline.attributes("y")).toBe("90");
    expect(outline.attributes("width")).toBe("200");
    expect(outline.attributes("height")).toBe("160");
    expect(outline.element.parentElement!.getAttribute("transform")).toBe("rotate(37 180 170)");
    expect(wrapper.findAll("[data-shape-group-resize]")).toHaveLength(8);
    expect(
      wrapper.find("[data-standard-shape-selection], [data-picture-group-toolbar]").exists(),
    ).toBe(false);
    expect(wrapper.findAll("[data-shape-group-rotation-stem]")).toHaveLength(1);
    const corner = pictureFrameLocalToWorld(fragment.rect, 37, { x: 200, y: 160 });
    const handle = wrapper.get('[data-shape-group-resize="se"]').element as HTMLElement;
    expect(parseFloat(handle.style.left)).toBeCloseTo(corner.x - paneClip.x);
    expect(parseFloat(handle.style.top)).toBeCloseTo(corner.y - paneClip.y);
    const rotation = pictureFrameLocalToWorld(fragment.rect, 37, { x: 100, y: -24 });
    const rotationHandle = wrapper.get("[data-shape-group-rotate]").element as HTMLElement;
    expect(parseFloat(rotationHandle.style.left)).toBeCloseTo(rotation.x - paneClip.x);
    expect(parseFloat(rotationHandle.style.top)).toBeCloseTo(rotation.y - paneClip.y);
  });

  test("only the narrow border stroke starts a move and its unfilled interior has no move handler", () => {
    const wrapper = fixture();
    const hit = wrapper.get("[data-shape-group-move]");
    expect(hit.attributes("fill")).toBe("none");
    expect(hit.attributes("stroke")).toBe("transparent");
    expect(hit.attributes("stroke-width")).toBe("8");
    expect(hit.attributes("pointer-events")).toBe("stroke");
    const event = pointer(hit.element);
    expect(wrapper.emitted("move")).toEqual([[event]]);
    expect(event.defaultPrevented).toBe(true);
    pointer(wrapper.element);
    pointer(wrapper.get("[data-shape-group-outline]").element);
    expect(wrapper.emitted("move")).toHaveLength(1);
    const rightClick = pointer(hit.element, 2);
    expect(rightClick.defaultPrevented).toBe(false);
    expect(wrapper.emitted("move")).toHaveLength(1);
  });

  test("forwards each resize direction and rotation pointer unchanged for the host-owned session", () => {
    const wrapper = fixture();
    const handles = wrapper.findAll("[data-shape-group-resize]");
    const expected = handles.map((handle) => [
      handle.attributes("data-shape-group-resize"),
      pointer(handle.element),
    ]);
    expect(wrapper.emitted("resize")).toEqual(expected);
    const rotation = pointer(wrapper.get("[data-shape-group-rotate]").element);
    expect(wrapper.emitted("rotate")).toEqual([[rotation]]);
  });

  test("owns boundary handles once and clips their complete hit boxes and rotated stem to the pane", () => {
    const left = fixture({ paneClip: { x: 0, y: 0, width: 200, height: 600 } });
    const right = fixture({ paneClip: { x: 200, y: 0, width: 600, height: 600 } });
    expect(left.find('[data-shape-group-resize="n"]').exists()).toBe(false);
    expect(right.find('[data-shape-group-resize="n"]').exists()).toBe(true);
    expect(left.findAll("[data-shape-group-resize]")).toHaveLength(3);
    expect(right.findAll("[data-shape-group-resize]")).toHaveLength(5);
    expect(left.find("[data-shape-group-rotate]").exists()).toBe(false);
    expect(right.find("[data-shape-group-rotate]").exists()).toBe(true);
    const clip = right.get("[data-shape-group-selection-clip]").element as HTMLElement;
    expect(clip.style.left).toBe("110px");
    expect(clip.style.top).toBe("-60px");
    expect(clip.style.width).toBe("600px");
    expect(clip.style.height).toBe("600px");
    const handle = right.get('[data-shape-group-resize="n"]').element as HTMLElement;
    expect(handle.parentElement).toBe(clip);
    expect(handle.style.left).toBe("0px");
    expect(right.get("svg").attributes("width")).toBe("600");
    expect(right.get("svg").attributes("height")).toBe("600");
    expect(right.get("[data-shape-group-outline]").attributes("x")).toBe("-100");
  });

  test("rotation arrows support fine and shift increments while Escape and modified keys reach the host", () => {
    const wrapper = fixture();
    const handle = wrapper.get("[data-shape-group-rotate]").element;
    const host = vi.fn();
    wrapper.element.addEventListener("keydown", host);
    expect(key(handle, "ArrowRight").defaultPrevented).toBe(true);
    key(handle, "ArrowLeft", { shiftKey: true });
    key(handle, "ArrowUp");
    key(handle, "ArrowDown");
    expect(wrapper.emitted("nudgeRotation")).toEqual([[1], [-15], [1], [-1]]);
    expect(host).not.toHaveBeenCalled();
    const escape = key(handle, "Escape");
    expect(escape.defaultPrevented).toBe(false);
    expect(host).toHaveBeenLastCalledWith(escape);
    const modified = key(handle, "ArrowRight", { ctrlKey: true });
    expect(modified.defaultPrevented).toBe(false);
    expect(host).toHaveBeenLastCalledWith(modified);
    expect(wrapper.emitted("nudgeRotation")).toHaveLength(4);
    key(handle, "ArrowRight", { isComposing: true });
    expect(wrapper.emitted("nudgeRotation")).toHaveLength(4);
  });

  test("has focusable, translated rotate and explicit Ungroup controls without a format pane", async () => {
    const wrapper = fixture({ locale: "zh-CN" });
    const ungroup = ungroupButton();
    expect(ungroup.parentElement!.parentElement).toBe(document.body);
    expect(ungroup.parentElement!.style.position).toBe("fixed");
    expect(ungroup.textContent!.trim()).toBe("取消组合");
    expect(ungroup.getAttribute("aria-label")).toBe("取消组合");
    expect(ungroup.title).toBe("取消组合");
    expect(ungroup.type).toBe("button");
    ungroup.focus();
    expect(document.activeElement).toBe(ungroup);
    ungroup.click();
    expect(wrapper.emitted("ungroup")).toEqual([[]]);
    const rotation = wrapper.get("[data-shape-group-rotate]").element as HTMLButtonElement;
    rotation.focus();
    expect(document.activeElement).toBe(rotation);
    expect(rotation.getAttribute("aria-label")).toBeTruthy();
    expect(
      wrapper.find("[data-shape-format-trigger], [data-picture-group-action='format']").exists(),
    ).toBe(false);
    await wrapper.setProps({ locale: "en-US" });
    expect(ungroup.textContent!.trim()).toBe("Ungroup");
    expect(ungroup.getAttribute("aria-label")).toBe("Ungroup");
  });

  test("the shared floating container exposes real Format and Ungroup with stale-owner rejection", async () => {
    const wrapper = fixture({ showFormat: true });
    const format = document.querySelector<HTMLButtonElement>("[data-shape-group-format]")!;
    expect(format.parentElement).toBe(ungroupButton().parentElement);
    expect(format.parentElement!.parentElement).toBe(document.body);
    format.focus();
    expect(document.activeElement).toBe(format);
    format.click();
    expect(wrapper.emitted("format")).toEqual([[]]);
    const retained = renderedCallback(wrapper, "data-shape-group-format", "onClick");
    await wrapper.setProps({ selectionKey: "sheet-1:other", showFormat: false });
    retained(new MouseEvent("click"));
    expect(wrapper.emitted("format")).toHaveLength(1);
    expect(document.querySelector("[data-shape-group-format]")).toBeNull();
  });

  test("disabled synthetic control events cannot request mutations and close the floating action", async () => {
    const wrapper = fixture({ disabled: true });
    expect(wrapper.get("[data-shape-group-move]").attributes("pointer-events")).toBe("none");
    expect(document.querySelector("[data-shape-group-ungroup]")).toBeNull();
    for (const handle of wrapper.findAll("button")) {
      expect((handle.element as HTMLButtonElement).disabled).toBe(true);
      pointer(handle.element);
      key(handle.element, "ArrowRight");
      await handle.trigger("click");
    }
    pointer(wrapper.get("[data-shape-group-move]").element);
    for (const event of ["move", "resize", "rotate", "nudgeRotation", "ungroup"]) {
      expect(wrapper.emitted(event)).toBeUndefined();
    }
    await wrapper.setProps({ disabled: false });
    pointer(wrapper.get("[data-shape-group-move]").element);
    expect(wrapper.emitted("move")).toHaveLength(1);
  });

  test("anchors the shared floating action to a visible clip even when frame corners are offscreen", async () => {
    const floating = vi.spyOn(floatingPanel, "useFloatingPanel");
    const wrapper = fixture({
      fragment: {
        paneId: "body",
        rect: { x: -300, y: -100, width: 1000, height: 600 },
        clippedRect: { x: 100, y: 100, width: 80, height: 80 },
      },
      paneClip: { x: 100, y: 100, width: 80, height: 80 },
    });
    await nextTick();
    vi.spyOn(wrapper.element, "getBoundingClientRect").mockReturnValue(
      new DOMRect(600, 400, 80, 80),
    );
    const [reference, , open, options] = floating.mock.calls[0]!;
    expect(open.value).toBe(true);
    expect(options).toEqual({ placement: "right-start", offset: 12 });
    const visible = reference.value!.getBoundingClientRect();
    expect([visible.x, visible.y, visible.width, visible.height]).toEqual([600, 400, 80, 80]);
    expect(ungroupButton().parentElement!.parentElement).toBe(document.body);
    expect(wrapper.get("[data-shape-group-selection-clip]").element.contains(ungroupButton())).toBe(
      false,
    );
    expect(ungroupButton().getAttribute("data-shape-group-action-owner")).toBe("sheet-1:group-a");
    await wrapper.setProps({ showAction: false });
    expect(open.value).toBe(false);
    expect(document.querySelector("[data-shape-group-ungroup]")).toBeNull();
    expect(wrapper.find("[data-shape-group-outline]").exists()).toBe(true);
  });

  test("member selection retains a movable group border while hiding its owner handles and action", async () => {
    const wrapper = fixture();
    const oldResize = renderedCallback(wrapper, "data-shape-group-resize", "onPointerdown");
    const oldRotate = renderedCallback(wrapper, "data-shape-group-rotate", "onPointerdown");
    const oldNudge = renderedCallback(wrapper, "data-shape-group-rotate", "onKeydown");
    const oldUngroup = renderedCallback(wrapper, "data-shape-group-ungroup", "onClick");
    await wrapper.setProps({ showHandles: false });
    expect(wrapper.find("[data-shape-group-outline]").exists()).toBe(true);
    expect(wrapper.findAll("[data-shape-group-resize]")).toHaveLength(0);
    expect(
      wrapper.find("[data-shape-group-rotate], [data-shape-group-rotation-stem]").exists(),
    ).toBe(false);
    expect(document.querySelector("[data-shape-group-ungroup]")).toBeNull();
    oldResize(new PointerEvent("pointerdown", { button: 0 }));
    oldRotate(new PointerEvent("pointerdown", { button: 0 }));
    oldNudge(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    oldUngroup(new MouseEvent("click"));
    for (const event of ["resize", "rotate", "nudgeRotation", "ungroup"]) {
      expect(wrapper.emitted(event)).toBeUndefined();
    }
    const border = pointer(wrapper.get("[data-shape-group-move]").element);
    expect(wrapper.emitted("move")).toEqual([[border]]);
    await wrapper.setProps({ showHandles: true, showAction: false });
    expect(wrapper.findAll("[data-shape-group-resize]")).toHaveLength(8);
    expect(wrapper.find("[data-shape-group-rotate]").exists()).toBe(true);
    expect(document.querySelector("[data-shape-group-ungroup]")).toBeNull();
  });

  test("every retained rendered callback rejects a previous selection owner", async () => {
    const wrapper = fixture();
    const previous = [
      [
        renderedCallback(wrapper, "data-shape-group-move", "onPointerdown"),
        new PointerEvent("pointerdown", { button: 0 }),
      ],
      [
        renderedCallback(wrapper, "data-shape-group-resize", "onPointerdown"),
        new PointerEvent("pointerdown", { button: 0 }),
      ],
      [
        renderedCallback(wrapper, "data-shape-group-rotate", "onPointerdown"),
        new PointerEvent("pointerdown", { button: 0 }),
      ],
      [
        renderedCallback(wrapper, "data-shape-group-rotate", "onKeydown"),
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      ],
      [renderedCallback(wrapper, "data-shape-group-ungroup", "onClick"), new MouseEvent("click")],
    ] as const;
    await wrapper.setProps({ selectionKey: "sheet-1:group-b" });
    for (const [callback, event] of previous) callback(event);
    for (const event of ["move", "resize", "rotate", "nudgeRotation", "ungroup"]) {
      expect(wrapper.emitted(event)).toBeUndefined();
    }
    expect(wrapper.attributes("data-shape-group-selection-owner")).toBe("sheet-1:group-b");
    expect(ungroupButton().getAttribute("data-shape-group-action-owner")).toBe("sheet-1:group-b");
    key(wrapper.get("[data-shape-group-rotate]").element, "ArrowRight");
    ungroupButton().click();
    expect(wrapper.emitted("nudgeRotation")).toEqual([[1]]);
    expect(wrapper.emitted("ungroup")).toEqual([[]]);
    const currentUngroup = renderedCallback(wrapper, "data-shape-group-ungroup", "onClick");
    await wrapper.setProps({ disabled: true });
    currentUngroup(new MouseEvent("click"));
    expect(wrapper.emitted("ungroup")).toHaveLength(1);
    expect(document.querySelector("[data-shape-group-ungroup]")).toBeNull();
  });
});
