import { describe, expect, test } from "vitest";
import {
  captureSymbolShortcut,
  defaultSymbolPreferences,
  moveCustomSymbol,
  parseSymbolPreferences,
  resolveSymbolShortcut,
  symbolIdentity,
  validSymbolInsertion,
  validateSymbolShortcut,
  withCustomSymbol,
  withRecentSymbol,
} from "../../../modules/insert-tools/symbols/symbol-preferences";
import {
  navigateSymbolGrid,
  parseDialogCode,
  SPECIAL_SYMBOLS,
} from "../../../modules/insert-tools/symbols/symbol-dialog-model";

describe("desktop symbol preference model", () => {
  test("preserves the exact measured 39 default scalars and visibility", () => {
    const prefs = defaultSymbolPreferences();
    expect(prefs.custom.map((entry) => entry.text).join("")).toBe(
      "＋－×÷㎏㎜㎝㎡ɑɡαβθ℃〖｛©®＠＆＊＃％‰＄￥§¦※◎≈…≤≥≦≧£RQ",
    );
    expect(prefs.custom).toHaveLength(39);
    expect(prefs.custom.filter((entry) => entry.visible)).toHaveLength(36);
    expect(prefs.custom.every((entry) => entry.fontFamily === undefined)).toBe(true);
  });
  test("retains text plus font identity and bounded most-recent-first order", () => {
    let prefs = defaultSymbolPreferences();
    prefs = withRecentSymbol(prefs, { text: "Ω", fontFamily: "Noto Sans" });
    prefs = withRecentSymbol(prefs, { text: "Ω", fontFamily: "Noto Sans Math" });
    prefs = withRecentSymbol(prefs, { text: "Ω", fontFamily: "Noto Sans" });
    expect(prefs.recent.slice(0, 2)).toEqual([
      { text: "Ω", fontFamily: "Noto Sans" },
      { text: "Ω", fontFamily: "Noto Sans Math" },
    ]);
    for (const text of "abcdefghijklmnopqrstuvwxyz") prefs = withRecentSymbol(prefs, { text });
    expect(prefs.recent).toHaveLength(18);
    expect(prefs.recent[0]?.text).toBe("z");
  });
  test("adds at front, deduplicates exact identity and moves without mutating input", () => {
    const original = defaultSymbolPreferences();
    const first = withCustomSymbol(original, { text: "Ω", fontFamily: "Noto Sans" });
    const second = withCustomSymbol(first, { text: "Ω", fontFamily: "Noto Sans Math" });
    expect(withCustomSymbol(second, first.custom[0]!)).toBe(second);
    expect(second.custom).toHaveLength(41);
    expect(moveCustomSymbol(second, 0, 1).custom[1]).toEqual(second.custom[0]);
    expect(moveCustomSymbol(second, 0, -1)).toBe(second);
    expect(original.custom).toHaveLength(39);
  });
  test("round trips arbitrary literal sequences, spaces and supplementary characters", () => {
    for (const text of ["Ω🙂<>&", "e\u0301", "👩‍💻", " ", "=SUM(A1)"])
      expect(validSymbolInsertion({ text })).toBe(true);
    for (const text of ["", "\ud800", "\u0000", "a".repeat(17)])
      expect(validSymbolInsertion({ text })).toBe(false);
    const prefs = withCustomSymbol(defaultSymbolPreferences(), {
      text: "👩‍💻",
      fontFamily: "Noto Sans",
    });
    expect(parseSymbolPreferences(JSON.stringify(prefs))).toEqual(prefs);
    expect(parseSymbolPreferences("{bad")).toEqual(defaultSymbolPreferences());
    expect(parseSymbolPreferences(JSON.stringify({ ...prefs, version: 2 }))).toEqual(
      defaultSymbolPreferences(),
    );
  });
  test("captures shortcuts, rejects reserved/duplicate keys, resolves hidden entries", () => {
    const event = { key: "F11", ctrlKey: true, shiftKey: true, altKey: false, metaKey: false };
    expect(captureSymbolShortcut(event)).toBe("Ctrl+Shift+F11");
    expect(validateSymbolShortcut("Ctrl+Shift+F11", [])).toBeUndefined();
    expect(validateSymbolShortcut("Ctrl+C", [])).toBe("reserved");
    expect(validateSymbolShortcut("Alt+F4", [])).toBe("reserved");
    expect(validateSymbolShortcut("F11", [])).toBe("modifier");
    expect(validateSymbolShortcut("Ctrl+Enter", [])).toBe("unsupported");
    const custom = [{ text: "☃", visible: false, shortcut: "Ctrl+Shift+F11" }];
    expect(validateSymbolShortcut("Ctrl+Shift+F11", custom)).toBe("duplicate");
    expect(
      validateSymbolShortcut("Ctrl+Shift+F11", custom, symbolIdentity(custom[0]!)),
    ).toBeUndefined();
    expect(resolveSymbolShortcut({ version: 1, custom, recent: [] }, event)).toEqual({ text: "☃" });
  });
  test("sanitizes malformed entries and conflicting persisted shortcuts", () => {
    const result = parseSymbolPreferences(
      JSON.stringify({
        version: 1,
        custom: [
          { text: "A", visible: true, shortcut: "Ctrl+C" },
          { text: "B", visible: true, shortcut: "Ctrl+Shift+F11" },
          { text: "C", visible: false, shortcut: "Ctrl+Shift+F11" },
          { text: "A", visible: false },
          { text: "bad", visible: "yes" },
        ],
        recent: [{ text: "A" }, { text: "A" }, { text: "\ud800" }],
      }),
    );
    expect(result.custom).toEqual([
      { text: "A", visible: true },
      { text: "B", visible: true, shortcut: "Ctrl+Shift+F11" },
      { text: "C", visible: false },
    ]);
    expect(result.recent).toEqual([{ text: "A" }]);
  });
});
describe("symbol codes and navigation", () => {
  test("keeps measured space values and names distinct from standard Em/En spaces", () => {
    expect(SPECIAL_SYMBOLS.slice(0, 15).map((item) => item.text.codePointAt(0))).toEqual([
      8212, 8211, 12288, 32, 160, 169, 174, 8482, 167, 182, 8230, 8216, 8217, 8220, 8221,
    ]);
    expect(SPECIAL_SYMBOLS.slice(15).map((item) => item.text)).toEqual(["\u2003", "\u2002"]);
  });
  test("does not apply unverified CP1252 mapping or accept invalid code input", () => {
    expect(parseDialogCode("233", "latin1-decimal")).toBe(233);
    expect(parseDialogCode("128", "latin1-decimal")).toBe(128);
    expect(parseDialogCode("256", "latin1-decimal")).toBeUndefined();
    expect(parseDialogCode("U+1F600", "unicode-hex")).toBe(0x1f600);
    for (const input of ["D800", "110000", "oops", ""])
      expect(parseDialogCode(input, "unicode-hex")).toBeUndefined();
  });
  test("navigates row, page and document boundaries", () => {
    expect(navigateSymbolGrid(20, 1000, 17, 6, "ArrowDown", false)).toBe(37);
    expect(navigateSymbolGrid(20, 1000, 17, 6, "Home", false)).toBe(17);
    expect(navigateSymbolGrid(20, 1000, 17, 6, "End", false)).toBe(33);
    expect(navigateSymbolGrid(20, 1000, 17, 6, "PageDown", false)).toBe(122);
    expect(navigateSymbolGrid(20, 1000, 17, 6, "End", true)).toBe(999);
    expect(navigateSymbolGrid(0, 1000, 17, 6, "ArrowLeft", false)).toBe(0);
    expect(navigateSymbolGrid(0, 0, 17, 6, "Home", true)).toBe(-1);
  });
});
