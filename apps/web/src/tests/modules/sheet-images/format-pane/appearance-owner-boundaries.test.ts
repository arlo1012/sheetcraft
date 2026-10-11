import { describe, expect, test } from "vitest";
import { undoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { PictureFormatIntent } from "../../../../modules/sheet-images/picture-format-pane-model";
import { selectedNode } from "./source-scale/owner-fixture";
import {
  appearanceCheckpoint,
  appearanceOwnerFixture,
  expectAppearanceUnchanged,
} from "./appearance-owner-fixture";

describe("picture appearance owner acceptance and stale boundaries", () => {
  test.each(["refused", "thrown"] as const)(
    "%s appearance edits preserve owner, acknowledgement, document and existing redo history",
    (failure) => {
      const f = appearanceOwnerFixture("framed", {
        opacity: 0.8,
        border: { color: "#123456", width: 2 },
      });
      expect(f.pane.onIntent(f.field("shadowPreset", "hard"))).toBe(true);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      f.revision.value++;
      expect(f.session.history.redoStack).toHaveLength(1);
      f.execute.mockClear();
      if (failure === "refused") f.refuse();
      else f.throw();
      const before = appearanceCheckpoint(f);
      for (const intent of [
        f.reset(),
        f.field("lineMode", "none"),
        f.field("shadowPreset", "none"),
        f.field("lineColor", "#ABCDEF"),
        f.field("lineWidthPt", 2.25),
      ]) {
        expect(f.pane.onIntent(intent)).toBe(false);
        expectAppearanceUnchanged(f, before);
      }
      expect(f.execute).toHaveBeenCalledTimes(5);
    },
  );

  test("unsupported modes and malformed local color/width reject without coercion, acknowledgement or history", () => {
    const f = appearanceOwnerFixture("framed", {
      border: { color: "#123456", width: 2 },
      suppressThemeEffects: { outline: true },
    });
    const before = appearanceCheckpoint(f);
    const invalid: PictureFormatIntent[] = [
      f.field("lineMode", "gradient"),
      f.field("shadowPreset", "unknown-preset"),
      ...["red", "#fff", "", null, 12].map(
        (value) =>
          ({
            ...f.field("lineColor", "#ABCDEF"),
            value,
          }) as unknown as PictureFormatIntent,
      ),
      ...[-1, 15.01, NaN, Infinity, -Infinity, "2", null, false].map(
        (value) =>
          ({
            ...f.field("lineWidthPt", 2),
            value,
          }) as unknown as PictureFormatIntent,
      ),
    ];
    for (const intent of invalid) {
      expect(f.pane.onIntent(intent)).toBe(false);
      expectAppearanceUnchanged(f, before);
    }
    expect(f.execute).not.toHaveBeenCalled();
  });

  test.each(["busy", "protected", "group", "branch"] as const)(
    "%s owners cannot reset or edit picture appearance",
    (boundary) => {
      const f = appearanceOwnerFixture("nested-leaf");
      const stale = [f.reset(), f.field("lineMode", "none"), f.field("shadowPreset", "none")];
      if (boundary === "busy") f.busy.value = true;
      else if (boundary === "protected") {
        f.sheet.properties.protected = true;
        f.refreshTheme();
      } else
        f.selectedPath.value = boundary === "group" ? ["owned-group"] : ["owned-group", "branch"];
      const before = appearanceCheckpoint(f);
      expect(f.pane.capabilities.value.resets!["reset-picture"]?.enabled).toBe(false);
      expect(f.pane.capabilities.value.fields.lineMode?.enabled).toBe(false);
      expect(f.pane.capabilities.value.fields.shadowPreset?.enabled).toBe(false);
      for (const intent of [
        ...stale,
        f.reset(),
        f.field("lineMode", "solid"),
        f.field("shadowPreset", "hard"),
      ]) {
        expect(f.pane.onIntent(intent)).toBe(false);
        expectAppearanceUnchanged(f, before);
      }
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test.each(["replacement", "same-reference", "same-values", "ABA"] as const)(
    "%s theme effects invalidate old appearance owner callbacks without a picture edit",
    (boundary) => {
      const f = appearanceOwnerFixture();
      const old = [f.reset(), f.field("lineMode", "solid"), f.field("shadowPreset", "hard")];
      const sessionId = old[0]!.owner.sessionId;
      const effects = f.session.workbook.theme.effects!;
      if (boundary === "same-reference") {
        effects.shadow = "hard";
        f.refreshTheme();
      } else {
        f.session.workbook.theme.effects = {
          ...effects,
          outlineWidth: boundary === "same-values" ? effects.outlineWidth : 8,
        };
        f.refreshTheme();
        if (boundary === "ABA") {
          f.session.workbook.theme.effects = effects;
          f.refreshTheme();
        }
      }
      expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(sessionId);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
      const before = appearanceCheckpoint(f);
      for (const intent of old) {
        expect(f.pane.onIntent(intent)).toBe(false);
        expectAppearanceUnchanged(f, before);
      }
      expect(f.execute).not.toHaveBeenCalled();
    },
  );

  test("an accepted appearance revision makes captured Reset Picture stale while preserving its successful acknowledgement", () => {
    const f = appearanceOwnerFixture(),
      old = f.reset();
    expect(f.pane.onIntent(f.field("shadowPreset", "hard"))).toBe(true);
    const before = appearanceCheckpoint(f);
    expect(f.pane.onIntent(old)).toBe(false);
    expectAppearanceUnchanged(f, before);
    expect(f.execute).toHaveBeenCalledOnce();
  });

  test("unannounced selected-source replacement cannot apply old appearance to a fallback picture", () => {
    const f = appearanceOwnerFixture("nested-leaf"),
      old = f.reset();
    selectedNode(f).assetId = "external-replacement";
    const before = appearanceCheckpoint(f);
    expect(f.pane.onIntent(old)).toBe(false);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before.workbook);
    expect(f.session.history.undoStack).toEqual(before.undo);
    expect(f.session.history.redoStack).toEqual(before.redo);
    expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(old.owner.sessionId);
    expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
  });

  describe.each(["reset", "line", "shadow"] as const)("reentrant %s acceptance", (operation) => {
    test.each(["theme-replacement", "theme-ABA", "same-reference-theme", "pane-reopen"] as const)(
      "%s commits once without acknowledging an expired owner lease",
      (boundary) => {
        const f = appearanceOwnerFixture();
        const intent =
          operation === "reset"
            ? f.reset()
            : operation === "line"
              ? f.field("lineMode", "solid")
              : f.field("shadowPreset", "hard");
        const sessionId = intent.owner.sessionId,
          effects = f.session.workbook.theme.effects!;
        const execute = f.execute.getMockImplementation()!;
        f.execute.mockImplementationOnce((forest) => {
          // A second callback must never enter the pending mutation.
          expect(f.pane.onIntent(intent)).toBe(false);
          if (boundary === "pane-reopen") {
            f.open.value = false;
            f.open.value = true;
          } else if (boundary === "same-reference-theme") {
            effects.shadow = "hard";
            f.refreshTheme();
          } else {
            f.session.workbook.theme.effects = { ...effects, outlineWidth: 8 };
            f.refreshTheme();
            if (boundary === "theme-ABA") {
              f.session.workbook.theme.effects = effects;
              f.refreshTheme();
            }
          }
          return execute(forest);
        });
        expect(f.pane.onIntent(intent)).toBe(true);
        expect(f.session.history.undoStack).toHaveLength(1);
        expect(f.pane.snapshot.value!.owner.sessionId).not.toBe(sessionId);
        expect(f.pane.snapshot.value!.acceptedIntentId).toBeUndefined();
        const before = appearanceCheckpoint(f);
        expect(f.pane.onIntent(intent)).toBe(false);
        expectAppearanceUnchanged(f, before);
        expect(f.execute).toHaveBeenCalledOnce();
      },
    );
  });
});
