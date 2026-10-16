import { afterEach, expect, test, vi } from "vitest";
import {
  routeRibbonHistoryShortcut,
  type RibbonHistoryContext,
} from "../../app/ribbon-history-shortcuts";
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  document.body.replaceChildren();
});
function fixture(
  markup = '<div data-workbook-history-surface="ribbon"><button>Effects</button></div>',
  overrides: Partial<RibbonHistoryContext> = {},
) {
  const workspace = document.createElement("section");
  workspace.innerHTML = markup;
  document.body.append(workspace);
  const undo = vi.fn(),
    redo = vi.fn(),
    context = { blocked: false, editing: false, cropping: false, undo, redo, ...overrides };
  let handled = false;
  const handler = (event: KeyboardEvent) => {
    handled = routeRibbonHistoryShortcut(event, context);
  };
  workspace.addEventListener("keydown", handler, true);
  const documentHandler = vi.fn();
  document.addEventListener("keydown", documentHandler);
  cleanups.push(() => document.removeEventListener("keydown", documentHandler));
  function dispatch(
    init: KeyboardEventInit = { key: "z", ctrlKey: true },
    before?: (event: KeyboardEvent) => void,
  ) {
    const target = workspace.querySelector("[data-target]") ?? workspace.querySelector("button")!;
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    before?.(event);
    target.dispatchEvent(event);
    return { event, handled };
  }
  return { workspace, undo, redo, context, dispatch, documentHandler };
}
test.each([
  [{ key: "z", ctrlKey: true }, "undo"],
  [{ key: "z", metaKey: true }, "undo"],
  [{ key: "Z", ctrlKey: true, shiftKey: true }, "redo"],
  [{ key: "Z", metaKey: true, shiftKey: true }, "redo"],
  [{ key: "y", ctrlKey: true }, "redo"],
  [{ key: "y", metaKey: true }, "redo"],
] as const)("routes %j exactly once to %s after Ribbon focus", (init, action) => {
  const f = fixture();
  const { event, handled } = f.dispatch(init);
  expect(handled).toBe(true);
  expect(event.defaultPrevented).toBe(true);
  expect(f[action]).toHaveBeenCalledTimes(1);
  expect(f[action === "undo" ? "redo" : "undo"]).not.toHaveBeenCalled();
  expect(f.documentHandler).not.toHaveBeenCalled();
});
test.each(["blocked", "editing", "cropping"] as const)(
  "preserves owner history while %s",
  (key) => {
    const f = fixture(undefined, { [key]: true });
    const { event, handled } = f.dispatch();
    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(f.undo).not.toHaveBeenCalled();
  },
);
test.each([
  { altKey: true },
  { isComposing: true },
  { repeat: true },
  { ctrlKey: false },
  { key: "x" },
])("does not route excluded chord %j", (change) => {
  const f = fixture();
  expect(f.dispatch({ key: "z", ctrlKey: true, ...change }).handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});
test("already handled events are left to their owner", () => {
  const f = fixture();
  expect(f.dispatch(undefined, (e) => e.preventDefault()).handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});
test.each([
  "<input data-target>",
  "<textarea data-target></textarea>",
  "<select data-target></select>",
  '<div contenteditable="true"><span data-target>text</span></div>',
  "<div contenteditable><span data-target>text</span></div>",
  '<div role="textbox"><span data-target>text</span></div>',
  '<div role="dialog"><button data-target>button</button></div>',
  '<div role="menu"><button data-target>button</button></div>',
  '<div role="listbox"><button data-target>button</button></div>',
])("preserves editable and popup history for %s", (body) => {
  const f = fixture(`<div data-workbook-history-surface="ribbon">${body}</div>`);
  expect(f.dispatch().handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});
test("Grid target remains owned by Grid and never executes a second workspace undo", () => {
  const f = fixture('<div class="sheet-grid"><button data-target>grid</button></div>');
  const gridUndo = vi.fn();
  f.workspace.querySelector(".sheet-grid")!.addEventListener("keydown", gridUndo);
  expect(f.dispatch().handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
  expect(gridUndo).toHaveBeenCalledTimes(1);
});
test("format pane non-text focus is deliberately outside this Ribbon correction", () => {
  const f = fixture('<aside class="picture-format-pane"><button>Preset</button></aside>');
  expect(f.dispatch().handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});
