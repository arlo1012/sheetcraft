import { describe, expect, test } from "vitest";
import { useCellEditSession } from "../../../shared/cell-editing/useCellEditSession";

const firstTarget = { sheetId: "sheet-a", address: { row: 2, column: 3 } };

describe("useCellEditSession", () => {
  test("transfers a same-owner session between surfaces without changing its draft or caret", () => {
    const session = useCellEditSession({ onCommit: () => undefined });
    session.begin({ ...firstTarget, input: "before" }, { surface: "grid", mode: "append" });
    session.setDraft("after");
    session.setSelection(1, 4, "forward");

    expect(
      session.begin(
        { ...firstTarget, input: "ignored" },
        { surface: "formula-bar", mode: "replace" },
      ),
    ).toBe(true);
    expect(session.state).toMatchObject({
      active: true,
      surface: "formula-bar",
      source: "before",
      draft: "after",
      selection: { start: 1, end: 4, direction: "forward" },
      mode: "edit",
    });
  });

  test("rejects a different owner until the caller explicitly finishes", () => {
    const session = useCellEditSession({ onCommit: () => undefined });
    session.begin({ ...firstTarget, input: "one" }, { surface: "grid", mode: "append" });

    expect(
      session.begin(
        { sheetId: "sheet-b", address: { row: 2, column: 3 }, input: "two" },
        { surface: "formula-bar", mode: "append" },
      ),
    ).toBe(false);
    expect(session.state.owner).toEqual(firstTarget);
    expect(session.state.draft).toBe("one");
  });

  test("keeps independent sessions isolated", () => {
    const first = useCellEditSession({ onCommit: () => undefined });
    const second = useCellEditSession({ onCommit: () => undefined });
    first.begin({ ...firstTarget, input: "first" }, { surface: "grid", mode: "append" });

    expect(first.state.active).toBe(true);
    expect(second.state.active).toBe(false);
    expect(second.hasPendingEdit()).toBe(false);
  });

  test("flushes each changed draft once, snapshots the owner, and finish closes the session", () => {
    const commits: unknown[] = [];
    const session = useCellEditSession({
      onCommit: (payload) => {
        commits.push(payload);
      },
    });
    const context = { ...firstTarget, input: "old" };
    session.begin(context, { surface: "grid", mode: "append" });
    context.address.row = 99;
    session.setDraft("new");

    expect(session.flush()).toBe(true);
    expect(session.flush()).toBe(true);
    expect(commits).toEqual([{ sheetId: "sheet-a", address: { row: 2, column: 3 }, input: "new" }]);
    expect(session.hasPendingEdit()).toBe(false);
    expect(session.finish()).toBe(true);
    expect(session.state.active).toBe(false);
  });

  test("clamps selection and completes a formula while closing", () => {
    const commits: unknown[] = [];
    const session = useCellEditSession({
      onCommit: (payload) => {
        commits.push(payload);
      },
    });
    session.begin(
      { ...firstTarget, input: "" },
      { surface: "formula-bar", mode: "replace", initialValue: "=SUM(A1" },
    );
    session.setSelection(-4, 100, "backward");

    expect(session.state.selection).toEqual({ start: 0, end: 7, direction: "backward" });
    expect(session.finish({ complete: true })).toBe(true);
    expect(commits).toEqual([{ ...firstTarget, input: "=SUM(A1)" }]);
    expect(session.state.active).toBe(false);
  });

  test("blocks flush during IME composition, then accepts its result", () => {
    const commits: unknown[] = [];
    const session = useCellEditSession({
      onCommit: (payload) => {
        commits.push(payload);
      },
    });
    session.begin({ ...firstTarget, input: "" }, { surface: "grid", mode: "replace" });
    session.startComposition();

    expect(session.flush({ end: true })).toBe(false);
    expect(session.state.active).toBe(true);
    session.endComposition("input");
    expect(session.finish()).toBe(true);
    expect(commits).toEqual([{ ...firstTarget, input: "input" }]);
  });

  test("retains an invalid draft and its owner until the commit is accepted", () => {
    let accept = false;
    const session = useCellEditSession({ onCommit: () => accept });
    session.begin(
      { sheetId: "sheet-a", address: { row: 0, column: 0 }, input: "valid" },
      { surface: "grid", mode: "append" },
    );
    session.setDraft("invalid");

    expect(session.finish()).toBe(false);
    expect(session.state).toMatchObject({
      active: true,
      source: "valid",
      draft: "invalid",
      owner: { sheetId: "sheet-a", address: { row: 0, column: 0 } },
    });
    expect(session.hasPendingEdit()).toBe(true);
    accept = true;
    expect(session.finish()).toBe(true);
    expect(session.state.active).toBe(false);
  });

  test("forwards warning confirmation only for that finish attempt", () => {
    const commits: unknown[] = [];
    const session = useCellEditSession({
      onCommit: (payload) => {
        commits.push(payload);
      },
    });

    session.begin({ ...firstTarget, input: "old" }, { surface: "grid", mode: "append" });
    session.setDraft("confirmed");
    expect(session.finish({ confirmPendingWarning: true })).toBe(true);

    session.begin({ ...firstTarget, input: "old" }, { surface: "grid", mode: "append" });
    session.setDraft("ordinary");
    expect(session.finish()).toBe(true);

    expect(commits).toEqual([
      { ...firstTarget, input: "confirmed", confirmPendingWarning: true },
      { ...firstTarget, input: "ordinary" },
    ]);
  });

  test("cancel clears an uncommitted edit", () => {
    const commits: unknown[] = [];
    const session = useCellEditSession({
      onCommit: (payload) => {
        commits.push(payload);
      },
    });
    session.begin({ ...firstTarget, input: "before" }, { surface: "grid", mode: "append" });
    session.setDraft("discard me");

    session.cancel();
    expect(commits).toEqual([]);
    expect(session.state).toMatchObject({ active: false, owner: null, draft: "", source: "" });
  });
});
