import { describe, expect, test } from "vitest";
import {
  useCellEditSession,
  type CellEditCommit,
} from "../../../shared/cell-editing/useCellEditSession";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSetCellContentCommand } from "@sheetcraft/core/commands";
import {
  getActiveSheet,
  getCellContent,
  setCellContent,
  setCellStyle,
} from "@sheetcraft/core/workbook";
import { parseCellContent } from "@sheetcraft/core/input";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { applyInputFontRuns } from "../../../shared/cell-editing/input-font-runs";

const target = { sheetId: "a", address: { row: 0, column: 0 } };
function fixture() {
  const commits: CellEditCommit[] = [];
  let accepted = true;
  const session = useCellEditSession({
    onCommit: (commit) => {
      commits.push(commit);
      return accepted;
    },
  });
  session.begin(
    {
      ...target,
      input: "aΩb",
      content: {
        kind: "literal",
        value: "aΩb",
        fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }],
      },
    },
    { surface: "grid", mode: "append" },
  );
  return {
    session,
    commits,
    reject: () => {
      accepted = false;
    },
  };
}

describe("font-only cell edit sessions", () => {
  test("symbol font stays on its own interval while continued typing retains the base font", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin({ ...target, input: "ab" }, { surface: "grid", mode: "append" });
    session.setCaret(1);
    session.replaceSelection("Ω", "Symbol", {
      preserveLiteral: true,
      preserveTypingFont: true,
    });
    session.activateSurface("grid");
    session.setCaret(2);
    session.prepareInput(2, 2, "insertText");
    session.setDraft("aΩxb");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: "Symbol" }]);
    session.setCaret(3);
    session.prepareInput(3, 3, "insertText");
    session.setDraft("aΩxyb");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: "Symbol" }]);
  });

  test("successive symbols keep their chosen fonts and restore the original run for typing", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin(
      {
        ...target,
        input: "ab",
        content: {
          kind: "literal",
          value: "ab",
          fontRuns: [{ start: 0, end: 2, fontFamily: "Existing" }],
        },
      },
      { surface: "formula-bar", mode: "append" },
    );
    session.setCaret(1);
    session.replaceSelection("Ω", "First", { preserveTypingFont: true });
    session.replaceSelection("δ", "Second", { preserveTypingFont: true });
    session.prepareInput(3, 3, "insertText");
    session.setDraft("aΩδxb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 0, end: 1, fontFamily: "Existing" },
      { start: 1, end: 2, fontFamily: "First" },
      { start: 2, end: 3, fontFamily: "Second" },
      { start: 3, end: 5, fontFamily: "Existing" },
    ]);
  });

  test.each(["New", undefined])(
    "symbol font %j restores the selected range's original typing affinity",
    (fontFamily) => {
      const { session } = fixture();
      session.setSelection(1, 2, "backward");
      session.replaceSelection("δ", fontFamily, { preserveTypingFont: true });
      session.prepareInput(2, 2, "insertText");
      session.setDraft("aδxb");
      expect(session.state.draftFontRuns).toEqual([
        ...(fontFamily ? [{ start: 1, end: 2, fontFamily }] : []),
        { start: 2, end: 3, fontFamily: "Noto Sans Math" },
      ]);
    },
  );

  test("symbol typing context survives atomic IME updates and draft undo/redo", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin({ ...target, input: "ab" }, { surface: "grid", mode: "append" });
    session.setCaret(1);
    session.replaceSelection("Ω", "Symbol", { preserveTypingFont: true });
    session.startComposition();
    session.setDraft("aΩzhōngb");
    session.setCaret(7);
    session.setDraft("aΩ中b");
    session.setCaret(3);
    session.endComposition("aΩ中b");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: "Symbol" }]);
    expect(session.undoDraft()).toBe(true);
    expect(session.state.draft).toBe("aΩb");
    expect(session.state.selection).toEqual({ start: 2, end: 2, direction: "none" });
    expect(session.redoDraft()).toBe(true);
    session.prepareInput(3, 3, "insertText");
    session.setDraft("aΩ中xb");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: "Symbol" }]);
    expect(session.undoDraft()).toBe(true);
    expect(session.undoDraft()).toBe(true);
    session.prepareInput(2, 2, "insertText");
    session.setDraft("aΩyb");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: "Symbol" }]);
  });

  test("redoing a symbol restores its saved typing context", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin({ ...target, input: "ab" }, { surface: "grid", mode: "append" });
    session.setCaret(1);
    session.replaceSelection("Ω", "Symbol", { preserveTypingFont: true });
    expect(session.undoDraft()).toBe(true);
    expect(session.state.draft).toBe("ab");
    expect(session.redoDraft()).toBe(true);
    session.prepareInput(2, 2, "insertText");
    session.setDraft("aΩxb");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: "Symbol" }]);
  });

  test.each(["deleteContentBackward", "deleteContentForward"])(
    "native %s keeps symbol typing context, including its draft undo/redo",
    (inputType) => {
      const session = useCellEditSession({ onCommit: () => true });
      session.begin({ ...target, input: "ab" }, { surface: "grid", mode: "append" });
      session.setCaret(1);
      session.replaceSelection("Ω", "Symbol", { preserveTypingFont: true });
      const backward = inputType === "deleteContentBackward";
      if (backward) {
        session.prepareInput(2, 2, "insertText");
        session.setDraft("aΩxb");
      }
      session.prepareInput(backward ? 3 : 2, backward ? 3 : 2, inputType);
      session.setDraft(backward ? "aΩb" : "aΩ");
      expect(session.undoDraft()).toBe(true);
      expect(session.state.draft).toBe(backward ? "aΩxb" : "aΩb");
      expect(session.state.selection).toEqual({
        start: backward ? 3 : 2,
        end: backward ? 3 : 2,
        direction: "none",
      });
      expect(session.redoDraft()).toBe(true);
      session.prepareInput(2, 2, "insertText");
      session.setDraft(backward ? "aΩyb" : "aΩy");
      expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 2, fontFamily: "Symbol" }]);
    },
  );

  test("native backspace followed by IME keeps the restored existing typing font", () => {
    const { session } = fixture();
    session.setSelection(1, 2);
    session.replaceSelection("δ", "Symbol", { preserveTypingFont: true });
    session.prepareInput(2, 2, "insertText");
    session.setDraft("aδxb");
    session.setCaret(3);
    session.prepareInput(3, 3, "deleteContentBackward");
    session.setDraft("aδb");
    session.setCaret(2);
    session.startComposition();
    session.setDraft("aδzhōngb");
    session.setDraft("aδ中b");
    session.endComposition("aδ中b");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Symbol" },
      { start: 2, end: 3, fontFamily: "Noto Sans Math" },
    ]);
  });

  test.each(["caret", "range", "surface", "begin-surface"])(
    "changing %s clears temporary symbol affinity and restores ordinary run affinity",
    (change) => {
      const session = useCellEditSession({ onCommit: () => true });
      session.begin({ ...target, input: "ab" }, { surface: "grid", mode: "append" });
      session.setCaret(1);
      session.replaceSelection("Ω", "Symbol", { preserveTypingFont: true });
      if (change === "caret") {
        session.setCaret(0);
        session.setCaret(2);
      } else if (change === "range") {
        session.setSelection(1, 2);
        session.setCaret(2);
      } else if (change === "surface") session.activateSurface("formula-bar");
      else session.begin({ ...target, input: "ab" }, { surface: "formula-bar", mode: "append" });
      session.prepareInput(2, 2, "insertText");
      session.setDraft("aΩxb");
      expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 3, fontFamily: "Symbol" }]);
    },
  );

  test("symbol typing context is discarded by ordinary document paste and session cancellation", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin({ ...target, input: "ab" }, { surface: "grid", mode: "append" });
    session.setCaret(1);
    session.replaceSelection("Ω", "Symbol", { preserveTypingFont: true });
    session.markPasted();
    session.replaceSelectionDocument({
      text: "δ",
      fontRuns: [{ start: 0, end: 1, fontFamily: "Paste" }],
    });
    session.prepareInput(3, 3, "insertText");
    session.setDraft("aΩδxb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Symbol" },
      { start: 2, end: 4, fontFamily: "Paste" },
    ]);
    session.cancel();
    session.begin(
      {
        ...target,
        input: "aΩb",
        content: {
          kind: "literal",
          value: "aΩb",
          fontRuns: [{ start: 1, end: 2, fontFamily: "Symbol" }],
        },
      },
      { surface: "grid", mode: "append" },
    );
    session.prepareInput(2, 2, "insertText");
    session.setDraft("aΩxb");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 3, fontFamily: "Symbol" }]);
  });

  test("symbol affinity follows literal projection offsets without styling its escape token", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin(
      { ...target, input: "'12", content: { kind: "literal", value: "12" } },
      { surface: "grid", mode: "append" },
    );
    session.setCaret(3);
    session.replaceSelection("3", "Symbol", { preserveLiteral: true, preserveTypingFont: true });
    session.prepareInput(4, 4, "insertText");
    session.setDraft("'1234");
    expect(session.state.draftFontRuns).toEqual([{ start: 3, end: 4, fontFamily: "Symbol" }]);
  });

  test.each(["0", "1", "=", "=A1", "TRUE", "FALSE", "#REF!", "#N/A", "+3", "'", "''", "'abc"])(
    "symbol literal %j keeps its font and scalar text through one escape transaction",
    (text) => {
      const commits: CellEditCommit[] = [];
      const session = useCellEditSession({
        onCommit: (commit) => {
          commits.push(commit);
          return true;
        },
      });
      session.begin({ ...target, input: "" }, { surface: "grid", mode: "append" });
      session.replaceSelection(text, "Symbol", { preserveLiteral: true });
      expect(session.state.draft).toBe(`'${text}`);
      expect(session.state.draftFontRuns).toEqual([
        { start: 1, end: text.length + 1, fontFamily: "Symbol" },
      ]);
      expect(session.state.selection).toEqual({
        start: text.length + 1,
        end: text.length + 1,
        direction: "none",
      });
      expect(session.undoDraft()).toBe(true);
      expect(session.state.draft).toBe("");
      expect(session.undoDraft()).toBe(false);
      expect(session.redoDraft()).toBe(true);
      expect(session.finish()).toBe(true);
      const commit = commits[0]!;
      expect(
        applyInputFontRuns(commit.input, commit.inputFontRuns, parseCellContent(commit.input)),
      ).toEqual({
        kind: "literal",
        value: text,
        fontRuns: [{ start: 0, end: text.length, fontFamily: "Symbol" }],
      });
    },
  );

  test.each(["1", "=", "TRUE"])(
    "fontless symbol %j can explicitly preserve literal semantics",
    (text) => {
      const session = useCellEditSession({ onCommit: () => true });
      session.begin({ ...target, input: "" }, { surface: "grid", mode: "append" });
      session.replaceSelection(text, undefined, { preserveLiteral: true });
      expect(session.state.draft).toBe(`'${text}`);
      expect(session.state.draftFontRuns).toBeUndefined();
      expect(parseCellContent(session.state.draft)).toEqual({ kind: "literal", value: text });
    },
  );

  test("literal escape shifts both surviving and inserted fonts without splitting undo history", () => {
    const session = useCellEditSession({ onCommit: () => true });
    const fontRuns = [
      { start: 0, end: 2, fontFamily: "Existing" },
      { start: 2, end: 3, fontFamily: "Old" },
    ];
    session.begin(
      { ...target, input: "12Ω", content: { kind: "literal", value: "12Ω", fontRuns } },
      { surface: "formula-bar", mode: "append" },
    );
    session.setSelection(2, 3);
    session.replaceSelectionDocument(
      { text: "3", fontRuns: [{ start: 0, end: 1, fontFamily: "New" }] },
      { preserveLiteral: true },
    );
    expect(session.state.draft).toBe("'123");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 3, fontFamily: "Existing" },
      { start: 3, end: 4, fontFamily: "New" },
    ]);
    expect(session.state.selection).toEqual({ start: 4, end: 4, direction: "none" });
    expect(session.undoDraft()).toBe(true);
    expect(session.state.draft).toBe("12Ω");
    expect(session.state.draftFontRuns).toEqual(fontRuns);
    expect(session.undoDraft()).toBe(false);
  });

  test.each([
    {
      selection: [5, 5],
      insertion: "3",
      draft: "'00123",
      caret: 6,
      runs: [
        { start: 1, end: 5, fontFamily: "Existing" },
        { start: 5, end: 6, fontFamily: "New" },
      ],
    },
    {
      selection: [0, 1],
      insertion: "Ω",
      draft: "Ω0012",
      caret: 1,
      runs: [
        { start: 0, end: 1, fontFamily: "New" },
        { start: 1, end: 5, fontFamily: "Existing" },
      ],
    },
    {
      selection: [0, 0],
      insertion: "3",
      draft: "'30012",
      caret: 2,
      runs: [
        { start: 1, end: 2, fontFamily: "New" },
        { start: 2, end: 6, fontFamily: "Existing" },
      ],
    },
  ])(
    "existing numeric escape is projected rather than inserted as text: $draft",
    ({ selection, insertion, draft, caret, runs }) => {
      const session = useCellEditSession({ onCommit: () => true });
      const originalRuns = [{ start: 0, end: 4, fontFamily: "Existing" }];
      session.begin(
        {
          ...target,
          input: "'0012",
          content: { kind: "literal", value: "0012", fontRuns: originalRuns },
        },
        { surface: "grid", mode: "append" },
      );
      session.setSelection(selection[0]!, selection[1]!);
      session.replaceSelection(insertion, "New", { preserveLiteral: true });
      expect(session.state.draft).toBe(draft);
      expect(session.state.draftFontRuns).toEqual(runs);
      expect(session.state.selection).toEqual({ start: caret, end: caret, direction: "none" });
      expect(session.undoDraft()).toBe(true);
      expect(session.state.draft).toBe("'0012");
      expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 5, fontFamily: "Existing" }]);
      expect(session.undoDraft()).toBe(false);
    },
  );

  test("existing escaped formula-like literal keeps its literal text and canonical commit mapping", () => {
    const commits: CellEditCommit[] = [];
    const session = useCellEditSession({
      onCommit: (commit) => {
        commits.push(commit);
        return true;
      },
    });
    session.begin(
      {
        ...target,
        input: "'=A1",
        content: {
          kind: "literal",
          value: "=A1",
          fontRuns: [{ start: 0, end: 3, fontFamily: "Existing" }],
        },
      },
      { surface: "formula-bar", mode: "append" },
    );
    session.replaceSelection("'", "New", { preserveLiteral: true });
    expect(session.state.draft).toBe("'=A1'");
    expect(session.finish()).toBe(true);
    const commit = commits[0]!;
    expect(
      applyInputFontRuns(commit.input, commit.inputFontRuns, parseCellContent(commit.input)),
    ).toEqual({
      kind: "literal",
      value: "=A1'",
      fontRuns: [
        { start: 0, end: 3, fontFamily: "Existing" },
        { start: 3, end: 4, fontFamily: "New" },
      ],
    });
  });

  test("ordinary replacement keeps numeric/formula semantics without an explicit literal option", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin({ ...target, input: "" }, { surface: "grid", mode: "append" });
    session.replaceSelection("1");
    expect(session.state.draft).toBe("1");
    expect(parseCellContent(session.state.draft)).toEqual({ kind: "literal", value: 1 });
    session.setSelection(0, 1);
    session.replaceSelection("=A1");
    expect(session.state.draft).toBe("=A1");
    expect(session.state.draftFontRuns).toBeUndefined();
    expect(parseCellContent(session.state.draft)?.kind).toBe("formula");
  });

  test("document paste splices inherited gaps and fonts in one undoable, target-only transaction", () => {
    const { session, commits } = fixture();
    session.setSelection(1, 2, "backward");
    session.markPasted();
    session.replaceSelectionDocument({
      text: "x😀yΩ",
      fontRuns: [
        { start: 1, end: 3, fontFamily: "Emoji" },
        { start: 4, end: 5, fontFamily: "Noto Sans Symbols" },
      ],
    });
    expect(session.state.draft).toBe("ax😀yΩb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 2, end: 4, fontFamily: "Emoji" },
      { start: 5, end: 6, fontFamily: "Noto Sans Symbols" },
    ]);
    expect(session.state.selection).toEqual({ start: 6, end: 6, direction: "none" });
    expect(commits).toEqual([]);
    expect(session.undoDraft()).toBe(true);
    expect(session.state.draft).toBe("aΩb");
    expect(session.state.selection).toEqual({ start: 1, end: 2, direction: "backward" });
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
    ]);
    expect(session.undoDraft()).toBe(false);
    expect(session.redoDraft()).toBe(true);
    session.activateSurface("formula-bar");
    expect(session.finish()).toBe(true);
    expect(commits[0]).toMatchObject({ ...target, input: "ax😀yΩb", inputOrigin: "paste" });
  });

  test("plain document paste removes only selected overrides and does not inherit adjacent fonts", () => {
    const { session } = fixture();
    session.setCaret(2);
    session.replaceSelectionDocument({ text: "xx" });
    expect(session.state.draft).toBe("aΩxxb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
    ]);
    session.setSelection(1, 3);
    session.replaceSelectionDocument({ text: "plain" });
    expect(session.state.draft).toBe("aplainxb");
    expect(session.state.draftFontRuns).toBeUndefined();
  });

  test("new joined graphemes keep a collapsed document-paste caret", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin({ ...target, input: "🇧" }, { surface: "grid", mode: "append" });
    session.setCaret(0);
    session.replaceSelectionDocument({
      text: "🇦",
      fontRuns: [{ start: 0, end: 2, fontFamily: "Emoji" }],
    });
    expect(session.state.draft).toBe("🇦🇧");
    expect(session.state.selection).toEqual({ start: 4, end: 4, direction: "none" });
    expect(session.state.draftFontRuns).toEqual([{ start: 0, end: 2, fontFamily: "Emoji" }]);
  });

  test("formula paste and subsequent formula edits carry no runs; escaped literals retain them", () => {
    const { session, commits } = fixture();
    session.setSelection(0, 3);
    session.markPasted();
    session.replaceSelectionDocument({
      text: "=A1",
      fontRuns: [{ start: 0, end: 3, fontFamily: "Symbol" }],
    });
    expect(session.state.draftFontRuns).toBeUndefined();
    session.replaceSelection("Ω", "Noto Sans Math");
    expect(session.state.draftFontRuns).toBeUndefined();
    session.finish();
    expect(commits[0]).toEqual({ ...target, input: "=A1Ω", inputOrigin: "paste" });
    session.begin({ ...target, input: "" }, { surface: "formula-bar", mode: "append" });
    session.replaceSelectionDocument({
      text: "'=A1",
      fontRuns: [{ start: 1, end: 4, fontFamily: "Symbol" }],
    });
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 4, fontFamily: "Symbol" }]);
  });

  test("invalid document metadata fails before changing draft, selection, or history", () => {
    const { session } = fixture();
    session.setSelection(1, 2, "backward");
    expect(() =>
      session.replaceSelectionDocument({
        text: "😀",
        fontRuns: [{ start: 0, end: 1, fontFamily: "Bad" }],
      }),
    ).toThrow();
    expect(session.state.draft).toBe("aΩb");
    expect(session.state.selection).toEqual({ start: 1, end: 2, direction: "backward" });
    expect(session.undoDraft()).toBe(false);
  });

  test("document replacement is blocked during IME and after the session ends", () => {
    const { session } = fixture();
    session.startComposition();
    expect(session.replaceSelectionDocument({ text: "lost" })).toBe(false);
    expect(session.state.draft).toBe("aΩb");
    session.endComposition("aΩb");
    session.cancel();
    expect(session.replaceSelectionDocument({ text: "lost" })).toBe(false);
    expect(session.state.draft).toBe("");
  });

  test("protected formatCells=false rejects same-value font paste while preserving its draft", () => {
    const workbookSession = createWorkbookSession({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(workbookSession.workbook);
    const address = target.address;
    const original = {
      kind: "literal" as const,
      value: "aΩb",
      fontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Math" }],
    };
    setCellContent(sheet, address, original);
    setCellStyle(sheet, address, { unlocked: true });
    sheet.properties.protected = true;
    sheet.protection = { editableRanges: [] };
    const rejected: unknown[] = [];
    const session = useCellEditSession({
      onCommit: (commit) => {
        const content = applyInputFontRuns(
          commit.input,
          commit.inputFontRuns,
          parseCellContent(commit.input),
        );
        try {
          executeWorkbookCommand(
            workbookSession,
            createSetCellContentCommand(sheet.id, address, content),
          );
        } catch (error) {
          rejected.push(error);
          return false;
        }
        return true;
      },
    });
    session.begin(
      { sheetId: sheet.id, address, input: original.value, content: original },
      { surface: "grid", mode: "append" },
    );
    session.setSelection(1, 2);
    session.markPasted();
    session.replaceSelectionDocument({
      text: "Ω",
      fontRuns: [{ start: 0, end: 1, fontFamily: "Noto Sans Symbols" }],
    });
    expect(session.hasPendingEdit()).toBe(true);
    expect(session.finish()).toBe(false);
    expect(rejected).toHaveLength(1);
    expect(getCellContent(sheet, address)).toEqual(original);
    expect(session.state).toMatchObject({
      active: true,
      source: original.value,
      draft: original.value,
      sourceFontRuns: original.fontRuns,
      draftFontRuns: [{ start: 1, end: 2, fontFamily: "Noto Sans Symbols" }],
    });
    expect(session.undoDraft()).toBe(true);
    expect(session.state.draftFontRuns).toEqual(original.fontRuns);
  });

  test("continuous symbols alter only selected ranges and remain a draft", () => {
    const { session, commits } = fixture();
    session.setSelection(1, 2);
    session.replaceSelection("Ω", "Noto Sans Symbols");
    expect(session.hasPendingEdit()).toBe(true);
    expect(session.state.draft).toBe("aΩb");
    expect(commits).toEqual([]);
    session.replaceSelection("😀", "Noto Sans");
    expect(session.state.draft).toBe("aΩ😀b");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Symbols" },
      { start: 2, end: 4, fontFamily: "Noto Sans" },
    ]);
    expect(session.finish()).toBe(true);
    expect(commits[0]?.inputFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Symbols" },
      { start: 2, end: 4, fontFamily: "Noto Sans" },
    ]);
  });

  test("false keeps both source and rich draft; cancellation drops neither into history", () => {
    const { session, reject, commits } = fixture();
    const source = session.state.sourceFontRuns?.map((run) => ({ ...run }));
    session.setSelection(1, 2);
    session.replaceSelection("δ", "Noto Sans Symbols");
    reject();
    expect(session.finish()).toBe(false);
    expect(session.state.sourceFontRuns).toEqual(source);
    expect(session.state.draft).toBe("aδb");
    expect(session.state.draftFontRuns?.[0]?.fontFamily).toBe("Noto Sans Symbols");
    expect(commits).toHaveLength(1);
    session.cancel();
    expect(session.state.draftFontRuns).toBeUndefined();
  });

  test("beforeinput anchors repeated text and preserves an existing override", () => {
    const { session } = fixture();
    session.prepareInput(1, 2);
    session.setDraft("aΩΩb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 3, fontFamily: "Noto Sans Math" },
    ]);
  });

  test("plain paste replaces selected fonts and retains surrounding metadata", () => {
    const { session } = fixture();
    session.prepareInput(1, 2);
    session.markPasted();
    session.setDraft("axxb");
    expect(session.state.draftFontRuns).toBeUndefined();
  });

  test("paste origin stays sticky but does not flatten a later manual character font", () => {
    const { session, commits } = fixture();
    session.markPasted();
    session.prepareInput(0, 0, "insertFromPaste");
    session.setDraft("xaΩb");
    session.prepareInput(3, 3, "insertText");
    session.setDraft("xaΩδb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 2, end: 4, fontFamily: "Noto Sans Math" },
    ]);
    session.finish();
    expect(commits[0]?.inputOrigin).toBe("paste");
  });

  test("bad input/font projection never half-starts an owner session", () => {
    const session = useCellEditSession({ onCommit: () => true });
    expect(() =>
      session.begin(
        { ...target, input: "mismatch", content: { kind: "literal", value: "text" } },
        { surface: "grid", mode: "append" },
      ),
    ).toThrow();
    expect(session.state).toMatchObject({ active: false, owner: null, source: "", draft: "" });
  });

  test("word deletion targets the first repeated word without moving the other word's font", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin(
      {
        ...target,
        input: "word word",
        content: {
          kind: "literal",
          value: "word word",
          fontRuns: [
            { start: 0, end: 4, fontFamily: "First" },
            { start: 5, end: 9, fontFamily: "Second" },
          ],
        },
      },
      { surface: "grid", mode: "append" },
    );
    session.prepareInput(4, 4, "deleteWordBackward");
    session.setDraft(" word");
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 5, fontFamily: "Second" }]);
  });

  test("IME intermediate edits become one atomic text/font undo", () => {
    const { session } = fixture();
    session.setSelection(1, 2);
    session.startComposition();
    session.setDraft("azhōngb");
    session.setDraft("a中b");
    expect(session.finish()).toBe(false);
    session.endComposition("a中b");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
    ]);
    expect(session.undoDraft()).toBe(true);
    expect(session.state.draft).toBe("aΩb");
    expect(session.state.draftFontRuns).toEqual([
      { start: 1, end: 2, fontFamily: "Noto Sans Math" },
    ]);
    expect(session.undoDraft()).toBe(false);
    expect(session.redoDraft()).toBe(true);
    expect(session.state.draft).toBe("a中b");
  });

  test("escape projection stays on editor coordinates and does not style its apostrophe", () => {
    const session = useCellEditSession({ onCommit: () => true });
    session.begin(
      {
        ...target,
        input: "'123",
        content: {
          kind: "literal",
          value: "123",
          fontRuns: [{ start: 0, end: 3, fontFamily: "Noto Sans" }],
        },
      },
      { surface: "formula-bar", mode: "append" },
    );
    expect(session.state.draftFontRuns).toEqual([{ start: 1, end: 4, fontFamily: "Noto Sans" }]);
    session.setSelection(4, 4);
    session.replaceSelection("Ω", "Noto Sans Math");
    expect(session.state.draft).toBe("'123Ω");
  });

  test("selection cannot cut a supplementary scalar; owner generation changes on cancel", () => {
    const { session } = fixture();
    const generation = session.state.generation;
    session.setSelection(1, 2);
    session.replaceSelection("😀", "Noto Sans");
    session.setSelection(2, 2);
    expect(session.state.selection).toEqual({ start: 1, end: 3, direction: "none" });
    session.cancel();
    expect(session.state.generation).not.toBe(generation);
  });

  test.each([
    { original: "🇧", insertion: "🇦", at: 0, result: "🇦🇧", caret: 4 },
    { original: "👩👩", insertion: "\u200d", at: 2, result: "👩‍👩", caret: 5 },
  ])(
    "newly joined graphemes keep a collapsed post-insertion caret",
    ({ original, insertion, at, result, caret }) => {
      const session = useCellEditSession({ onCommit: () => true });
      session.begin({ ...target, input: original }, { surface: "grid", mode: "append" });
      session.setSelection(at, at);
      session.replaceSelection(insertion);
      expect(session.state.draft).toBe(result);
      expect(session.state.selection).toEqual({ start: caret, end: caret, direction: "none" });
      session.replaceSelection("Ω");
      expect(session.state.draft).toBe(`${result}Ω`);
    },
  );
});

describe("Text-format literal input context", () => {
  test.each([false, true])("deleting a projection escape respects asText=%s", (asText) => {
    const commits: CellEditCommit[] = [];
    const session = useCellEditSession({
      onCommit: (payload) => {
        commits.push(payload);
        return true;
      },
    });
    session.begin(
      {
        ...target,
        input: "'=A1Ω",
        asText,
        content: {
          kind: "literal",
          value: "=A1Ω",
          fontRuns: [{ start: 3, end: 4, fontFamily: "Noto Sans Math" }],
        },
      },
      { surface: "grid", mode: "append" },
    );
    session.prepareInput(0, 1, "deleteContentForward");
    session.setDraft("=A1Ω");
    expect(session.state.draftFontRuns).toEqual(
      asText ? [{ start: 3, end: 4, fontFamily: "Noto Sans Math" }] : undefined,
    );
    expect(session.finish()).toBe(true);
    const content = applyInputFontRuns(
      commits[0]!.input,
      commits[0]!.inputFontRuns,
      parseCellContent(commits[0]!.input, { asText }),
    );
    expect(content).toEqual(
      asText
        ? {
            kind: "literal",
            value: "=A1Ω",
            fontRuns: [{ start: 3, end: 4, fontFamily: "Noto Sans Math" }],
          }
        : { kind: "formula", formula: { source: "=A1Ω" } },
    );
  });
  test("Text-format completion never changes literal formula-looking text", () => {
    const commits: CellEditCommit[] = [];
    const session = useCellEditSession({
      onCommit: (payload) => {
        commits.push(payload);
        return true;
      },
    });
    session.begin(
      { ...target, input: "", content: null, asText: true },
      { surface: "grid", mode: "append" },
    );
    session.replaceSelection("=SUM(");
    expect(session.finish({ complete: true })).toBe(true);
    expect(commits[0]?.input).toBe("=SUM(");
    expect(session.state.asText).toBe(false);
  });
});
