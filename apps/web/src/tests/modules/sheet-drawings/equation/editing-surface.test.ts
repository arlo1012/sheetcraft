import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import {
  findEquationNode,
  type EquationDocument,
  type EquationNode,
  type EquationSequence,
} from "@sheetcraft/core/equation-document";
import EquationEditingSurface from "../../../../modules/sheet-drawings/equation/EquationEditingSurface.vue";
import {
  createEquationDraft,
  EquationDraftHistory,
  equationDocumentKey,
  equationSlotText,
  type EquationDraftAction,
  type EquationDraftSnapshot,
  type EquationSelection,
} from "../../../../modules/sheet-drawings/equation/equation-draft";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
const slot = (id: string, value = ""): EquationSequence => ({
  kind: "sequence",
  id,
  children: value ? [{ kind: "text", id: `${id}-text`, value }] : [],
});
const math = (...children: EquationNode[]): EquationDocument => ({
  kind: "equation-document-v1",
  body: { ...slot("body"), children },
});

function fixture(equation: EquationDocument, selection?: EquationSelection) {
  let history = new EquationDraftHistory(createEquationDraft(equation, selection));
  const state = shallowRef<EquationDraftSnapshot>(history.current);
  const owner = shallowRef("owner-a"),
    session = shallowRef(1),
    disabled = shallowRef(false);
  const actions: EquationDraftAction[] = [],
    compositions: boolean[] = [],
    commands: string[] = [];
  function synchronizeHistory(): void {
    if (equationDocumentKey(history.current.document) !== equationDocumentKey(state.value.document))
      history = new EquationDraftHistory(state.value);
  }
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(EquationEditingSurface, {
          document: state.value.document,
          selection: state.value.selection,
          ownerId: owner.value,
          sessionId: session.value,
          disabled: disabled.value,
          onAction: (action: EquationDraftAction) => {
            actions.push(action);
            synchronizeHistory();
            const next = history.apply(action);
            if (next) state.value = next;
          },
          onSelectionChange: (next: EquationSelection) => {
            synchronizeHistory();
            state.value = history.select(next);
          },
          onCompositionChange: (active: boolean) => {
            compositions.push(active);
          },
          onHistory: (direction: "undo" | "redo") => {
            commands.push(direction);
            const next = direction === "undo" ? history.undo() : history.redo();
            if (next) state.value = next;
          },
          onNextSlot: (direction: "forward" | "backward") => {
            commands.push(direction);
          },
        }),
    }),
    { attachTo: document.body },
  );
  mounted.push(wrapper);
  const input = (id: string, offset?: number) =>
    wrapper.get<HTMLInputElement>(
      `[data-equation-slot="${id}"]${offset === undefined ? "" : `[data-equation-offset="${offset}"]`}`,
    );
  const text = (id = "body") =>
    equationSlotText(findEquationNode(state.value.document, id) as EquationSequence);
  return { wrapper, input, state, owner, session, disabled, actions, compositions, commands, text };
}
async function select(
  input: ReturnType<ReturnType<typeof fixture>["input"]>,
  start: number,
  end = start,
) {
  input.element.setSelectionRange(start, end);
  await input.trigger("click");
  await nextTick();
}

describe("in-canvas semantic equation editing surface", () => {
  test("pointer targets fraction, nested radical and individual matrix cells", async () => {
    const matrix: EquationNode = {
      kind: "matrix",
      id: "matrix",
      brackets: "bracket",
      alignment: "center",
      rows: [
        [slot("r0c0", "12"), slot("r0c1", "3")],
        [slot("r1c0", "4"), slot("r1c1", "5")],
      ],
    };
    const root: EquationNode = { kind: "radical", id: "root", radicand: slot("radicand", "x") };
    const fraction: EquationNode = {
      kind: "fraction",
      id: "fraction",
      style: "stacked",
      numerator: { ...slot("num"), children: [root, matrix] },
      denominator: slot("den", "c"),
    };
    const editor = fixture(math(fraction));
    await select(editor.input("den"), 0, 1);
    await editor.input("den").setValue("d");
    await select(editor.input("radicand"), 1);
    await editor.input("radicand").setValue("xy");
    await select(editor.input("r0c1"), 0, 1);
    await editor.input("r0c1").setValue("9");
    expect(editor.text("den")).toBe("d");
    expect(editor.text("radicand")).toBe("xy");
    expect(editor.text("r0c1")).toBe("9");
    expect(editor.text("r0c0")).toBe("12");
    expect(editor.text("num")).toBe("\ufffc\ufffc");
    expect(editor.wrapper.findAll("textarea, [contenteditable]")).toHaveLength(0);
    expect(editor.wrapper.findAll('[data-equation-kind="fraction"]')).toHaveLength(1);
  });

  test("native selected text replacement and private undo/redo preserve nested document", async () => {
    const editor = fixture(math({ kind: "text", id: "text", value: "abc" }));
    await select(editor.input("body"), 1, 2);
    await editor.input("body").setValue("axc");
    expect(editor.text()).toBe("axc");
    await editor.input("body").trigger("keydown", { key: "z", ctrlKey: true });
    expect(editor.text()).toBe("abc");
    await editor.input("body").trigger("keydown", { key: "z", metaKey: true, shiftKey: true });
    expect(editor.text()).toBe("axc");
    expect(editor.commands).toEqual(["undo", "redo"]);
  });

  test("exposed focus preserves the selected nested slot and caret", async () => {
    const editor = fixture(
      math({
        kind: "fraction",
        id: "fraction",
        style: "stacked",
        numerator: slot("num", "ab"),
        denominator: slot("den", "c"),
      }),
      { slotId: "num", start: 2, end: 2 },
    );
    await nextTick();
    const surface = editor.wrapper.getComponent(EquationEditingSurface).vm as unknown as {
      focus(): void;
    };
    surface.focus();
    await nextTick();
    expect(document.activeElement).toBe(editor.input("num").element);
    expect(editor.input("num").element.selectionStart).toBe(2);
    expect(editor.state.value.selection).toEqual({ slotId: "num", start: 2, end: 2 });
  });

  test("normal text mode survives native replacement", async () => {
    const editor = fixture(math({ kind: "text", id: "normal", value: "word", mode: "normal" }));
    await select(editor.input("body"), 4);
    await editor.input("body").setValue("words");
    expect(editor.state.value.document.body.children).toHaveLength(1);
    expect(editor.state.value.document.body.children[0]).toMatchObject({
      kind: "text",
      value: "words",
      mode: "normal",
    });
  });

  test("a combining mark text replacement cannot consume the preceding structural unit", async () => {
    const fraction: EquationNode = {
      kind: "fraction",
      id: "fraction",
      style: "stacked",
      numerator: slot("num", "a"),
      denominator: slot("den", "b"),
    };
    const editor = fixture(math(fraction, { kind: "text", id: "accent", value: "\u0301" }));
    await select(editor.input("body", 1), 0, 1);
    await editor.input("body", 1).setValue("z");
    expect(findEquationNode(editor.state.value.document, "fraction")?.kind).toBe("fraction");
    expect(editor.text()).toBe("\ufffcz");
  });

  test("IME replaces its captured original range once despite moved selection and trailing input", async () => {
    const editor = fixture(math({ kind: "text", id: "text", value: "ab" }));
    const input = editor.input("body");
    await select(input, 0, 1);
    await input.trigger("compositionstart");
    editor.state.value = { ...editor.state.value, selection: { slotId: "body", start: 2, end: 2 } };
    await input.setValue("汉b");
    expect(editor.actions).toHaveLength(0);
    await input.trigger("compositionend", { data: "汉" });
    await input.trigger("input");
    expect(editor.text()).toBe("汉b");
    expect(editor.actions).toHaveLength(1);
    expect(editor.actions[0]).toMatchObject({
      type: "replace-text",
      selection: { slotId: "body", start: 0, end: 1 },
      text: "汉",
    });
    expect(editor.compositions).toEqual([true, false]);
  });

  test("canceled IME cannot swallow the next ordinary edit at a different caret", async () => {
    const editor = fixture(math({ kind: "text", id: "text", value: "ab" }));
    const input = editor.input("body");
    await select(input, 0);
    await input.trigger("compositionstart");
    await input.trigger("compositionend", { data: "" });
    await select(input, 2);
    await input.setValue("abx");
    expect(editor.text()).toBe("abx");
    expect(editor.actions).toHaveLength(1);
  });

  test("same-owner document replacement rejects stale composition and restores displayed text", async () => {
    const editor = fixture(math({ kind: "text", id: "text", value: "ab" }));
    const input = editor.input("body");
    await select(input, 0, 1);
    await input.trigger("compositionstart");
    await input.setValue("汉b");
    editor.state.value = createEquationDraft(math({ kind: "text", id: "text", value: "zz" }));
    await nextTick();
    await input.trigger("compositionend", { data: "汉" });
    await nextTick();
    expect(editor.actions).toHaveLength(0);
    expect(editor.input("body").element.value).toBe("zz");
    expect(editor.text()).toBe("zz");
  });

  test("owner/session replacement rejects late composition events and clears busy state", async () => {
    const editor = fixture(math({ kind: "text", id: "text", value: "ab" }));
    const old = editor.input("body");
    await select(old, 0, 1);
    await old.trigger("compositionstart");
    await old.setValue("汉b");
    editor.owner.value = "owner-b";
    editor.session.value = 2;
    await nextTick();
    await old.trigger("compositionend", { data: "汉" });
    expect(editor.actions).toHaveLength(0);
    expect(editor.input("body").element.value).toBe("ab");
    expect(editor.compositions).toEqual([true, false]);
  });

  test("disabled cancellation leaves no capture or stale native text after re-enable", async () => {
    const editor = fixture(math({ kind: "text", id: "text", value: "ab" }));
    const input = editor.input("body");
    await select(input, 0);
    await input.trigger("compositionstart");
    await input.setValue("汉ab");
    editor.disabled.value = true;
    await nextTick();
    expect(input.element.value).toBe("ab");
    editor.disabled.value = false;
    await nextTick();
    await input.trigger("compositionend", { data: "汉" });
    input.element.value = "汉ab";
    await input.trigger("input");
    expect(editor.actions).toHaveLength(0);
    expect(input.element.value).toBe("ab");
    await select(input, 2);
    await input.setValue("abx");
    expect(editor.text()).toBe("abx");
  });

  test("nested Right exits only at slot edge and Tab is not advertised as WPS traversal", async () => {
    const editor = fixture(math({ kind: "radical", id: "root", radicand: slot("radicand", "xy") }));
    await select(editor.input("radicand"), 1);
    await editor.input("radicand").trigger("keydown", { key: "ArrowRight" });
    expect(editor.state.value.selection.slotId).toBe("radicand");
    await select(editor.input("radicand"), 2);
    expect(editor.input("radicand").element.selectionStart).toBe(2);
    await editor.input("radicand").trigger("keydown", { key: "ArrowRight" });
    expect(editor.state.value.selection).toEqual({ slotId: "body", start: 1, end: 1 });
    await editor.input("body", 1).trigger("keydown", { key: "Tab" });
    expect(editor.commands).toEqual([]);
    await editor
      .input("body", 1)
      .trigger("keydown", { key: "ArrowRight", ctrlKey: true, altKey: true });
    expect(editor.commands).toEqual(["forward"]);
  });

  test.each(["Backspace", "Delete"])(
    "%s removes exactly an adjacent structural unit and privately undoes",
    async (key) => {
      const editor = fixture(
        math({ kind: "radical", id: "root", radicand: slot("radicand", "x") }),
      );
      const offset = key === "Backspace" ? 1 : 0;
      await select(editor.input("body", offset), 0);
      await editor.input("body", offset).trigger("keydown", { key });
      expect(editor.text()).toBe("");
      expect(findEquationNode(editor.state.value.document, "root")).toBeUndefined();
      await editor.input("body", 0).trigger("keydown", { key: "z", ctrlKey: true });
      expect(findEquationNode(editor.state.value.document, "root")?.kind).toBe("radical");
    },
  );

  test("Shift+Left selects one structure, survives keyup and replaces the semantic range", async () => {
    const editor = fixture(
      math(
        { kind: "radical", id: "root", radicand: slot("radicand", "x") },
        { kind: "text", id: "tail", value: "y" },
      ),
    );
    const input = editor.input("body", 1);
    await select(input, 0);
    await input.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
    await input.trigger("keyup", { key: "ArrowLeft", shiftKey: true });
    expect(editor.state.value.selection).toEqual({ slotId: "body", start: 0, end: 1 });
    expect(editor.wrapper.get('[data-equation-node="root"]').classes()).toContain(
      "is-range-selected",
    );
    await input.setValue("zy");
    expect(editor.text()).toBe("zy");
    expect(findEquationNode(editor.state.value.document, "root")).toBeUndefined();
  });

  test("Delete uses the semantic selected range across structure and adjacent text", async () => {
    const editor = fixture(
      math(
        { kind: "radical", id: "root", radicand: slot("radicand", "x") },
        { kind: "text", id: "tail", value: "y" },
      ),
    );
    const input = editor.input("body", 1);
    await select(input, 1);
    await input.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
    await input.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
    expect(editor.state.value.selection).toEqual({ slotId: "body", start: 0, end: 2 });
    await input.trigger("keydown", { key: "Delete" });
    expect(editor.text()).toBe("");
  });

  test("prescripts, accents, new operators and boxes remain real editable semantic slots", async () => {
    const editor = fixture(
      math(
        {
          kind: "script",
          id: "script",
          base: slot("base", "X"),
          presubscript: slot("pre-sub", "2"),
          presuperscript: slot("pre-super", "3"),
          subscript: slot("sub", "4"),
          superscript: slot("super", "5"),
        },
        {
          kind: "nary",
          id: "nary",
          operator: "oiint",
          limits: "side",
          body: slot("integrand", "f"),
        },
        {
          kind: "accent",
          id: "accent",
          name: "underleftrightarrow",
          body: slot("accent-body", "x"),
        },
        { kind: "box", id: "box", body: slot("boxed", "y") },
      ),
    );
    for (const id of [
      "pre-sub",
      "pre-super",
      "base",
      "sub",
      "super",
      "integrand",
      "accent-body",
      "boxed",
    ])
      expect(editor.input(id).element.tagName).toBe("INPUT");
    expect(editor.wrapper.get('[data-equation-role="presuperscript"]').classes()).toContain(
      "script-superscript",
    );
    expect(editor.wrapper.get('[data-equation-role="presubscript"]').classes()).toContain(
      "script-subscript",
    );
    expect(
      editor.wrapper.get('[data-equation-node="accent"] .equation-accent').classes(),
    ).toContain("accent-under");
    expect(editor.wrapper.get('[data-equation-node="nary"] .nary-sign').text()).toBe("∯");
    await select(editor.input("boxed"), 0, 1);
    await editor.input("boxed").setValue("z");
    expect(editor.text("boxed")).toBe("z");
    expect(findEquationNode(editor.state.value.document, "box")?.kind).toBe("box");
  });
});
test("shifted semantic navigation preserves its anchor when reversing across a structure and resets on pointer selection", async () => {
  const editor = fixture(
    math(
      { kind: "radical", id: "root", radicand: slot("radicand", "x") },
      { kind: "text", id: "tail", value: "y" },
    ),
  );
  const input = editor.input("body", 1);
  await select(input, 0);
  await input.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
  await input.trigger("keyup", { key: "ArrowLeft", shiftKey: true });
  expect(editor.state.value.selection).toEqual({ slotId: "body", start: 0, end: 1 });
  await input.trigger("keydown", { key: "ArrowRight", shiftKey: true });
  expect(editor.state.value.selection).toEqual({ slotId: "body", start: 1, end: 1 });
  await input.trigger("keydown", { key: "ArrowRight", shiftKey: true });
  expect(editor.state.value.selection).toEqual({ slotId: "body", start: 1, end: 2 });
  await input.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
  expect(editor.state.value.selection).toEqual({ slotId: "body", start: 1, end: 1 });
  await input.trigger("pointerdown");
  await select(input, 1);
  await input.trigger("keydown", { key: "ArrowLeft", shiftKey: true });
  expect(editor.state.value.selection).toEqual({ slotId: "body", start: 1, end: 2 });
});
