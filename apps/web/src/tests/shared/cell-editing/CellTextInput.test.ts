import { afterEach, describe, expect, test, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import CellTextInput from "../../../shared/cell-editing/CellTextInput.vue";
import { useCellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import { writeTextDomSelection } from "../../../shared/cell-editing/text-dom-selection";
import { CELL_TEXT_CLIPBOARD_TYPE } from "../../../shared/cell-editing/cell-text-clipboard";
import { ensureCellFontResource } from "../../../shared/cell-text/font-resources";
import type { CellContent, CellTextFontRun } from "@sheetcraft/core/formula";
import type {
  CellEditCommit,
  CellEditSurface,
} from "../../../shared/cell-editing/useCellEditSession";

vi.mock("../../../shared/cell-text/font-resources", () => ({
  ensureCellFontResource: vi.fn(() => Promise.resolve()),
}));
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.getSelection()?.removeAllRanges();
  vi.mocked(ensureCellFontResource).mockReset().mockResolvedValue(undefined);
});
function fixture(
  options: {
    text?: string;
    content?: CellContent | null;
    fontRuns?: CellTextFontRun[];
    readOnly?: boolean;
    surface?: CellEditSurface;
  } = {},
) {
  const commits: CellEditCommit[] = [];
  const session = useCellEditSession({
    onCommit: (commit) => {
      commits.push(commit);
      return true;
    },
  });
  const text = options.text ?? "aΩb";
  const fontRuns =
    options.fontRuns ??
    (options.text === undefined ? [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }] : undefined);
  const surface = options.surface ?? "grid";
  const content =
    options.content === undefined
      ? text === ""
        ? null
        : { kind: "literal" as const, value: text, fontRuns }
      : options.content;
  session.begin(
    { address: { row: 0, column: 0 }, input: text, content },
    { surface, mode: "append" },
  );
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(CellTextInput, {
          modelValue: session.state.draft,
          fontRuns: session.state.draftFontRuns,
          editSession: session,
          surface,
          readOnly: options.readOnly,
          label: "Cell A1",
          "onUpdate:modelValue": session.setDraft,
          onCompositionStart: () => session.startComposition(),
          onCompositionEnd: (value: string) => session.endComposition(value),
        }),
    }),
    { attachTo: document.body },
  );
  wrappers.push(wrapper);
  const element = wrapper.get('[role="textbox"]').element as HTMLDivElement;
  element.focus();
  return { wrapper, element, session, commits };
}

function clipboard() {
  const values = new Map<string, string>();
  return {
    values,
    get types() {
      return [...values.keys()];
    },
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, value: string) => {
      values.set(type, value);
    },
  };
}
function sendClipboard(
  element: HTMLElement,
  type: "copy" | "cut" | "paste",
  clipboardData: unknown,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: clipboardData });
  element.dispatchEvent(event);
  return event;
}

describe("font-only text input", () => {
  test("inline copy and paste preserve the selected character font", async () => {
    const { element, session } = fixture();
    const data = new Map<string, string>();
    const clipboardData = {
      get types() {
        return [...data.keys()];
      },
      setData: (type: string, value: string) => {
        data.set(type, value);
      },
      getData: (type: string) => data.get(type) ?? "",
    };
    writeTextDomSelection(element, { start: 1, end: 2, direction: "forward" });
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copy, "clipboardData", { value: clipboardData });
    element.dispatchEvent(copy);
    expect(data.get("text/plain")).toBe("Ω");
    writeTextDomSelection(element, { start: 3, end: 3, direction: "none" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: clipboardData });
    element.dispatchEvent(paste);
    expect(session.state.draft).toBe("aΩbΩ");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
      { start: 3, end: 4, fontFamily: "Noto Sans Math" },
    ]);
    await nextTick();
    await nextTick();
    expect(element.querySelectorAll("span")).toHaveLength(2);
  });

  test("editor copy into another surface preserves fonts and inherited gaps as one draft edit", async () => {
    const source = fixture();
    const data = clipboard();
    writeTextDomSelection(source.element, { start: 0, end: 3, direction: "backward" });
    sendClipboard(source.element, "copy", data);
    const destination = fixture({ surface: "formula-bar" });
    writeTextDomSelection(destination.element, { start: 1, end: 2, direction: "forward" });
    sendClipboard(destination.element, "paste", data);
    expect(destination.session.state.draft).toBe("aaΩbb");
    expect(destination.session.state.draftFontRuns).toEqual([
      { start: 2, end: 3, fontFamily: "Noto Sans Math" },
    ]);
    expect(source.session.state.draft).toBe("aΩb");
    expect(destination.commits).toEqual([]);
    await nextTick();
    await nextTick();
    destination.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(destination.session.state.draft).toBe("aΩb");
    expect(destination.session.undoDraft()).toBe(false);
    destination.session.redoDraft();
    destination.session.finish();
    expect(destination.commits[0]).toMatchObject({
      input: "aaΩbb",
      inputOrigin: "paste",
      inputFontRuns: [{ start: 2, end: 3, fontFamily: "Noto Sans Math" }],
    });
  });

  test.each(["1", "=A1", "TRUE", "#REF!"])(
    "font-bearing internal paste %j remains a literal string",
    (text) => {
      const { element, session, commits } = fixture({ text: "" });
      const data = clipboard();
      data.setData("text/plain", text);
      data.setData(
        CELL_TEXT_CLIPBOARD_TYPE,
        JSON.stringify({
          version: 1,
          text,
          fontRuns: [{ start: 0, end: text.length, fontFamily: "Symbol" }],
        }),
      );
      writeTextDomSelection(element, { start: 0, end: 0, direction: "none" });
      sendClipboard(element, "paste", data);
      expect(session.state.draft).toBe(`'${text}`);
      expect(session.state.draftFontRuns).toEqual([
        { start: 1, end: text.length + 1, fontFamily: "Symbol" },
      ]);
      session.finish();
      expect(commits[0]).toMatchObject({ input: `'${text}`, inputOrigin: "paste" });
    },
  );

  test("plain numeric paste and font-bearing paste into a formula keep their original input semantics", () => {
    const blank = fixture({ text: "" });
    const data = clipboard();
    data.setData("text/plain", "1");
    writeTextDomSelection(blank.element, { start: 0, end: 0, direction: "none" });
    sendClipboard(blank.element, "paste", data);
    expect(blank.session.state.draft).toBe("1");
    const formula = fixture({
      text: "=A1",
      content: { kind: "formula", formula: { source: "=A1" } },
    });
    data.setData("text/plain", "Ω");
    data.setData(
      CELL_TEXT_CLIPBOARD_TYPE,
      JSON.stringify({
        version: 1,
        text: "Ω",
        fontRuns: [{ start: 0, end: 1, fontFamily: "Symbol" }],
      }),
    );
    writeTextDomSelection(formula.element, { start: 3, end: 3, direction: "none" });
    sendClipboard(formula.element, "paste", data);
    expect(formula.session.state.draft).toBe("=A1Ω");
    expect(formula.session.state.draftFontRuns).toBeUndefined();
  });

  test("copy and cut use the same whole-grapheme source range", async () => {
    const { element, session } = fixture({
      text: "a😀e\u0301b",
      fontRuns: [
        { start: 1, end: 3, fontFamily: "Emoji" },
        { start: 4, end: 5, fontFamily: "Mark" },
      ],
    });
    writeTextDomSelection(element, { start: 2, end: 4, direction: "forward" });
    const data = clipboard();
    sendClipboard(element, "cut", data);
    expect(data.getData("text/plain")).toBe("😀e\u0301");
    expect(JSON.parse(data.getData(CELL_TEXT_CLIPBOARD_TYPE))).toMatchObject({
      fontRuns: [
        { start: 0, end: 2, fontFamily: "Emoji" },
        { start: 3, end: 4, fontFamily: "Mark" },
      ],
    });
    expect(session.state.draft).toBe("ab");
    expect(session.state.draftFontRuns).toBeUndefined();
    expect(session.undoDraft()).toBe(true);
    expect(session.state.draft).toBe("a😀e\u0301b");
    await nextTick();
    await nextTick();
  });

  test.each(["text/plain", CELL_TEXT_CLIPBOARD_TYPE])(
    "failed clipboard %s write preserves the rich cut draft",
    (failedType) => {
      const { element, session } = fixture();
      writeTextDomSelection(element, { start: 1, end: 2, direction: "forward" });
      const setData = vi.fn((type: string) => {
        if (type === failedType) throw new Error("denied");
      });
      const event = sendClipboard(element, "cut", { setData });
      expect(event.defaultPrevented).toBe(true);
      expect(session.state.draft).toBe("aΩb");
      expect(session.state.draftFontRuns).toEqual([
        { start: 1, end: 2, fontFamily: "Noto Sans Math" },
      ]);
      expect(session.undoDraft()).toBe(false);
      element.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "deleteByCut",
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(session.state.draft).toBe("aΩb");
    },
  );

  test("non-cancelable native cut input cannot delete without a successful clipboard write", async () => {
    const { element, session } = fixture();
    writeTextDomSelection(element, { start: 1, end: 2, direction: "forward" });
    sendClipboard(element, "cut", null);
    element.dispatchEvent(
      new InputEvent("beforeinput", { inputType: "deleteByCut", bubbles: true }),
    );
    element.textContent = "ab";
    element.dispatchEvent(new InputEvent("input", { inputType: "deleteByCut", bubbles: true }));
    expect(session.state.draft).toBe("aΩb");
    expect(session.undoDraft()).toBe(false);
    await nextTick();
    await nextTick();
    expect(element.textContent).toBe("aΩb");
    expect(element.querySelector("span")?.textContent).toBe("Ω");
  });

  test("mismatched MIME falls back to literal plain text and only replaces the selected target", async () => {
    const { element, session } = fixture();
    const data = clipboard();
    data.setData("text/plain", "<img src=x>\n=1");
    data.setData("text/html", "<img src=x onerror=bad>");
    data.setData(
      CELL_TEXT_CLIPBOARD_TYPE,
      JSON.stringify({
        version: 1,
        text: "spoofed",
        fontRuns: [{ start: 0, end: 7, fontFamily: "Bad" }],
      }),
    );
    writeTextDomSelection(element, { start: 1, end: 2, direction: "forward" });
    sendClipboard(element, "paste", data);
    expect(session.state.draft).toBe("a<img src=x>\n=1b");
    expect(session.state.draftFontRuns).toBeUndefined();
    await nextTick();
    await nextTick();
    expect(element.querySelector("img")).toBeNull();
    expect(element.textContent).toBe(session.state.draft);
  });

  test("IME blocks clipboard edits and read-only surfaces allow copying without mutation", () => {
    const editable = fixture();
    writeTextDomSelection(editable.element, { start: 1, end: 2, direction: "forward" });
    editable.element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    const data = clipboard();
    sendClipboard(editable.element, "cut", data);
    expect(data.values.size).toBe(0);
    data.setData("text/plain", "lost");
    sendClipboard(editable.element, "paste", data);
    expect(editable.session.state.draft).toBe("aΩb");
    const readonly = fixture({ readOnly: true });
    writeTextDomSelection(readonly.element, { start: 1, end: 2, direction: "forward" });
    sendClipboard(readonly.element, "cut", data);
    expect(data.getData("text/plain")).toBe("Ω");
    expect(readonly.session.state.draft).toBe("aΩb");
    sendClipboard(readonly.element, "paste", data);
    expect(readonly.session.state.draft).toBe("aΩb");
  });

  test("pasted local aliases trigger resource loading and surface missing-resource errors", async () => {
    const { element, session, wrapper } = fixture();
    const family = `SheetcraftLocal_${"a".repeat(64)}`;
    vi.mocked(ensureCellFontResource).mockImplementation((font) =>
      font === family ? Promise.reject(new Error("missing local resource")) : Promise.resolve(),
    );
    const data = clipboard();
    data.setData("text/plain", "Ω");
    data.setData(
      CELL_TEXT_CLIPBOARD_TYPE,
      JSON.stringify({
        version: 1,
        text: "Ω",
        fontRuns: [{ start: 0, end: 1, fontFamily: family }],
      }),
    );
    writeTextDomSelection(element, { start: 1, end: 2, direction: "forward" });
    sendClipboard(element, "paste", data);
    await nextTick();
    await nextTick();
    await Promise.resolve();
    expect(ensureCellFontResource).toHaveBeenCalledWith(family);
    expect(wrapper.findComponent(CellTextInput).emitted("fontError")).toEqual([[family]]);
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: family }]);
    expect(element.querySelector("span")?.style.fontFamily).toContain(family);
  });

  test("renders only text nodes and family spans; literal markup stays literal", async () => {
    const { element, session } = fixture();
    expect(element.querySelector("span")?.textContent).toBe("Ω");
    session.replaceSelection("<img src=x onerror=alert(1)>");
    await nextTick();
    await nextTick();
    expect(element.querySelector("img")).toBeNull();
    expect(element.textContent).toContain("<img");
  });

  test("autocorrection replaces its target range, rather than appending at a stale caret", async () => {
    const { element, session } = fixture();
    writeTextDomSelection(element, { start: 3, end: 3, direction: "none" });
    const node = element.querySelector("span")!.firstChild!;
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertReplacementText",
      data: "δ",
    });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [{ startContainer: node, startOffset: 0, endContainer: node, endOffset: 1 }],
    });
    element.dispatchEvent(event);
    await nextTick();
    await nextTick();
    expect(session.state.draft).toBe("aδb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
    ]);
  });

  test("a native deletion target range preserves the pre-Symbol typing font", async () => {
    const { element, session } = fixture({ text: "ab" });
    session.setCaret(1);
    session.replaceSelection("Ω", "Noto Sans Math", {
      preserveLiteral: true,
      preserveTypingFont: true,
    });
    await nextTick();
    await nextTick();
    writeTextDomSelection(element, { start: 2, end: 2, direction: "none" });
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "x",
      }),
    );
    await nextTick();
    await nextTick();
    expect(session.state.draft).toBe("aΩxb");
    writeTextDomSelection(element, { start: 3, end: 3, direction: "none" });
    const node = element.lastChild!;
    const deletion = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    });
    Object.defineProperty(deletion, "getTargetRanges", {
      value: () => [{ startContainer: node, startOffset: 0, endContainer: node, endOffset: 1 }],
    });
    element.dispatchEvent(deletion);
    await nextTick();
    await nextTick();
    expect(session.state.draft).toBe("aΩb");
    writeTextDomSelection(element, { start: 2, end: 2, direction: "none" });
    element.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: "y",
      }),
    );
    await nextTick();
    await nextTick();
    expect(session.state.draft).toBe("aΩyb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
    ]);
  });

  test("HTML-only or unavailable clipboard never deletes selected text", () => {
    const { element, session } = fixture();
    writeTextDomSelection(element, { start: 1, end: 2, direction: "forward" });
    for (const clipboardData of [null, { types: ["text/html"], getData: () => "<b>secret</b>" }]) {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: clipboardData });
      element.dispatchEvent(event);
      expect(session.state.draft).toBe("aΩb");
    }
    const cut = new Event("cut", { bubbles: true, cancelable: true });
    Object.defineProperty(cut, "clipboardData", { value: null });
    element.dispatchEvent(cut);
    expect(session.state.draft).toBe("aΩb");
  });

  test("plain paste, then rich undo restore text and fonts together", async () => {
    const { element, session } = fixture();
    writeTextDomSelection(element, { start: 1, end: 2, direction: "forward" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { types: ["text/plain"], getData: () => "xx" },
    });
    element.dispatchEvent(paste);
    expect(session.state.draft).toBe("axxb");
    expect(session.state.draftFontRuns).toBeUndefined();
    await nextTick();
    await nextTick();
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(session.state.draft).toBe("aΩb");
    expect(session.state.draftFontRuns?.[0]?.fontFamily).toBe("Noto Sans Math");
  });
});
