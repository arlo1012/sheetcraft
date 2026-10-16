import { afterEach, expect, test, vi } from "vitest";
import { routeFormatPaneHistoryShortcut } from "../../app/format-pane-history-shortcuts";

afterEach(() => document.body.replaceChildren());
function fixture(body = "<button data-target>Preset</button>") {
  const pane = document.createElement("aside");
  pane.setAttribute("data-shape-format-pane", "");
  pane.innerHTML = body;
  document.body.append(pane);
  const undo = vi.fn(),
    redo = vi.fn();
  const current = vi.fn(() => true);
  const context = { pane, current, blocked: false, editing: false, cropping: false, undo, redo };
  let handled = false;
  pane.addEventListener(
    "keydown",
    (event) => {
      handled = routeFormatPaneHistoryShortcut(event as KeyboardEvent, context);
    },
    true,
  );
  function dispatch(init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    pane.querySelector("[data-target]")!.dispatchEvent(event);
    return { event, handled };
  }
  return { pane, undo, redo, current, context, dispatch };
}
const mode =
  '<input data-target readonly role="combobox" aria-expanded="false" data-format-pane-history-control="readonly-combobox">';
const panelSelect =
  '<input data-target readonly role="combobox" aria-expanded="false" data-panel-select-control="readonly-combobox">';
test.each(["<button data-target>Preset</button>", mode, panelSelect])(
  "routes current pane command history once for %s",
  (markup) => {
    const f = fixture(markup);
    expect(f.dispatch().handled).toBe(true);
    expect(f.undo).toHaveBeenCalledTimes(1);
    expect(f.redo).not.toHaveBeenCalled();
    expect(f.dispatch({ shiftKey: true }).handled).toBe(true);
    expect(f.redo).toHaveBeenCalledTimes(1);
  },
);
test.each([
  "<input data-target>",
  '<input data-target type="number">',
  '<input data-target readonly role="combobox">',
  '<input data-target readonly role="combobox" aria-expanded="true" data-format-pane-history-control="readonly-combobox">',
  '<input data-target role="combobox" aria-expanded="false" data-format-pane-history-control="readonly-combobox">',
  '<input data-target readonly role="combobox" aria-expanded="true" data-panel-select-control="readonly-combobox">',
  '<input data-target role="combobox" aria-expanded="false" data-panel-select-control="readonly-combobox">',
  '<input data-target readonly disabled role="combobox" aria-expanded="false" data-panel-select-control="readonly-combobox">',
  "<textarea data-target></textarea>",
  "<select data-target></select>",
  '<div contenteditable="true"><button data-target>Editable</button></div>',
  '<div role="textbox"><button data-target>Text</button></div>',
  '<div role="dialog"><button data-target>Dialog</button></div>',
  '<div role="menu"><button data-target>Menu</button></div>',
  '<div role="listbox"><button data-target>List</button></div>',
  "<button data-target disabled>Disabled</button>",
])("leaves native editing and popup history alone for %s", (markup) => {
  const f = fixture(markup);
  const { event, handled } = f.dispatch();
  expect(handled).toBe(false);
  expect(event.defaultPrevented).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});
test.each([{ isComposing: true }, { keyCode: 229 }, { altKey: true }, { repeat: true }])(
  "preserves excluded chord %j",
  (flags) => {
    const f = fixture(mode);
    expect(f.dispatch(flags).handled).toBe(false);
    expect(f.undo).not.toHaveBeenCalled();
  },
);
test.each(["blocked", "editing", "cropping"] as const)("does not override %s owner", (key) => {
  const f = fixture(mode);
  f.context[key] = true;
  expect(f.dispatch().handled).toBe(false);
});
test("rejects retired owner, disconnected pane and a control outside the current pane", () => {
  const f = fixture(mode);
  f.current.mockReturnValue(false);
  expect(f.dispatch().handled).toBe(false);
  f.current.mockReturnValue(true);
  f.pane.remove();
  expect(f.dispatch().handled).toBe(false);
  document.body.append(f.pane);
  const event = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.body.addEventListener("keydown", (e) => routeFormatPaneHistoryShortcut(e, f.context), {
    once: true,
  });
  document.body.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});

test.each([
  "element",
  "fontSize",
  "labelAngle",
  "gapWidth",
  "overlap",
  "strokeWidth",
  "min",
  "max",
  "majorUnit",
  "minorUnit",
])("routes owned chart %s reset Undo and Redo", (field) => {
  const f = fixture(`<button data-target data-chart-format-reset="${field}">Reset</button>`);
  f.pane.removeAttribute("data-shape-format-pane");
  f.pane.setAttribute("data-chart-format-pane", "");
  expect(f.dispatch().handled).toBe(true);
  expect(f.undo).toHaveBeenCalledTimes(1);
  expect(f.dispatch({ shiftKey: true }).handled).toBe(true);
  expect(f.redo).toHaveBeenCalledTimes(1);
  f.current.mockReturnValue(false);
  expect(f.dispatch().handled).toBe(false);
  expect(f.undo).toHaveBeenCalledTimes(1);
});

test.each([
  "<button data-target>Close</button>",
  '<input data-target data-chart-format-reset="element">',
  '<button data-target disabled data-chart-format-reset="element">Reset</button>',
  '<div role="dialog"><button data-target data-chart-format-reset="element">Reset</button></div>',
])("chart reset history does not capture other controls: %s", (markup) => {
  const f = fixture(markup);
  f.pane.removeAttribute("data-shape-format-pane");
  f.pane.setAttribute("data-chart-format-pane", "");
  expect(f.dispatch().handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});

test.each(["No fill", "No line"])("routes explicitly owned %s commands only", (label) => {
  const f = fixture(
    `<button data-target data-format-pane-history-control="command">${label}</button>`,
  );
  f.pane.removeAttribute("data-shape-format-pane");
  f.pane.setAttribute("data-chart-format-pane", "");
  expect(f.dispatch().handled).toBe(true);
  expect(f.undo).toHaveBeenCalledTimes(1);
  expect(f.dispatch({ shiftKey: true }).handled).toBe(true);
  expect(f.redo).toHaveBeenCalledTimes(1);
  f.current.mockReturnValue(false);
  expect(f.dispatch().handled).toBe(false);
});
test.each([
  '<input data-target data-format-pane-history-control="command">',
  '<button disabled data-target data-format-pane-history-control="command">No fill</button>',
  '<div role="dialog"><button data-target data-format-pane-history-control="command">No line</button></div>',
])("explicit command marker cannot override native or popup isolation: %s", (markup) => {
  const f = fixture(markup);
  f.pane.removeAttribute("data-shape-format-pane");
  f.pane.setAttribute("data-chart-format-pane", "");
  expect(f.dispatch().handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});

test.each(["checkbox", "radio"])(
  "owned %s label and input route history without admitting other controls",
  (type) => {
    for (const target of ["label", "input"]) {
      const f = fixture(
        `<label ${target === "label" ? "data-target" : ""} data-format-pane-history-control="discrete"><input ${target === "input" ? "data-target" : ""} type="${type}"></label>`,
      );
      f.pane.removeAttribute("data-shape-format-pane");
      f.pane.setAttribute("data-chart-format-pane", "");
      expect(f.dispatch().handled).toBe(true);
      expect(f.undo).toHaveBeenCalledTimes(1);
      expect(f.dispatch({ shiftKey: true }).handled).toBe(true);
      expect(f.redo).toHaveBeenCalledTimes(1);
      expect(f.dispatch({ isComposing: true }).handled).toBe(false);
      f.current.mockReturnValue(false);
      expect(f.dispatch().handled).toBe(false);
    }
  },
);
test.each([
  '<label data-target><input type="checkbox"></label>',
  '<label data-target data-format-pane-history-control="discrete"><input type="text"></label>',
  '<label data-target data-format-pane-history-control="discrete"><input type="checkbox" disabled></label>',
  '<label data-target data-format-pane-history-control="discrete"><input type="radio" readonly></label>',
  '<label data-format-pane-history-control="discrete"><span data-target>Text</span><input type="checkbox"></label>',
  '<div role="dialog"><label data-target data-format-pane-history-control="discrete"><input type="radio"></label></div>',
  '<div role="listbox"><label data-target data-format-pane-history-control="discrete"><input type="checkbox"></label></div>',
])("discrete marker does not bypass edit, disabled or popup isolation: %s", (markup) => {
  const f = fixture(markup);
  f.pane.removeAttribute("data-shape-format-pane");
  f.pane.setAttribute("data-chart-format-pane", "");
  expect(f.dispatch().handled).toBe(false);
  expect(f.undo).not.toHaveBeenCalled();
});
