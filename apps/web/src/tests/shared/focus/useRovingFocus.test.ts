import { describe, expect, test } from "vitest";
import { useRovingFocus } from "../../../shared/focus/useRovingFocus";

describe("useRovingFocus", () => {
  test("cycles with arrows and honors Home and End", () => {
    const host = document.createElement("div");
    const first = document.createElement("button");
    const second = document.createElement("button");
    const third = document.createElement("button");
    host.append(first, second, third);
    document.body.append(host);
    const { move } = useRovingFocus();

    second.focus();
    const next = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true });
    expect(move(next, [first, second, third])).toBe(true);
    expect(next.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(third);

    const wrap = new KeyboardEvent("keydown", { key: "ArrowDown", cancelable: true });
    move(wrap, [first, second, third]);
    expect(document.activeElement).toBe(first);

    const end = new KeyboardEvent("keydown", { key: "End", cancelable: true });
    move(end, [first, second, third]);
    expect(document.activeElement).toBe(third);

    host.remove();
  });
});
