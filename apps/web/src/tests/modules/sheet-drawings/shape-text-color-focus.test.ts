import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ShapeCanvasTextEditor from "../../../modules/sheet-drawings/components/ShapeCanvasTextEditor.vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { createAppI18n } from "../../../shared/i18n";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { focusShapeTextEditInput } from "../../../modules/sheet-drawings/shape-text-edit-ownership";

const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 132, 28),
  );
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function settle() {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}
async function fixture(rich = false, all = false) {
  const start = all ? 0 : 1,
    end = all ? 10 : 8;
  const setSelection = vi.fn(() => true);
  const editor = mount(ShapeCanvasTextEditor, {
    attachTo: document.body,
    props: {
      drawing: createGraphicDrawing("text", "textBox", "alpha beta", { row: 0, column: 0 }),
      sessionId: 7,
      draft: "alpha beta",
      update: () => true,
      rich,
      updateRich: () => true,
      initialSelection: { start, end, direction: "backward" },
      composition: () => true,
      commit: () => true,
      cancel: vi.fn(),
      setSelection,
    },
  });
  const ribbon = document.createElement("div");
  ribbon.dataset.shapeTextEditSession = "7";
  document.body.append(ribbon);
  const select = mount(ColorPaletteSelect, {
    attachTo: ribbon,
    props: { label: "Text color", onSelect: () => void nextTick(() => focusShapeTextEditInput(7)) },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(editor, select);
  await settle();
  const input = editor.get<HTMLElement>(rich ? "[data-shape-rich-text-input]" : "textarea").element;
  focusShapeTextEditInput(7);
  if (input instanceof HTMLTextAreaElement) input.setSelectionRange(start, end, "backward");
  input.dispatchEvent(new Event("select"));
  return { editor, select, input, setSelection, start, end };
}
async function mouseDown(target: Element, options: MouseEventInit = {}) {
  target.dispatchEvent(
    new MouseEvent("pointerdown", { bubbles: true, cancelable: true, ...options }),
  );
  const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  // happy-dom does not implement the browser's default mousedown focus action.
  // A non-focusable arrow blurs the old input to body BEFORE click is delivered.
  if (!event.defaultPrevented) (document.activeElement as HTMLElement)?.blur();
  await nextTick();
  return event;
}

test.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])("real color arrow preserves selected text lease (rich=%s, all=%s)", async (rich, all) => {
  const f = await fixture(rich, all);
  const arrow = f.select.get(".t-fake-arrow").element;
  for (let round = 0; round < 2; round++) {
    const event = await mouseDown(arrow);
    expect({
      prevented: event.defaultPrevented,
      commits: f.editor.emitted("requestCommit"),
    }).toEqual({ prevented: true, commits: undefined });
    expect(document.activeElement).toBe(f.select.get("input").element);
    expect(f.editor.emitted("requestCommit")).toBeUndefined();
    arrow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
    const palette = document.querySelector<HTMLElement>(".color-palette")!;
    expect(palette).not.toBeNull();
    expect(f.editor.emitted("requestCommit")).toBeUndefined();
    palette.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    expect(document.querySelector(".color-palette")).toBeNull();
    expect(f.editor.emitted("requestCommit")).toBeUndefined();
  }
  await mouseDown(arrow);
  arrow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await settle();
  document.querySelector<HTMLElement>('[data-color-action="default"]')!.click();
  await settle();
  expect(document.activeElement).toBe(f.input);
  if (f.input instanceof HTMLTextAreaElement)
    expect([f.input.selectionStart, f.input.selectionEnd, f.input.selectionDirection]).toEqual([
      f.start,
      f.end,
      "backward",
    ]);
  else expect(document.getSelection()?.toString()).toBe("alpha beta".slice(f.start, f.end));
  expect(f.editor.emitted("requestCommit")).toBeUndefined();
  const outside = document.createElement("button");
  document.body.append(outside);
  outside.focus();
  await nextTick();
  expect(f.editor.emitted("requestCommit")).toEqual([["blur"]]);
});
