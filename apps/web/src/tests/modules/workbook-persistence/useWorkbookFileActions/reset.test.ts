import { describe, expect, test } from "vitest";
import { mountFileActions } from "./fixture";

describe("blank document recovery confirmation", () => {
  test("requires confirmation and leaves the stored copy untouched on cancel", async () => {
    const fixture = mountFileActions();
    fixture.persistence.error.value = "invalid-snapshot";
    fixture.actions.requestReset();
    expect(fixture.actions.confirmation.value).toBe("reset");
    expect(fixture.persistence.resetDocument).not.toHaveBeenCalled();
    fixture.actions.cancel();
    expect(fixture.persistence.resetDocument).not.toHaveBeenCalled();
    expect(fixture.actions.confirmation.value).toBeUndefined();
    fixture.actions.requestReset();
    await fixture.actions.confirm();
    expect(fixture.persistence.resetDocument).toHaveBeenCalledOnce();
    expect(fixture.actions.feedback.value).toEqual({ key: "persistence.resetDone", error: false });
    fixture.wrapper.unmount();
  });

  test("does not offer discard for an unrelated storage error", () => {
    const fixture = mountFileActions();
    for (const error of ["unavailable", "quota", "conflict"] as const) {
      fixture.persistence.error.value = error;
      fixture.actions.requestReset();
      expect(fixture.actions.canReset.value).toBe(false);
      expect(fixture.actions.confirmation.value).toBeUndefined();
    }
    fixture.wrapper.unmount();
  });

  test("reports reset failure honestly and keeps the retry available", async () => {
    const fixture = mountFileActions();
    fixture.persistence.error.value = "invalid-record";
    fixture.persistence.resetDocument.mockImplementation(async () => {
      fixture.persistence.error.value = "quota";
      return false;
    });
    fixture.actions.requestReset();
    await fixture.actions.confirm();
    expect(fixture.actions.feedback.value).toEqual({ key: "persistence.resetFailed", error: true });
    expect(fixture.actions.canReset.value).toBe(true);
    fixture.actions.requestReset();
    expect(fixture.actions.confirmation.value).toBe("reset");
    fixture.wrapper.unmount();
  });
});
