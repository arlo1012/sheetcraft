import { afterEach, describe, expect, test } from "vitest";
import {
  readTextDomSelection,
  readTextInputTargetRange,
  writeTextDomSelection,
} from "../../../shared/cell-editing/text-dom-selection";

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});
function root() {
  const element = document.createElement("div");
  element.append(document.createTextNode("a"));
  const span = document.createElement("span");
  span.textContent = "Ω😀";
  element.append(span);
  element.append(document.createTextNode("b"));
  document.body.append(element);
  return element;
}

describe("controlled text DOM offsets", () => {
  test.each(["forward", "backward", "none"] as const)(
    "round trips %s across nested spans and supplementary text",
    (direction) => {
      const element = root();
      const selection = { start: direction === "none" ? 4 : 1, end: 4, direction };
      writeTextDomSelection(element, selection);
      expect(readTextDomSelection(element)).toEqual(selection);
    },
  );

  test("beforeinput target range can differ from the collapsed DOM caret", () => {
    const element = root();
    writeTextDomSelection(element, { start: 5, end: 5, direction: "none" });
    const node = element.children[0]!.firstChild!;
    const event = new InputEvent("beforeinput", {
      inputType: "insertReplacementText",
      data: "δ",
      cancelable: true,
    });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [{ startContainer: node, startOffset: 0, endContainer: node, endOffset: 1 }],
    });
    expect(readTextInputTargetRange(element, event)).toEqual({
      start: 1,
      end: 2,
      direction: "none",
    });
  });

  test("foreign or multiple ranges cannot redirect a cell text edit", () => {
    const element = root();
    const foreign = document.createTextNode("private");
    const event = new InputEvent("beforeinput");
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [
        { startContainer: foreign, startOffset: 0, endContainer: foreign, endOffset: 1 },
      ],
    });
    expect(readTextInputTargetRange(element, event)).toBeUndefined();
  });
});
