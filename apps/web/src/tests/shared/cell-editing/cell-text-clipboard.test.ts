import { describe, expect, test, vi } from "vitest";
import {
  CELL_TEXT_CLIPBOARD_TYPE,
  MAX_CELL_TEXT_CLIPBOARD_LENGTH,
  MAX_CELL_TEXT_CLIPBOARD_PAYLOAD_LENGTH,
  MAX_CELL_TEXT_CLIPBOARD_RUNS,
  readCellTextClipboard,
  sliceCellTextClipboardDocument,
  writeCellTextClipboard,
} from "../../../shared/cell-editing/cell-text-clipboard";

const rich = { text: "aΩb", fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }] };
function clipboard() {
  const values = new Map<string, string>();
  return {
    values,
    get types() {
      return [...values.keys()];
    },
    getData: (type: string) => values.get(type) ?? "",
    setData: (type: string, text: string) => {
      values.set(type, text);
    },
  };
}
function readPayload(value: unknown, text = rich.text) {
  const data = clipboard();
  data.setData("text/plain", text);
  data.setData(CELL_TEXT_CLIPBOARD_TYPE, typeof value === "string" ? value : JSON.stringify(value));
  return readCellTextClipboard(data);
}

describe("bounded font-only editor clipboard", () => {
  test("writes only matching plain text and versioned font metadata", () => {
    const data = clipboard();
    expect(writeCellTextClipboard(data, rich)).toBe(true);
    expect(data.types).toEqual(["text/plain", CELL_TEXT_CLIPBOARD_TYPE]);
    expect(JSON.parse(data.getData(CELL_TEXT_CLIPBOARD_TYPE))).toEqual({ version: 1, ...rich });
    expect(readCellTextClipboard(data)).toEqual(rich);
  });

  test("maps whole graphemes with precise relative scalar font intervals and inherited gaps", () => {
    const source = {
      text: "a😀e\u0301👩‍👩b",
      fontRuns: [
        { start: 1, end: 3, fontFamily: "Emoji" },
        { start: 4, end: 5, fontFamily: "Mark" },
        { start: 5, end: 10, fontFamily: "Joined" },
      ],
    };
    const selection = sliceCellTextClipboardDocument(source, 2, 9);
    expect(selection).toEqual({
      start: 1,
      end: 10,
      text: "😀e\u0301👩‍👩",
      fontRuns: [
        { start: 0, end: 2, fontFamily: "Emoji" },
        { start: 3, end: 4, fontFamily: "Mark" },
        { start: 4, end: 9, fontFamily: "Joined" },
      ],
    });
    expect(sliceCellTextClipboardDocument(source, 3, 3)).toEqual({ start: 3, end: 3, text: "" });
    expect(source.fontRuns[0]?.start).toBe(1);
  });

  test.each([
    { version: 2, ...rich },
    { version: "1", ...rich },
    { version: 1, ...rich, text: "spoofed" },
    { version: 1, ...rich, html: "<script>bad</script>" },
    { version: 1, text: rich.text },
    { version: 1, ...rich, fontRuns: [{ start: 0, end: 4, fontFamily: "Bad" }] },
    { version: 1, ...rich, fontRuns: [{ start: 1, end: 2, fontFamily: "Bad", bold: true }] },
    { version: 1, ...rich, fontRuns: [{ start: 1, end: 2, fontFamily: "\nBad" }] },
    { version: 1, ...rich, fontRuns: [{ start: 1, end: 2, fontFamily: "" }] },
    {
      version: 1,
      ...rich,
      fontRuns: [
        { start: 1, end: 2, fontFamily: "Bad" },
        { start: 0, end: 1, fontFamily: "Bad" },
      ],
    },
    {
      version: 1,
      ...rich,
      fontRuns: [
        { start: 0, end: 2, fontFamily: "Bad" },
        { start: 1, end: 3, fontFamily: "Bad" },
      ],
    },
    "{malformed",
    "null",
    "[]",
  ])("untrusted or malformed metadata falls back to matching plain text %#", (value) => {
    expect(readPayload(value)).toEqual({ text: rich.text });
  });

  test("rejects a split supplementary scalar and metadata-only/HTML-only representations", () => {
    expect(
      readPayload(
        { version: 1, text: "😀", fontRuns: [{ start: 0, end: 1, fontFamily: "Bad" }] },
        "😀",
      ),
    ).toEqual({ text: "😀" });
    const data = clipboard();
    data.setData(CELL_TEXT_CLIPBOARD_TYPE, JSON.stringify({ version: 1, ...rich }));
    data.setData("text/html", "<b>bad</b>");
    const getData = vi.spyOn(data, "getData");
    expect(readCellTextClipboard(data)).toBeUndefined();
    expect(getData).not.toHaveBeenCalled();
  });

  test("rejects oversized text, run arrays, and payloads before accepting metadata", () => {
    const text = "x".repeat(MAX_CELL_TEXT_CLIPBOARD_LENGTH + 1);
    expect(readPayload({ version: 1, text, fontRuns: [] }, text)).toEqual({ text });
    const runsText = "x".repeat(MAX_CELL_TEXT_CLIPBOARD_RUNS + 1);
    const fontRuns = Array.from({ length: runsText.length }, (_, start) => ({
      start,
      end: start + 1,
      fontFamily: "A",
    }));
    expect(readPayload({ version: 1, text: runsText, fontRuns }, runsText)).toEqual({
      text: runsText,
    });
    expect(readPayload(" ".repeat(MAX_CELL_TEXT_CLIPBOARD_PAYLOAD_LENGTH + 1))).toEqual({
      text: rich.text,
    });
  });

  test("unreadable plain text is unavailable; unreadable metadata keeps plain text", () => {
    expect(readCellTextClipboard(null)).toBeUndefined();
    expect(
      readCellTextClipboard({
        types: ["text/plain"],
        getData: () => {
          throw new Error("denied");
        },
      }),
    ).toBeUndefined();
    expect(
      readCellTextClipboard({
        types: ["text/plain", CELL_TEXT_CLIPBOARD_TYPE],
        getData: (type) => {
          if (type === "text/plain") return rich.text;
          throw new Error("denied");
        },
      }),
    ).toEqual({ text: rich.text });
    expect(readCellTextClipboard({ types: ["text/plain"], getData: () => "" })).toBeUndefined();
  });

  test("failed plain or rich writes cannot authorize a rich cut", () => {
    expect(writeCellTextClipboard(null, rich)).toBe(false);
    expect(
      writeCellTextClipboard(
        {
          setData: () => {
            throw new Error("denied");
          },
        },
        rich,
      ),
    ).toBe(false);
    const setData = vi.fn((type: string) => {
      if (type === CELL_TEXT_CLIPBOARD_TYPE) throw new Error("unsupported");
    });
    expect(writeCellTextClipboard({ setData }, rich)).toBe(false);
    expect(setData).toHaveBeenCalledWith("text/plain", rich.text);
    expect(writeCellTextClipboard({ setData }, { text: "plain" })).toBe(true);
  });
});
