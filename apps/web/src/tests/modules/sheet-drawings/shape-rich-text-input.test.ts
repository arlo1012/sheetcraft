import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ShapeTextCharacterSource } from "@sheetcraft/core/shape-text-character-runs";
import ShapeRichTextInput from "../../../modules/sheet-drawings/components/ShapeRichTextInput.vue";
import type { ShapeRichTextSnapshot } from "../../../modules/sheet-drawings/shape-rich-text-input-model";
import {
  readTextDomSelection,
  writeTextDomSelection,
  type TextDomSelection,
} from "../../../shared/cell-editing/text-dom-selection";

type InputProps = InstanceType<typeof ShapeRichTextInput>["$props"];
type InputApi = {
  rootElement: HTMLElement;
  focus: (selection?: TextDomSelection) => void;
  captureSelection: () => TextDomSelection;
  flush: () => boolean;
};
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});
function source(): ShapeTextCharacterSource {
  return {
    text: "abCD",
    characterRuns: [
      { start: 0, end: 2, fontFamily: "Georgia", fontSize: 20, bold: true },
      { start: 2, end: 4, italic: true, color: "#ff0000" },
    ],
  };
}
function api(wrapper: VueWrapper): InputApi {
  return wrapper.vm as unknown as InputApi;
}
async function fixture(overrides: Partial<InputProps> = {}) {
  const update = vi.fn<(snapshot: ShapeRichTextSnapshot) => boolean>(() => true);
  const composition = vi.fn<(active: boolean) => boolean>(() => true);
  const wrapper = mount(ShapeRichTextInput, {
    attachTo: document.body,
    props: {
      sessionId: 1,
      source: source(),
      baseFormat: {
        fontFamily: "Arial",
        fontSize: 16,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        color: "#000000",
      },
      selection: { start: 2, end: 2, direction: "none" },
      ariaLabel: "Edit shape text",
      update,
      composition,
      ...overrides,
    },
  });
  mounted.push(wrapper);
  await nextTick();
  await nextTick();
  return {
    wrapper,
    update,
    composition,
    input: wrapper.get<HTMLElement>("[data-shape-rich-text-input]").element,
  };
}
async function beforeinput(
  element: HTMLElement,
  inputType: string,
  data: string | null = null,
  configure?: (event: InputEvent) => void,
) {
  const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data });
  configure?.(event);
  element.dispatchEvent(event);
  await nextTick();
  return event;
}
async function key(element: HTMLElement, value: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: value,
    ...options,
  });
  element.dispatchEvent(event);
  await nextTick();
  return event;
}
function clipboard(type: "paste" | "copy" | "cut", text = "") {
  const getData = vi.fn((format: string) =>
    format === "text/plain" ? text : "<b>unsafe HTML</b>",
  );
  const setData = vi.fn();
  const event = new ClipboardEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData, setData } });
  return { event, getData, setData };
}
function compositionEvent(type: "compositionstart" | "compositionend", data = "") {
  const event = new CompositionEvent(type, { bubbles: true, data });
  // happy-dom currently omits CompositionEvent.data from its constructor.
  Object.defineProperty(event, "data", { value: data });
  return event;
}
function savedHandler(wrapper: VueWrapper, name: string): (event: Event) => void {
  const instance = wrapper.vm.$ as unknown as { subTree: { props: Record<string, unknown> } };
  return instance.subTree.props[name] as (event: Event) => void;
}

describe("controlled shape rich text surface", () => {
  test("renders effective safe text-only spans with relative fonts and exact selection", async () => {
    const f = await fixture({ selection: { start: 0, end: 4, direction: "backward" } });
    expect(f.input.textContent).toBe("abCD");
    expect(f.input.children).toHaveLength(2);
    expect((f.input.children[0] as HTMLElement).style.fontFamily).toBe("Georgia");
    expect((f.input.children[0] as HTMLElement).style.fontSize).toBe("1.25em");
    expect((f.input.children[0] as HTMLElement).style.fontWeight).toBe("700");
    expect((f.input.children[1] as HTMLElement).style.fontStyle).toBe("italic");
    expect(readTextDomSelection(f.input)).toEqual({ start: 0, end: 4, direction: "backward" });
    expect(api(f.wrapper).rootElement).toBe(f.input);
  });
  test("uses exact beforeinput target range instead of the current caret", async () => {
    const f = await fixture({ selection: { start: 4, end: 4, direction: "none" } });
    const node = f.input.children[1]!.firstChild!;
    const event = await beforeinput(f.input, "insertReplacementText", "Ω", (event) => {
      Object.defineProperty(event, "getTargetRanges", {
        value: () => [
          {
            startContainer: node,
            startOffset: 0,
            endContainer: node,
            endOffset: 1,
          },
        ],
      });
    });
    expect(event.defaultPrevented).toBe(true);
    expect(f.update).toHaveBeenLastCalledWith({
      source: {
        text: "abΩD",
        characterRuns: source().characterRuns,
      },
      selection: { start: 3, end: 3, direction: "none" },
    });
  });
  test("types with caret inheritance and honors an explicit inherited-font reset", async () => {
    const f = await fixture();
    await beforeinput(f.input, "insertText", "X");
    expect(f.update.mock.calls[0]![0].source.characterRuns?.[0]).toEqual({
      start: 0,
      end: 3,
      fontFamily: "Georgia",
      fontSize: 20,
      bold: true,
    });
    await f.wrapper.setProps({
      source: source(),
      pendingFormat: {},
      selection: { start: 2, end: 2, direction: "none" },
    });
    // A semantically unchanged source is an echo, so reset this explicit owner.
    await f.wrapper.setProps({ sessionId: 2 });
    await nextTick();
    const current = api(f.wrapper).rootElement;
    await beforeinput(current, "insertText", "X");
    expect(f.update.mock.calls.at(-1)![0].source.characterRuns).toEqual([
      { start: 0, end: 2, fontFamily: "Georgia", fontSize: 20, bold: true },
      { start: 3, end: 5, italic: true, color: "#ff0000" },
    ]);
  });
  test("plain paste stays literal, normalizes newline and is not inserted twice", async () => {
    const f = await fixture();
    const copied = clipboard("paste", "<img src=x>\r\n");
    f.input.dispatchEvent(copied.event);
    await nextTick();
    expect(copied.event.defaultPrevented).toBe(true);
    expect(copied.getData.mock.calls).toEqual([["text/plain"]]);
    expect(f.input.querySelector("img")).toBeNull();
    expect(f.input.textContent).toBe("ab<img src=x>\nCD");
    await beforeinput(f.input, "insertFromPaste", null, (event) => {
      Object.defineProperty(event, "dataTransfer", { value: { getData: copied.getData } });
    });
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.update.mock.calls[0]![0].source.characterRuns?.[0]?.end).toBe(14);
  });
  test("selected text replacement and extended grapheme deletion preserve complete clusters", async () => {
    const f = await fixture({
      source: { text: "A😀e\u0301Z", characterRuns: [{ start: 1, end: 5, bold: true }] },
      selection: { start: 5, end: 5, direction: "none" },
    });
    await beforeinput(f.input, "deleteContentBackward");
    expect(f.input.textContent).toBe("A😀Z");
    expect(f.update.mock.calls[0]![0].source.characterRuns).toEqual([
      { start: 1, end: 3, bold: true },
    ]);
    await beforeinput(f.input, "deleteContentBackward");
    expect(f.input.textContent).toBe("AZ");
    expect(f.update.mock.calls[1]![0].source.characterRuns).toBeUndefined();
    writeTextDomSelection(f.input, { start: 0, end: 2, direction: "backward" });
    await beforeinput(f.input, "insertLineBreak");
    expect(f.input.textContent).toBe("\n");
    expect(readTextDomSelection(f.input)).toEqual({ start: 1, end: 1, direction: "none" });
  });
  test("keeps one captured IME transaction, defers rerender, and dedupes final input", async () => {
    const f = await fixture({ selection: { start: 2, end: 4, direction: "backward" } });
    f.input.dispatchEvent(compositionEvent("compositionstart"));
    f.input.textContent = "ab中文";
    f.input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        data: "中文",
        isComposing: true,
      }),
    );
    await f.wrapper.setProps({
      source: source(),
      baseFormat: { fontFamily: "Arial", fontSize: 24 },
    });
    expect(f.input.textContent).toBe("ab中文");
    expect(f.update).not.toHaveBeenCalled();
    f.input.dispatchEvent(compositionEvent("compositionend", "中文"));
    await nextTick();
    await beforeinput(f.input, "insertText", "中文");
    f.input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertFromComposition", data: "中文" }),
    );
    await nextTick();
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.update.mock.calls[0]![0].source).toEqual({
      text: "ab中文",
      characterRuns: source().characterRuns,
    });
    expect(f.composition.mock.calls.map((call) => call[0])).toEqual([true, false]);
    await key(f.input, "文");
    await beforeinput(f.input, "insertText", "中文");
    expect(f.input.textContent).toBe("ab中文中文");
  });
  test("cancelled composition restores the original selected styled text", async () => {
    const f = await fixture({ selection: { start: 2, end: 4, direction: "backward" } });
    f.input.dispatchEvent(compositionEvent("compositionstart"));
    f.input.textContent = "abtemporary";
    f.input.dispatchEvent(compositionEvent("compositionend"));
    await nextTick();
    expect(f.input.textContent).toBe("abCD");
    expect(f.update).not.toHaveBeenCalled();
    expect(readTextDomSelection(f.input)).toEqual({ start: 2, end: 4, direction: "backward" });
  });
  test("a failed callback keeps a complete copyable draft across stale prop echoes and retry", async () => {
    const original = source();
    const f = await fixture({ source: original });
    f.update.mockReturnValue(false);
    await beforeinput(f.input, "insertText", "X");
    const retained = f.update.mock.calls[0]![0];
    expect(original).toEqual(source());
    expect(f.input.textContent).toBe("abXCD");
    expect(f.wrapper.attributes("aria-invalid")).toBe("true");
    await f.wrapper.setProps({ source: source(), pendingFormat: { italic: true } });
    expect(f.input.textContent).toBe("abXCD");
    writeTextDomSelection(f.input, { start: 0, end: 5, direction: "forward" });
    const copied = clipboard("copy");
    f.input.dispatchEvent(copied.event);
    expect(copied.setData).toHaveBeenCalledWith("text/plain", "abXCD");
    expect(api(f.wrapper).flush()).toBe(false);
    f.update.mockReturnValue(true);
    expect(api(f.wrapper).flush()).toBe(true);
    await nextTick();
    expect(f.update.mock.calls.at(-1)![0].source).toEqual(retained.source);
    expect(f.update.mock.calls.at(-1)![0].pendingFormat).toBeUndefined();
    expect(f.wrapper.attributes("aria-invalid")).toBeUndefined();
  });
  test("local Undo/Redo restores exact same-text fonts and selections instead of native HTML history", async () => {
    const f = await fixture();
    const styled = {
      text: "abCD",
      characterRuns: [{ start: 0, end: 4, fontFamily: "Courier New", bold: false }],
    };
    await f.wrapper.setProps({
      source: styled,
      selection: { start: 0, end: 4, direction: "backward" },
    });
    expect(f.update).not.toHaveBeenCalled();
    const undo = await key(f.input, "z", { ctrlKey: true });
    expect(undo.defaultPrevented).toBe(true);
    expect(f.update.mock.calls.at(-1)![0]).toEqual({
      source: source(),
      selection: { start: 2, end: 2, direction: "none" },
    });
    await key(f.input, "z", { metaKey: true, shiftKey: true });
    expect(f.update.mock.calls.at(-1)![0]).toEqual({
      source: styled,
      selection: { start: 0, end: 4, direction: "backward" },
    });
    await beforeinput(f.input, "historyUndo");
    expect(f.input.textContent).toBe("abCD");
    expect(f.update.mock.calls.at(-1)![0].source).toEqual(source());
  });
  test("collapsed pending-format changes create history without changing source", async () => {
    const f = await fixture();
    await f.wrapper.setProps({ pendingFormat: { underline: true } });
    expect(f.update).not.toHaveBeenCalled();
    await key(f.input, "z", { ctrlKey: true });
    expect(f.update.mock.calls.at(-1)![0].pendingFormat).toBeUndefined();
    expect(f.update.mock.calls.at(-1)![0].source).toEqual(source());
    await key(f.input, "y", { ctrlKey: true });
    expect(f.update.mock.calls.at(-1)![0].pendingFormat).toEqual({ underline: true });
  });
  test("a user-moved caret clears its old pending style, while own insertion preserves it", async () => {
    const f = await fixture({ pendingFormat: { fontFamily: "Georgia", bold: true } });
    await beforeinput(f.input, "insertText", "X");
    expect(f.update.mock.calls.at(-1)![0].pendingFormat).toEqual({
      fontFamily: "Georgia",
      bold: true,
    });
    writeTextDomSelection(f.input, { start: 5, end: 5, direction: "none" });
    f.input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));
    await nextTick();
    await beforeinput(f.input, "insertText", "y");
    const snapshot = f.update.mock.calls.at(-1)![0];
    expect(snapshot.source.text).toBe("abXCDy");
    expect(snapshot.source.characterRuns?.at(-1)).toEqual({
      start: 3,
      end: 6,
      italic: true,
      color: "#ff0000",
    });
    expect(snapshot.pendingFormat).toBeUndefined();
  });
  test("IME insertion into repeated text preserves the captured caret style and suffix offsets", async () => {
    const f = await fixture({
      source: {
        text: "aaaa",
        characterRuns: [
          { start: 0, end: 1, bold: true },
          { start: 2, end: 3, italic: true },
        ],
      },
      selection: { start: 1, end: 1, direction: "none" },
    });
    f.input.dispatchEvent(compositionEvent("compositionstart"));
    f.input.textContent = "aaaaa";
    f.input.dispatchEvent(compositionEvent("compositionend", "a"));
    await nextTick();
    expect(f.update.mock.calls.at(-1)![0].source).toEqual({
      text: "aaaaa",
      characterRuns: [
        { start: 0, end: 2, bold: true },
        { start: 3, end: 4, italic: true },
      ],
    });
    expect(readTextDomSelection(f.input)).toEqual({ start: 2, end: 2, direction: "none" });
  });
  test("the first native IME target range can replace a different styled selection", async () => {
    const f = await fixture({
      selection: { start: 4, end: 4, direction: "none" },
      pendingFormat: { fontFamily: "Georgia", bold: true },
    });
    f.input.dispatchEvent(compositionEvent("compositionstart"));
    const node = f.input.children[1]!.firstChild!;
    const event = await beforeinput(f.input, "insertCompositionText", "中", (event) => {
      Object.defineProperty(event, "getTargetRanges", {
        value: () => [
          {
            startContainer: node,
            startOffset: 0,
            endContainer: node,
            endOffset: 2,
          },
        ],
      });
    });
    expect(event.defaultPrevented).toBe(false);
    f.input.textContent = "ab中文";
    f.input.dispatchEvent(compositionEvent("compositionend", "中文"));
    await nextTick();
    expect(f.update.mock.calls.at(-1)![0].source).toEqual({
      text: "ab中文",
      characterRuns: source().characterRuns,
    });
    expect(f.update.mock.calls.at(-1)![0].pendingFormat).toBeUndefined();
  });
  test("saved handlers from replaced sessions, sources and callbacks cannot retarget", async () => {
    const f = await fixture();
    const oldRoot = f.input,
      saved = savedHandler(f.wrapper, "onBeforeinput");
    const oldEvent = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "old",
      cancelable: true,
    });
    Object.defineProperty(oldEvent, "target", { value: oldRoot });
    await f.wrapper.setProps({ sessionId: 2, source: { text: "next" } });
    await nextTick();
    saved(oldEvent);
    oldRoot.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertText",
        data: "late",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(f.update).not.toHaveBeenCalled();
    expect(api(f.wrapper).rootElement.textContent).toBe("next");
    const savedNext = savedHandler(f.wrapper, "onBeforeinput");
    const current = api(f.wrapper).rootElement;
    const event = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "wrong",
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: current });
    await f.wrapper.setProps({ source: { text: "same owner, new source" } });
    savedNext(event);
    expect(f.update).not.toHaveBeenCalled();
    expect(current.textContent).toBe("same owner, new source");
  });
  test("read-only remains copyable and rejects paste, drop, HTML and native mutations", async () => {
    const f = await fixture({
      readOnly: true,
      selection: { start: 0, end: 4, direction: "forward" },
    });
    const copied = clipboard("copy");
    f.input.dispatchEvent(copied.event);
    expect(copied.setData).toHaveBeenCalledWith("text/plain", "abCD");
    f.input.dispatchEvent(clipboard("paste", "new").event);
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    f.input.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await beforeinput(f.input, "insertFromPaste", "HTML");
    f.input.textContent = "native mutation";
    f.input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "historyUndo" }));
    expect(f.input.textContent).toBe("abCD");
    expect(f.update).not.toHaveBeenCalled();
    expect(api(f.wrapper).flush()).toBe(false);
  });
  test("Escape and modified Enter still reach the owning frame", async () => {
    const f = await fixture();
    const handler = vi.fn();
    document.body.addEventListener("keydown", handler);
    try {
      expect((await key(f.input, "Escape")).defaultPrevented).toBe(false);
      expect((await key(f.input, "Enter", { ctrlKey: true })).defaultPrevented).toBe(false);
      expect(handler).toHaveBeenCalledTimes(2);
      await key(f.input, "z", { ctrlKey: true });
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      document.body.removeEventListener("keydown", handler);
    }
  });
});
