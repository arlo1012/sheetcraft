import { describe, expect, test, vi } from "vitest";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { isPictureGroup, type GroupedGroup } from "@sheetcraft/core/picture-group";
import {
  createOwnedPictureClipboardSession,
  OwnedPictureClipboardError,
} from "../../../../modules/sheet-images/owned-picture-clipboard";
import { fixture, translateRoots } from "./fixture";

describe("owned picture clipboard authority", () => {
  test.each(
    (["revision", "generation", "sheet-instance", "sheet-id", "metric-context"] as const).flatMap(
      (change) =>
        ["owned-group", "nested-leaf", "nested-group"].map((selectedId) => ({
          change,
          selectedId,
        })),
    ),
  )("stale $change rejects $selectedId Cut without consuming it", ({ change, selectedId }) => {
    const f = fixture();
    const captured = f.capture("cut", [selectedId]);
    const placeRoots = vi.fn(translateRoots);
    const input = {
      ...captured,
      sheet: f.sheet,
      revision: 7,
      ownerGeneration: 3,
      sourceMetrics: f.metrics,
      destinationMetrics: f.metrics,
      placeRoots,
    };
    if (change === "revision") input.revision += 1;
    if (change === "generation") input.ownerGeneration += 1;
    if (change === "sheet-instance") input.sheet = { ...f.sheet };
    if (change === "sheet-id") f.sheet.id = "renamed-sheet-id";
    if (change === "metric-context")
      input.sourceMetrics = input.destinationMetrics = createPictureSheetMetrics(f.sheet);
    expect(() => f.clipboard.planPaste(input)).toThrow(
      new OwnedPictureClipboardError("stale-owner"),
    );
    expect(placeRoots).not.toHaveBeenCalled();
    expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
    expect(f.clipboard.getCurrent()!.generation).toBe(captured.generation);
  });

  test.each(
    (
      [
        "hidden-source",
        "hidden-visibility",
        "child-path",
        "child-metadata",
        "child-geometry",
        "root-order",
        "unselected-root",
        "missing-root",
      ] as const
    ).flatMap((change) =>
      ["owned-group", "nested-leaf", "nested-group"].map((selectedId) => ({ change, selectedId })),
    ),
  )(
    "full captured $selectedId source forest catches $change edits even without revision change",
    ({ change, selectedId }) => {
      const f = fixture();
      const captured = f.capture("cut", [selectedId]);
      const group = f.sheet.floatingImages[1]!;
      if (!isPictureGroup(group)) throw new Error("Expected group.");
      const nested = group.members[1]! as GroupedGroup;
      const leaf = nested.members[0]!;
      if (leaf.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
      if (change === "hidden-source") leaf.frame.source.widthRatio = 2.5;
      if (change === "hidden-visibility") leaf.hidden = false;
      if (change === "child-path") {
        nested.members = [group.members[0]!];
        group.members[0] = leaf;
      }
      if (change === "child-metadata") leaf.altText = "Edited annotation";
      if (change === "child-geometry") nested.frame.angleDeg += 1;
      if (change === "root-order") f.sheet.floatingImages.reverse();
      if (change === "unselected-root")
        f.sheet.floatingImages[0]!.altText = "Edited unselected source";
      if (change === "missing-root") f.sheet.floatingImages.splice(1, 1);
      expect(() => f.paste()).toThrow(new OwnedPictureClipboardError("stale-owner"));
      expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
    },
  );

  test.each(["owned-group", "nested-leaf", "nested-group"])(
    "failed command retains $selectedId Cut, a successful fresh retry consumes it exactly once",
    (selectedId) => {
      const f = fixture();
      const before = structuredClone(f.sheet.floatingImages);
      const captured = f.capture("cut", [selectedId]);
      const rejected = f.paste();
      expect(f.clipboard.complete(rejected, false)).toBe(false);
      expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
      expect(f.sheet.floatingImages).toEqual(before);
      const accepted = f.paste();
      f.sheet.floatingImages = [...accepted.nextForest];
      expect(f.clipboard.complete(accepted, true)).toBe(true);
      expect(f.clipboard.complete(accepted, true)).toBe(false);
      expect(f.clipboard.getCurrent()).toBeUndefined();
    },
  );

  test("a throwing placement does not consume or mutate the exact pending tree", () => {
    const f = fixture();
    const captured = f.capture("cut");
    expect(() =>
      f.clipboard.planPaste({
        ...captured,
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        destinationMetrics: f.metrics,
        placeRoots: ({ roots }) => {
          const group = roots[0]!;
          if (!isPictureGroup(group)) throw new Error("Expected group.");
          group.members[0]!.altText = "Mutated callback input";
          throw new Error("Command preparation failed");
        },
      }),
    ).toThrow("Command preparation failed");
    expect(f.clipboard.getCurrent()).toEqual(captured);
    expect(f.paste().roots[0]!.altText).toBe(captured.roots[0]!.altText);
  });

  test("old async completion and clear cannot consume a newer pending capture", () => {
    const f = fixture();
    const old = f.capture("cut");
    const oldPlan = f.paste();
    const newer = f.capture("copy", ["nested-leaf"]);
    expect(f.clipboard.complete(oldPlan, true)).toBe(false);
    expect(f.clipboard.clear(old)).toBe(false);
    expect(f.clipboard.getCurrent()!.token).toBe(newer.token);
    expect(f.clipboard.getCurrent()!.generation).toBe(newer.generation);
  });

  test("clear requires a matching identity and only cancels that capture", () => {
    const f = fixture();
    const captured = f.capture("cut");
    expect(f.clipboard.clear(undefined as never)).toBe(false);
    expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
    expect(f.clipboard.clear(captured)).toBe(true);
    expect(f.clipboard.clear(captured)).toBe(false);
    expect(f.clipboard.getCurrent()).toBeUndefined();
  });

  test("a reentrant token factory cannot replace a newer capture with the older operation", () => {
    const f = fixture();
    let reenter = true;
    let token = 0;
    const owner = {
      sheet: f.sheet,
      revision: 7,
      ownerGeneration: 3,
      sourceMetrics: f.metrics,
      mode: "copy" as const,
    };
    const clipboard = createOwnedPictureClipboardSession({
      createId: () => "unused",
      createToken: () => {
        if (reenter) {
          reenter = false;
          clipboard.capture({ ...owner, selectedIds: ["legacy"] });
        }
        return `token-${++token}`;
      },
    });
    expect(() => clipboard.capture({ ...owner, selectedIds: ["owned-group"] })).toThrow(
      new OwnedPictureClipboardError("stale-session"),
    );
    expect(clipboard.getCurrent()!.roots.map((root) => root.id)).toEqual(["legacy"]);
    expect(clipboard.getCurrent()!.token).toBe("token-1");
  });

  test("generation guards stale callbacks even when a token factory repeats", () => {
    const f = fixture();
    const clipboard = createOwnedPictureClipboardSession({
      createId: () => "unused",
      createToken: () => "same-token",
    });
    const capture = () =>
      clipboard.capture({
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        mode: "cut",
        selectedIds: ["owned-group"],
      });
    const first = capture();
    const plan = clipboard.planPaste({
      ...first,
      sheet: f.sheet,
      revision: 7,
      ownerGeneration: 3,
      sourceMetrics: f.metrics,
      destinationMetrics: f.metrics,
      placeRoots: translateRoots,
    });
    const second = capture();
    expect(second.token).toBe(first.token);
    expect(second.generation).not.toBe(first.generation);
    expect(clipboard.complete(plan, true)).toBe(false);
    expect(clipboard.clear(first)).toBe(false);
    expect(clipboard.getCurrent()!.generation).toBe(second.generation);
  });

  test("structurally forged plans cannot clear a cut", () => {
    const f = fixture();
    const captured = f.capture("cut");
    const plan = f.paste();
    expect(f.clipboard.complete({ ...plan }, true)).toBe(false);
    expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
    expect(f.clipboard.complete(plan, true)).toBe(true);
  });

  test("reentrant placement cannot return a superseded command plan or clear the new clipboard", () => {
    const f = fixture();
    const captured = f.capture("cut");
    expect(() =>
      f.clipboard.planPaste({
        ...captured,
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        destinationMetrics: f.metrics,
        placeRoots: (input) => {
          f.capture("copy", ["legacy"]);
          return translateRoots(input);
        },
      }),
    ).toThrow(new OwnedPictureClipboardError("stale-session"));
    expect(f.clipboard.getCurrent()!.roots.map((root) => root.id)).toEqual(["legacy"]);
  });

  test("a destination change inside placement invalidates the prepared command input", () => {
    const f = fixture();
    const captured = f.capture("copy");
    expect(() =>
      f.clipboard.planPaste({
        ...captured,
        sheet: f.sheet,
        revision: 7,
        ownerGeneration: 3,
        sourceMetrics: f.metrics,
        destinationMetrics: f.metrics,
        placeRoots: (input) => {
          f.sheet.floatingImages[0]!.altText = "Newer command";
          return translateRoots(input);
        },
      }),
    ).toThrow(new OwnedPictureClipboardError("stale-owner"));
    expect(f.clipboard.getCurrent()!.token).toBe(captured.token);
  });

  test("mutating a returned plan cannot change the stored cut lease", () => {
    const f = fixture();
    const captured = f.capture("cut");
    const plan = f.paste();
    const group = plan.nextForest[1]!;
    if (!isPictureGroup(group)) throw new Error("Expected group.");
    group.members[0]!.altText = "Mutated plan";
    expect(f.clipboard.getCurrent()).toEqual(captured);
    expect(f.paste().nextForest[1]!.altText).toBe("Synthetic group");
  });
});
