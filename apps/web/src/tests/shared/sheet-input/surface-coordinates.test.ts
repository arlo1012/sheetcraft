import { describe, expect, test } from "vitest";
import {
  clientDistanceToSurface,
  clientPointToElementBody,
  clientPointToElementSurface,
  clientVectorToSurface,
  getElementEffectiveScale,
} from "../../../shared/sheet-input/surface-coordinates";

function createElement(): HTMLElement {
  const element = document.createElement("div");
  Object.defineProperties(element, {
    offsetWidth: { value: 400 },
    offsetHeight: { value: 200 },
  });
  element.getBoundingClientRect = () => new DOMRect(10, 20, 800, 300);
  return element;
}

describe("surface coordinates", () => {
  test("maps client points into surface and body coordinates using effective scale", () => {
    const element = createElement();

    expect(getElementEffectiveScale(element)).toEqual({ x: 2, y: 1.5 });
    expect(clientPointToElementSurface({ x: 210, y: 170 }, element)).toEqual({ x: 100, y: 100 });
    expect(
      clientPointToElementBody({ x: 210, y: 170 }, element, { width: 48, height: 28 }),
    ).toEqual({ x: 52, y: 72 });
  });

  test("converts client distances and vectors without duplicating scale math", () => {
    expect(clientDistanceToSurface(40, 100, 2)).toBe(30);
    expect(clientVectorToSurface({ x: 12, y: -9 }, { x: 2, y: 1.5 })).toEqual({ x: 6, y: -6 });
  });
});
