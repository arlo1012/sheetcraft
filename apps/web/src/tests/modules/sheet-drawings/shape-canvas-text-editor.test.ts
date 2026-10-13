import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import ShapeRichTextInput from "../../../modules/sheet-drawings/components/ShapeRichTextInput.vue";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";

type EditorProps = InstanceType<typeof ShapeCanvasTextEditor>["$props"];
const mounted: VueWrapper[] = [];
const dispose: Array<() => void> = [];
afterEach(() => {
  for (const release of dispose.splice(0)) release();
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function drawing(): SheetGraphicDrawing {
  return {
    id: "text-shape",
    name: "Text shape",
    kind: "textBox",
    anchor: { row: 3, column: 4 },
    offsetX: 7,
    offsetY: 11,
    width: 100,
    height: 100,
    text: "initial text",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#123456",
    fontSize: 20,
    bold: false,
    italic: false,
    rotation: 0,
  };
}
async function fixture(overrides: Partial<EditorProps> = {}) {
  const update = vi.fn<(value: string) => boolean>(() => true);
  const composition = vi.fn<(active: boolean) => boolean>(() => true);
  const commit = vi.fn(() => true);
  const cancel = vi.fn();
  const escape = vi.fn();
  const wrapper = mount(ShapeCanvasTextEditor, {
    attachTo: document.body,
    props: {
      drawing: drawing(),
      sessionId: 1,
      draft: "initial text",
      update,
      composition,
      commit,
      cancel,
      escape,
      frameStyle: { left: "12px", top: "18px", width: "100px", height: "100px" },
      ...overrides,
    },
  });
  mounted.push(wrapper);
  await nextTick();
  await nextTick();
  return { wrapper, update, composition, commit, cancel, escape, input: input(wrapper) };
}
function input(wrapper: VueWrapper): HTMLTextAreaElement {
  return wrapper.get<HTMLTextAreaElement>("textarea").element;
}
function button(action: "apply" | "cancel"): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`[data-shape-text-action="${action}"]`)!;
}
async function write(element: HTMLTextAreaElement, value: string, inputType = "insertText") {
  element.value = value;
  element.setSelectionRange(value.length, value.length);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: value }));
  await nextTick();
}
async function key(element: HTMLElement, keyValue: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: keyValue,
    ...options,
  });
  element.dispatchEvent(event);
  await nextTick();
  return event;
}
function externalButton(): HTMLButtonElement {
  const element = document.createElement("button");
  document.body.appendChild(element);
  return element;
}
function listen(type: string) {
  const handler = vi.fn();
  document.addEventListener(type, handler);
  dispose.push(() => document.removeEventListener(type, handler));
  return handler;
}

describe("owner-scoped plain-text shape canvas editor", () => {
  test("rich source preview discloses advanced appearance and receives theme and scale", async () => {
    const target = drawing();
    target.shapeText = {
      ...createDefaultShapeText(),
      style: {
        fill: {
          kind: "value",
          value: {
            kind: "pattern",
            preset: "pct50",
            foreground: { kind: "rgb", rgb: "#ff0000" },
            background: { kind: "rgb", rgb: "#0000ff" },
            opacity: 1,
            rotateWithShape: true,
          },
        },
      },
    };
    const wrapper = mount(ShapeCanvasTextEditor, {
      attachTo: document.body,
      props: {
        drawing: target,
        sessionId: 42,
        draft: target.text,
        rich: true,
        theme: DEFAULT_WORKBOOK_THEME,
        scale: 2,
        update: () => true,
        updateRich: () => true,
        composition: () => true,
        commit: () => true,
        cancel: () => {},
      },
    });
    mounted.push(wrapper);
    await nextTick();
    await nextTick();
    expect(wrapper.findComponent(ShapeRichTextInput).props("theme")).toEqual(
      DEFAULT_WORKBOOK_THEME,
    );
    expect(wrapper.findComponent(ShapeRichTextInput).props("scale")).toBe(2);
    expect(document.querySelector("[data-shape-text-source-preview-note]")?.textContent).toContain(
      "Applied text keeps its full appearance",
    );
    expect(wrapper.get("[data-shape-rich-text-input]").element.textContent).toBe(target.text);
    await wrapper.setProps({ locale: "zh-CN" });
    expect(document.querySelector("[data-shape-text-source-preview-note]")?.textContent).toContain(
      "应用后保留完整外观",
    );
  });
  test("keeps one native textarea through continuous draft echoes and failure props", async () => {
    const f = await fixture();
    await write(f.input, "first draft");
    f.input.setSelectionRange(2, 5, "backward");
    await f.wrapper.setProps({ draft: "first draft", error: "Retry is available" });
    await write(f.input, "second draft");
    expect(input(f.wrapper)).toBe(f.input);
    expect(f.update.mock.calls.map((call) => call[0])).toEqual(["first draft", "second draft"]);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.input.value).toBe("second draft");
  });

  test("initial selection supports select-all and owner-only textarea/undo replacement", async () => {
    const f = await fixture({ initialSelection: { start: 0, end: 12, direction: "backward" } });
    expect(document.activeElement).toBe(f.input);
    expect([f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection]).toEqual([
      0,
      12,
      "backward",
    ]);
    const old = f.input;
    await f.wrapper.setProps({
      sessionId: 2,
      draft: "other owner",
      initialSelection: { start: 11, end: 11 },
    });
    await nextTick();
    const next = input(f.wrapper);
    expect(next).not.toBe(old);
    expect(next.value).toBe("other owner");
    expect([next.selectionStart, next.selectionEnd]).toEqual([11, 11]);
    old.value = "late old event";
    old.dispatchEvent(new InputEvent("input", { bubbles: true }));
    old.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    expect(f.update).not.toHaveBeenCalled();
    expect(f.commit).not.toHaveBeenCalled();
    expect(next.value).toBe("other owner");
  });

  test.each([
    ["Enter", {}],
    ["Delete", {}],
    ["Backspace", {}],
    ["ArrowLeft", {}],
    ["Tab", {}],
    ["z", { ctrlKey: true }],
    ["z", { metaKey: true }],
    ["z", { ctrlKey: true, shiftKey: true }],
    ["y", { ctrlKey: true }],
    ["v", { ctrlKey: true }],
  ])(
    "shields %s from workbook hotkeys while preserving native behavior",
    async (value, options) => {
      const f = await fixture();
      const workbook = listen("keydown");
      const event = await key(f.input, value as string, options as KeyboardEventInit);
      expect(workbook).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.cancel).not.toHaveBeenCalled();
    },
  );

  test("native history input updates only the local draft and stays outside workbook history", async () => {
    const f = await fixture();
    const beforeInput = listen("beforeinput");
    const workbookInput = listen("input");
    await write(f.input, "new text");
    f.input.dispatchEvent(
      new InputEvent("beforeinput", { bubbles: true, inputType: "historyUndo" }),
    );
    await write(f.input, "initial text", "historyUndo");
    expect(beforeInput).not.toHaveBeenCalled();
    expect(workbookInput).not.toHaveBeenCalled();
    expect(f.update).toHaveBeenLastCalledWith("initial text");
    expect(f.commit).not.toHaveBeenCalled();
  });

  test.each([{ ctrlKey: true }, { metaKey: true }])(
    "explicit modified Enter applies once",
    async (options) => {
      const f = await fixture();
      await write(f.input, "line one\nline two");
      const event = await key(f.input, "Enter", options);
      expect(event.defaultPrevented).toBe(true);
      expect(f.commit).toHaveBeenCalledTimes(1);
      expect(f.input.value).toBe("line one\nline two");
    },
  );

  test("uses injected Escape intent, keeps native IME Escape and Enter, and never assumes cancel", async () => {
    const f = await fixture();
    f.input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const imeEnter = await key(f.input, "Enter", { ctrlKey: true, isComposing: true });
    const imeEscape = await key(f.input, "Escape", { isComposing: true });
    expect(imeEnter.defaultPrevented).toBe(false);
    expect(imeEscape.defaultPrevented).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.escape).not.toHaveBeenCalled();
    f.input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    const escaped = await key(f.input, "Escape");
    expect(escaped.defaultPrevented).toBe(true);
    expect(f.escape).toHaveBeenCalledTimes(1);
    expect(f.cancel).not.toHaveBeenCalled();
  });

  test("a rejected injected Escape keeps the draft and selection focused for retry", async () => {
    const escape = vi.fn(() => false);
    const f = await fixture({ escape });
    await write(f.input, "Escape draft");
    f.input.setSelectionRange(1, 4, "backward");
    const event = await key(f.input, "Escape");
    expect(event.defaultPrevented).toBe(true);
    expect(escape).toHaveBeenCalledTimes(1);
    expect(f.input.value).toBe("Escape draft");
    expect(document.activeElement).toBe(f.input);
    expect([f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection]).toEqual([
      1,
      4,
      "backward",
    ]);
    expect(document.querySelector("[role=alert]")?.textContent).toContain(
      "Your text has been kept",
    );
    expect(f.cancel).not.toHaveBeenCalled();
  });

  test("deduplicates final IME text while preserving its native selection", async () => {
    const f = await fixture();
    f.input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await write(f.input, "拼");
    f.input.value = "拼音";
    f.input.setSelectionRange(1, 2, "backward");
    f.input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "拼音" }));
    f.input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertFromComposition" }),
    );
    await nextTick();
    expect(f.composition.mock.calls.map((call) => call[0])).toEqual([true, false]);
    expect(f.update.mock.calls.map((call) => call[0])).toEqual(["拼", "拼音"]);
    expect([f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection]).toEqual([
      1,
      2,
      "backward",
    ]);
    expect(input(f.wrapper)).toBe(f.input);
  });

  test("foreign blur emits commit intent after composition finalization, once", async () => {
    const f = await fixture();
    f.input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await write(f.input, "候");
    externalButton().focus();
    await nextTick();
    expect(f.wrapper.emitted("requestCommit")).toBeUndefined();
    expect(f.commit).not.toHaveBeenCalled();
    f.input.value = "候选";
    f.input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    f.input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await nextTick();
    expect(f.update).toHaveBeenLastCalledWith("候选");
    expect(f.wrapper.emitted("requestCommit")).toEqual([["blur"]]);
    expect(f.commit).not.toHaveBeenCalled();
  });

  test("blur into either editor button is internal, including keyboard focus", async () => {
    const f = await fixture();
    button("apply").focus();
    await nextTick();
    button("cancel").focus();
    await nextTick();
    expect(f.wrapper.emitted("requestCommit")).toBeUndefined();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
    externalButton().focus();
    await nextTick();
    expect(f.wrapper.emitted("requestCommit")).toEqual([["blur"]]);
  });

  test("button pointerdown preserves native selection and avoids foreign blur", async () => {
    const f = await fixture();
    f.input.setSelectionRange(2, 7, "backward");
    const pointer = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    button("apply").dispatchEvent(pointer);
    await nextTick();
    expect(pointer.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(f.input);
    expect([f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection]).toEqual([
      2,
      7,
      "backward",
    ]);
    expect(f.wrapper.emitted("requestCommit")).toBeUndefined();
    button("cancel").click();
    expect(f.cancel).toHaveBeenCalledTimes(1);
    expect(f.commit).not.toHaveBeenCalled();
  });

  test("failed commit keeps its draft, selection and focus with the actual owner failure", async () => {
    const commit = vi.fn(() => false);
    const f = await fixture({ commit });
    await write(f.input, "recoverable draft");
    f.input.setSelectionRange(2, 5, "backward");
    button("apply").click();
    await f.wrapper.setProps({ error: "Native font metrics unavailable" });
    await nextTick();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(f.input.value).toBe("recoverable draft");
    expect(document.activeElement).toBe(f.input);
    expect([f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection]).toEqual([
      2,
      5,
      "backward",
    ]);
    expect(document.querySelector("[role=alert]")?.textContent).toContain(
      "Native font metrics unavailable",
    );
    commit.mockReturnValue(true);
    button("apply").click();
    expect(commit).toHaveBeenCalledTimes(2);
  });

  test("a thrown commit displays its failure without discarding text", async () => {
    const f = await fixture({
      commit: () => {
        throw new Error("Owner changed during apply");
      },
    });
    await write(f.input, "kept on exception");
    button("apply").click();
    await nextTick();
    expect(document.querySelector("[role=alert]")?.textContent).toContain(
      "Owner changed during apply",
    );
    expect(f.input.value).toBe("kept on exception");
    expect(document.activeElement).toBe(f.input);
  });

  test("rejected update retains local text for recovery and blocks commit until accepted", async () => {
    const update = vi.fn(() => false);
    const f = await fixture({ update });
    await write(f.input, "draft not accepted by owner");
    await f.wrapper.setProps({ draft: "initial text" });
    expect(f.input.value).toBe("draft not accepted by owner");
    button("apply").click();
    await nextTick();
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.input.value).toBe("draft not accepted by owner");
    update.mockReturnValue(true);
    button("apply").click();
    expect(update).toHaveBeenLastCalledWith("draft not accepted by owner");
    expect(f.commit).toHaveBeenCalledTimes(1);
  });

  test.each(["stale", "disabled"] as const)(
    "%s leaves the draft selectable but cannot apply",
    async (flag) => {
      const f = await fixture();
      await write(f.input, "retain and copy");
      await f.wrapper.setProps({ [flag]: true });
      expect(f.input.readOnly).toBe(true);
      expect(f.input.disabled).toBe(false);
      expect(button("apply").disabled).toBe(true);
      await key(f.input, "Enter", { ctrlKey: true });
      await key(f.input, "Escape");
      externalButton().focus();
      await nextTick();
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.escape).not.toHaveBeenCalled();
      expect(f.wrapper.emitted("requestCommit")).toBeUndefined();
      expect(f.input.value).toBe("retain and copy");
      f.input.setSelectionRange(0, f.input.value.length);
      expect(f.input.selectionEnd).toBe(15);
    },
  );

  test("clipboard HTML remains literal native plain text and never reaches worksheet paste", async () => {
    const f = await fixture();
    const workbookPaste = listen("paste");
    const copy = listen("copy");
    const cut = listen("cut");
    const markup = '<img src="x" onerror="alert(1)"><script>alert(2)</script>';
    const clipboard = { getData: vi.fn(() => markup), types: ["text/html", "text/plain"] };
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: clipboard });
    f.input.dispatchEvent(event);
    // happy-dom does not execute native paste defaults. Simulate the browser's
    // resulting plain-text input, rather than inventing HTML insertion logic.
    await write(f.input, markup, "insertFromPaste");
    f.input.dispatchEvent(new Event("copy", { bubbles: true }));
    f.input.dispatchEvent(new Event("cut", { bubbles: true }));
    expect(event.defaultPrevented).toBe(false);
    expect(clipboard.getData).not.toHaveBeenCalled();
    expect(workbookPaste).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    expect(cut).not.toHaveBeenCalled();
    expect(f.input.value).toBe(markup);
    expect(f.wrapper.find("img").exists()).toBe(false);
    expect(f.wrapper.find("script").exists()).toBe(false);
    expect(f.update).toHaveBeenLastCalledWith(markup);
  });

  test("native selection pointer events do not start shape or cell gestures", async () => {
    const f = await fixture();
    const pointer = listen("pointerdown");
    const mouse = listen("mousedown");
    const double = listen("dblclick");
    const event = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
    f.input.dispatchEvent(event);
    f.input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    f.input.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(event.defaultPrevented).toBe(false);
    expect(pointer).not.toHaveBeenCalled();
    expect(mouse).not.toHaveBeenCalled();
    expect(double).not.toHaveBeenCalled();
  });

  test("keeps a separate upright toolbar and projects owner geometry without changing drawing data", async () => {
    const source = drawing();
    const saved = structuredClone(source);
    const f = await fixture({
      drawing: source,
      scale: 2,
      frameStyle: {
        left: "12px",
        top: "18px",
        width: "200px",
        height: "200px",
        transform: "rotate(30deg)",
      },
      textareaStyle: {
        position: "absolute",
        left: "4px",
        top: "8px",
        width: "100px",
        height: "80px",
      },
      locale: "zh-CN",
    });
    expect(f.wrapper.get("[data-shape-canvas-text-editor]").attributes("style")).toContain(
      "rotate(30deg)",
    );
    expect(f.input.style.fontSize).toBe("40px");
    expect(f.input.style.left).toBe("4px");
    expect(f.input.style.top).toBe("8px");
    expect(f.input.getAttribute("aria-label")).toBe("编辑形状文本");
    expect(document.querySelector("[data-shape-canvas-text-toolbar]")?.parentElement).toBe(
      document.body,
    );
    expect(button("apply").textContent).toContain("应用");
    expect(source).toEqual(saved);
  });
});
