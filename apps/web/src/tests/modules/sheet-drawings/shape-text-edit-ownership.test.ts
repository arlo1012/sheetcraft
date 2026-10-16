import { afterEach, describe, expect, test } from "vitest";
import { ownsShapeTextEditTarget } from "../../../modules/sheet-drawings/shape-text-edit-ownership";

afterEach(() => document.body.replaceChildren());
function root(session: number) {
  const element = document.createElement("div");
  element.dataset.shapeTextEditSession = String(session);
  document.body.appendChild(element);
  return element;
}
function popup(id: string) {
  const element = document.createElement("div");
  element.id = id;
  element.innerHTML = "<button><span>Popup choice</span></button>";
  document.body.appendChild(element);
  return element;
}

describe("exact leased text edit focus ownership", () => {
  test("owns the marked root and all its element and text descendants", () => {
    const editor = root(42);
    editor.innerHTML = "<button><span>Text</span></button>";
    expect(ownsShapeTextEditTarget(editor, 42)).toBe(true);
    expect(ownsShapeTextEditTarget(editor.querySelector("span"), 42)).toBe(true);
    expect(ownsShapeTextEditTarget(editor.querySelector("span")!.firstChild, 42)).toBe(true);
  });

  test.each(["root", "descendant"] as const)(
    "owns directly controlled teleported popup roots and descendants from a %s control",
    (placement) => {
      const ribbon = root(42),
        control = placement === "root" ? ribbon : document.createElement("button");
      if (control !== ribbon) ribbon.appendChild(control);
      control.setAttribute("aria-controls", "missing-popup  first-popup\nsecond-popup");
      const first = popup("first-popup"),
        second = popup("second-popup");
      expect(ownsShapeTextEditTarget(first, 42)).toBe(true);
      expect(ownsShapeTextEditTarget(first.querySelector("span"), 42)).toBe(true);
      expect(ownsShapeTextEditTarget(second.querySelector("span")!.firstChild, 42)).toBe(true);
    },
  );

  test("rejects another session and unrelated or transitively controlled popups", () => {
    const ours = root(42),
      other = root(43);
    ours.setAttribute("aria-controls", "ours-popup");
    other.setAttribute("aria-controls", "other-popup");
    const oursPopup = popup("ours-popup"),
      otherPopup = popup("other-popup"),
      unrelated = popup("unrelated");
    oursPopup.querySelector("button")!.setAttribute("aria-controls", "unrelated");
    expect(ownsShapeTextEditTarget(other, 42)).toBe(false);
    expect(ownsShapeTextEditTarget(otherPopup.querySelector("span"), 42)).toBe(false);
    expect(ownsShapeTextEditTarget(unrelated.querySelector("span"), 42)).toBe(false);
    expect(ownsShapeTextEditTarget(oursPopup, 43)).toBe(false);
  });

  test("inactive contextual tabs do not acquire the shared Home panel through aria-controls", () => {
    const drawingTab = root(42);
    drawingTab.setAttribute("role", "tab");
    drawingTab.setAttribute("aria-selected", "false");
    drawingTab.setAttribute("aria-controls", "shared-ribbon-panel");
    const textTab = document.createElement("button");
    textTab.dataset.shapeTextEditSession = "42";
    textTab.setAttribute("role", "tab");
    textTab.setAttribute("aria-controls", "shared-ribbon-panel");
    document.body.appendChild(textTab);
    const homePanel = popup("shared-ribbon-panel");
    expect(ownsShapeTextEditTarget(drawingTab, 42)).toBe(true);
    expect(ownsShapeTextEditTarget(textTab, 42)).toBe(true);
    expect(ownsShapeTextEditTarget(homePanel, 42)).toBe(false);
    expect(ownsShapeTextEditTarget(homePanel.querySelector("button"), 42)).toBe(false);
    const control = document.createElement("button");
    control.setAttribute("aria-controls", "actual-shape-menu");
    drawingTab.appendChild(control);
    const menu = popup("actual-shape-menu");
    expect(ownsShapeTextEditTarget(menu.querySelector("span"), 42)).toBe(true);
  });

  test("rejects null, non-node targets and document/body without a session marker", () => {
    root(42);
    expect(ownsShapeTextEditTarget(null, 42)).toBe(false);
    expect(ownsShapeTextEditTarget(new EventTarget(), 42)).toBe(false);
    expect(ownsShapeTextEditTarget(document, 42)).toBe(false);
    expect(ownsShapeTextEditTarget(document.body, 42)).toBe(false);
  });
});
