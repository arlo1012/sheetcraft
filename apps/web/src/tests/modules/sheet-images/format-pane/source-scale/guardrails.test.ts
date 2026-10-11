import { describe, expect, test } from "vitest";
import { undoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { PictureFormatIntent } from "../../../../../modules/sheet-images/picture-format-pane-model";
import type { PictureIntrinsicSize } from "../../../../../modules/sheet-images/usePictureIntrinsicSize";
import {
  intrinsicSize,
  ownerKinds,
  selectedNode,
  sourceOwnerFixture,
  sourceState,
  type SourceFixture,
} from "./owner-fixture";

function checkpoint(f: SourceFixture) {
  return {
    workbook: serializeWorkbook(f.session.workbook),
    snapshot: f.pane.snapshot.value,
    undo: [...f.session.history.undoStack],
    redo: [...f.session.history.redoStack],
  };
}
function expectUnchanged(f: SourceFixture, before: ReturnType<typeof checkpoint>) {
  expect(serializeWorkbook(f.session.workbook)).toEqual(before.workbook);
  expect(f.pane.snapshot.value).toEqual(before.snapshot);
  expect(f.session.history.undoStack).toEqual(before.undo);
  expect(f.session.history.redoStack).toEqual(before.redo);
}

describe("source Scale and Reset Size owner guardrails", () => {
  test.each(["refused", "thrown"] as const)(
    "%s Core acceptance retains the exact snapshot, document and existing redo history",
    (failure) => {
      const f = sourceOwnerFixture();
      expect(f.pane.onIntent(f.field("scaleWidthPercent", 75))).toBe(true);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(f.session.history.redoStack).toHaveLength(1);
      f.execute.mockClear();
      if (failure === "refused") f.refuse();
      else f.throw();
      const before = checkpoint(f);
      expect(f.pane.onIntent(f.field("scaleWidthPercent", 125))).toBe(false);
      expectUnchanged(f, before);
      expect(f.pane.onIntent(f.reset("reset-size"))).toBe(false);
      expectUnchanged(f, before);
      expect(f.execute).toHaveBeenCalledTimes(2);
    },
  );

  test.each(ownerKinds)(
    "%s scale over the actual frame budget is atomic and preserves the owner snapshot",
    (kind) => {
      const f = sourceOwnerFixture(kind),
        before = checkpoint(f);
      expect(f.pane.onIntent(f.field("scaleWidthPercent", 1_000_000))).toBe(false);
      expectUnchanged(f, before);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test.each([0, -1, Number.NaN, Infinity, -Infinity, "125", null, [], {}])(
    "malformed Scale value %s is rejected without coercion or history",
    (value) => {
      const f = sourceOwnerFixture(),
        before = checkpoint(f),
        intent = f.field("scaleWidthPercent", 125);
      expect(f.pane.onIntent({ ...intent, value } as unknown as PictureFormatIntent)).toBe(false);
      expectUnchanged(f, before);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test.each([
    undefined,
    intrinsicSize("different-asset", 360, 320),
    intrinsicSize("asset", 0, 320),
    intrinsicSize("asset", -1, 320),
    intrinsicSize("asset", 0.5, 320),
    intrinsicSize("asset", Number.NaN, 320),
    intrinsicSize("asset", Infinity, 320),
    intrinsicSize("asset", 16_385, 1),
    intrinsicSize("asset", 8_192, 8_192),
    intrinsicSize("asset", 360, 320, "https://example.test/source.png"),
    { assetId: "asset", width: 360, height: 320 } as PictureIntrinsicSize,
  ])(
    "missing or invalid intrinsic source %j disables original-size edits without losing real fields",
    (intrinsic) => {
      const f = sourceOwnerFixture();
      f.intrinsic.value = intrinsic;
      const before = checkpoint(f),
        snapshot = f.pane.snapshot.value!;
      expect(snapshot).not.toBeNull();
      expect(snapshot.values).toMatchObject({ sourceWidthPt: 135, sourceHeightPt: 120 });
      expect(snapshot.values).not.toHaveProperty("scaleWidthPercent");
      expect(snapshot.values).not.toHaveProperty("scaleHeightPercent");
      expect(snapshot).not.toHaveProperty("originalSizePt");
      for (const field of ["scaleWidthPercent", "scaleHeightPercent"] as const) {
        expect(f.pane.capabilities.value.fields[field]).toMatchObject({ enabled: false });
        expect(f.pane.capabilities.value.fields[field]?.reason).toBeTruthy();
      }
      expect(f.pane.capabilities.value.resets!["reset-size"]?.enabled).toBe(false);
      expect(f.pane.onIntent(f.field("scaleWidthPercent", 125))).toBe(false);
      expect(f.pane.onIntent(f.reset("reset-size"))).toBe(false);
      expectUnchanged(f, before);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("an actual natural side above the manual frame budget still displays its scale but disables Reset Size", () => {
    const f = sourceOwnerFixture();
    f.intrinsic.value = intrinsicSize("asset", 10_001, 320);
    const before = checkpoint(f);
    expect(f.pane.snapshot.value!.originalSizePt).toEqual({ width: 7_500.75, height: 240 });
    expect(f.pane.capabilities.value.fields.scaleWidthPercent?.enabled).toBe(true);
    expect(f.pane.capabilities.value.resets!["reset-size"]).toMatchObject({ enabled: false });
    expect(f.pane.capabilities.value.resets!["reset-size"]?.reason).toBeTruthy();
    expect(f.pane.onIntent(f.reset("reset-size"))).toBe(false);
    expectUnchanged(f, before);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("current-extent relative OFF scaling works with no intrinsic source while Reset Size stays disabled", () => {
    const f = sourceOwnerFixture(),
      old = sourceState(f);
    f.intrinsic.value = undefined;
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    expect(f.pane.snapshot.value!.values).toMatchObject({
      scaleWidthPercent: 100,
      scaleHeightPercent: 100,
    });
    expect(f.pane.onIntent(f.field("scaleWidthPercent", 125))).toBe(true);
    expect(sourceState(f).layout.rect.width).toBeCloseTo(old.layout.rect.width * 1.25);
    expect(f.pane.capabilities.value.resets!["reset-size"]?.enabled).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
  });

  test.each([
    "source-url",
    "source-dimensions",
    "asset",
    "selection",
    "path",
    "revision",
    "generation",
  ] as const)(
    "%s boundary invalidates captured Scale and Reset Size callbacks even after returning",
    (boundary) => {
      const f = sourceOwnerFixture(boundary === "path" ? "nested-leaf" : "framed"),
        scale = f.field("scaleWidthPercent", 125),
        reset = f.reset("reset-size"),
        originalIntrinsic = f.intrinsic.value!;
      if (boundary === "source-url") {
        f.intrinsic.value = { ...originalIntrinsic, url: "blob:new-source-generation" };
        f.intrinsic.value = originalIntrinsic;
      } else if (boundary === "source-dimensions") {
        f.intrinsic.value = { ...originalIntrinsic, width: originalIntrinsic.width + 1 };
        f.intrinsic.value = originalIntrinsic;
      } else if (boundary === "asset") {
        const node = selectedNode(f),
          assetId = node.assetId;
        node.assetId = "replacement-asset";
        f.revision.value++;
        node.assetId = assetId;
        f.revision.value++;
      } else if (boundary === "selection") {
        f.selectedIds.value = ["legacy"];
        f.selectedIds.value = ["framed"];
      } else if (boundary === "path") {
        const path = f.selectedPath.value;
        f.selectedPath.value = ["owned-group", "branch"];
        f.selectedPath.value = path;
      } else if (boundary === "revision") {
        f.revision.value++;
        f.revision.value--;
      } else {
        f.generation.value++;
        f.generation.value--;
      }
      const before = checkpoint(f);
      expect(f.pane.onIntent(scale)).toBe(false);
      expect(f.pane.onIntent(reset)).toBe(false);
      expectUnchanged(f, before);
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("an accepted Scale revision makes an older Reset Size callback stale without disturbing the accepted snapshot", () => {
    const f = sourceOwnerFixture(),
      reset = f.reset("reset-size");
    expect(f.pane.onIntent(f.field("scaleHeightPercent", 125))).toBe(true);
    const before = checkpoint(f);
    expect(f.pane.onIntent(reset)).toBe(false);
    expectUnchanged(f, before);
    expect(f.execute).toHaveBeenCalledOnce();
  });

  describe.each(["scale", "reset-size"] as const)("reentrant %s acceptance", (operation) => {
    test.each([
      "source-refresh",
      "source-ABA",
      "same-reference-size",
      "same-reference-url",
      "pane-reopen",
    ] as const)("%s does not acknowledge an expired source/owner lease", (boundary) => {
      const f = sourceOwnerFixture(),
        intent = operation === "scale" ? f.field("scaleWidthPercent", 125) : f.reset("reset-size"),
        sessionId = f.pane.snapshot.value!.owner.sessionId,
        originalIntrinsic = f.intrinsic.value!,
        execute = f.execute.getMockImplementation()!;
      f.execute.mockImplementationOnce((forest) => {
        if (boundary === "source-refresh" || boundary === "source-ABA") {
          f.intrinsic.value = { ...originalIntrinsic, url: "blob:during-acceptance" };
          if (boundary === "source-ABA") f.intrinsic.value = originalIntrinsic;
        } else if (boundary === "same-reference-size") {
          Object.assign(originalIntrinsic, { width: originalIntrinsic.width + 1 });
        } else if (boundary === "same-reference-url") {
          Object.assign(originalIntrinsic, { url: "blob:during-acceptance" });
        } else {
          f.open.value = false;
          f.open.value = true;
        }
        return execute(forest);
      });
      expect(f.pane.onIntent(intent)).toBe(true);
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.pane.snapshot.value).not.toBeNull();
      expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(sessionId);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
      const before = checkpoint(f);
      expect(f.pane.onIntent(intent)).toBe(false);
      expectUnchanged(f, before);
      expect(f.execute).toHaveBeenCalledOnce();
    });
  });

  test("pane close/reopen invalidates reentrant current-extent Scale even when no intrinsic size exists", () => {
    const f = sourceOwnerFixture();
    f.intrinsic.value = undefined;
    expect(f.pane.onIntent(f.field("relativeToOriginalSize", false))).toBe(true);
    const intent = f.field("scaleWidthPercent", 125),
      sessionId = intent.owner.sessionId,
      execute = f.execute.getMockImplementation()!;
    f.execute.mockImplementationOnce((forest) => {
      f.open.value = false;
      f.open.value = true;
      return execute(forest);
    });
    expect(f.pane.onIntent(intent)).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(sessionId);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
    expect(f.pane.snapshot.value!.values.relativeToOriginalSize).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
  });
});
