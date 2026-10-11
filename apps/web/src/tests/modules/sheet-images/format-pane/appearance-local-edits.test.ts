import { describe, expect, test } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import { ownerKinds, selectedNode, sourceState } from "./source-scale/owner-fixture";
import { appearanceOwnerFixture, paintAppearanceOwner } from "./appearance-owner-fixture";

const quietOtherEffects: ImageAppearance = {
  opacity: 0.8,
  suppressThemeEffects: { shadow: true, reflection: true, bevel: true },
};

describe("selected-picture line and shadow appearance edits", () => {
  test.each(ownerKinds)(
    "%s line inherit, none, solid, color and point width retain exact ownership",
    (kind) => {
      const f = appearanceOwnerFixture(kind, quietOtherEffects);
      const geometry = sourceState(f),
        originalForest = structuredClone(f.sheet.floatingImages);
      const sessionId = f.pane.snapshot.value!.owner.sessionId;
      const versions = [serializeWorkbook(f.session.workbook)];
      const snapshot = () => f.pane.snapshot.value!;
      expect(snapshot().values).toMatchObject({
        lineMode: "inherit",
        lineColor: "#364E6E",
        lineWidthPt: 3,
        lineTransparencyPercent: 28,
      });
      expect(f.pane.capabilities.value.fields.lineColor?.enabled).toBe(false);
      expect(f.pane.capabilities.value.fields.lineWidthPt?.enabled).toBe(false);
      expect(f.pane.onIntent(f.field("lineMode", "inherit"))).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      if (kind !== "legacy")
        expect(paintAppearanceOwner(f).borders).toMatchObject([
          { lineWidth: 4, strokeStyle: "rgb(54 78 110 / 72%)" },
        ]);

      function remember() {
        expect(sourceState(f)).toEqual(geometry);
        expect(snapshot().owner.sessionId).toBe(sessionId);
        versions.push(serializeWorkbook(f.session.workbook));
      }
      expect(f.pane.onIntent(f.field("lineMode", "none"))).toBe(true);
      expect(snapshot().values.lineMode).toBe("none");
      expect(snapshot().values).not.toHaveProperty("lineWidthPt");
      if (kind !== "legacy") expect(paintAppearanceOwner(f).borders).toHaveLength(0);
      remember();
      expect(f.pane.onIntent(f.field("lineMode", "solid"))).toBe(true);
      expect(snapshot().values).toMatchObject({
        lineMode: "solid",
        lineColor: "#000000",
        lineWidthPt: 0.75,
      });
      expect(f.pane.capabilities.value.fields.lineColor?.enabled).toBe(true);
      expect(f.pane.capabilities.value.fields.lineWidthPt).toMatchObject({
        enabled: true,
        min: 0,
        max: 15,
      });
      remember();
      expect(f.pane.onIntent(f.field("lineColor", "#abcdef"))).toBe(true);
      expect(snapshot().values.lineColor).toBe("#ABCDEF");
      remember();
      expect(f.pane.onIntent(f.field("lineWidthPt", 1.875))).toBe(true);
      expect(snapshot().values.lineWidthPt).toBe(1.875);
      expect(selectedNode(f).transform!.appearance!.border).toEqual({
        color: "#ABCDEF",
        width: 2.5,
      });
      if (kind !== "legacy")
        expect(paintAppearanceOwner(f).borders).toMatchObject([
          { lineWidth: 2.5, strokeStyle: "#ABCDEF" },
        ]);
      remember();
      expect(f.pane.onIntent(f.field("lineWidthPt", 0))).toBe(true);
      expect(snapshot().values.lineMode).toBe("none");
      expect(selectedNode(f).transform!.appearance).not.toHaveProperty("border");
      if (kind !== "legacy") expect(paintAppearanceOwner(f).borders).toHaveLength(0);
      remember();
      expect(f.pane.onIntent(f.field("lineMode", "inherit"))).toBe(true);
      expect(snapshot().values).toMatchObject({
        lineMode: "inherit",
        lineColor: "#364E6E",
        lineWidthPt: 3,
      });
      expect(selectedNode(f).transform!.appearance).toEqual(quietOtherEffects);
      remember();
      expect(f.sheet.floatingImages).toEqual(originalForest);
      expect(f.execute).toHaveBeenCalledTimes(6);
      expect(f.session.history.undoStack).toHaveLength(6);
      for (let index = versions.length - 2; index >= 0; index--) {
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(serializeWorkbook(f.session.workbook)).toEqual(versions[index]);
      }
      for (let index = 1; index < versions.length; index++) {
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(serializeWorkbook(f.session.workbook)).toEqual(versions[index]);
      }
    },
  );

  test.each(ownerKinds)(
    "%s shadow inherit, none, soft and hard preserve independent suppression flags",
    (kind) => {
      const appearance: ImageAppearance = {
        opacity: 0.8,
        suppressThemeEffects: { outline: true, reflection: true, bevel: true },
      };
      const f = appearanceOwnerFixture(kind, appearance),
        originalForest = structuredClone(f.sheet.floatingImages);
      const geometry = sourceState(f),
        sessionId = f.pane.snapshot.value!.owner.sessionId;
      const versions = [serializeWorkbook(f.session.workbook)];
      expect(f.pane.snapshot.value!.values.shadowPreset).toBe("inherit");
      expect(f.pane.onIntent(f.field("shadowPreset", "inherit"))).toBe(true);
      expect(f.execute).not.toHaveBeenCalled();
      if (kind !== "legacy")
        expect(paintAppearanceOwner(f).draws).toMatchObject([
          { shadowColor: "rgb(0 0 0 / 28%)", shadowBlur: 8 },
        ]);
      for (const preset of ["none", "soft", "hard", "inherit"] as const) {
        const intent = f.field("shadowPreset", preset);
        expect(f.pane.onIntent(intent)).toBe(true);
        expect(f.pane.snapshot.value!.values.shadowPreset).toBe(preset);
        expect(f.pane.snapshot.value!.owner.sessionId).toBe(sessionId);
        expect(f.pane.snapshot.value!.acceptedIntentId).toBe(intent.intentId);
        expect(sourceState(f)).toEqual(geometry);
        const own = selectedNode(f).transform!.appearance!;
        expect(own.suppressThemeEffects).toMatchObject({
          outline: true,
          reflection: true,
          bevel: true,
        });
        if (preset === "inherit") {
          expect(own).not.toHaveProperty("shadow");
          expect(own.suppressThemeEffects).not.toHaveProperty("shadow");
        } else expect(own.suppressThemeEffects!.shadow).toBe(true);
        if (kind !== "legacy") {
          const painted = paintAppearanceOwner(f);
          expect(painted.draws).toHaveLength(1);
          expect(painted.draws[0]).toMatchObject({
            globalAlpha: 0.8,
            shadowColor:
              preset === "none"
                ? "transparent"
                : preset === "inherit"
                  ? "rgb(0 0 0 / 28%)"
                  : "rgb(0 0 0 / 35%)",
            shadowBlur: preset === "none" ? 0 : preset === "hard" ? 1 : 8,
          });
          expect(painted.borders).toHaveLength(0);
        }
        versions.push(serializeWorkbook(f.session.workbook));
      }
      expect(f.sheet.floatingImages).toEqual(originalForest);
      expect(f.execute).toHaveBeenCalledTimes(4);
      expect(f.session.history.undoStack).toHaveLength(4);
      for (let index = versions.length - 2; index >= 0; index--) {
        expect(undoWorkbookCommand(f.session)).toBe(true);
        expect(serializeWorkbook(f.session.workbook)).toEqual(versions[index]);
      }
      for (let index = 1; index < versions.length; index++) {
        expect(redoWorkbookCommand(f.session)).toBe(true);
        expect(serializeWorkbook(f.session.workbook)).toEqual(versions[index]);
      }
    },
  );

  test("an existing local border retains the separate inherited outline and explains the composite", () => {
    const f = appearanceOwnerFixture("framed", {
      ...quietOtherEffects,
      border: { color: "#123456", width: 2 },
    });
    expect(f.pane.capabilities.value.fields.lineColor).toMatchObject({ enabled: true });
    expect(f.pane.capabilities.value.fields.lineColor?.reason).toBeTruthy();
    expect(f.pane.capabilities.value.fields.lineWidthPt?.reason).toBeTruthy();
    expect(f.pane.onIntent(f.field("lineMode", "solid"))).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.pane.onIntent(f.field("lineColor", "#654321"))).toBe(true);
    expect(selectedNode(f).transform!.appearance!.suppressThemeEffects).not.toHaveProperty(
      "outline",
    );
    expect(paintAppearanceOwner(f).borders).toMatchObject([
      { lineWidth: 2, strokeStyle: "#654321" },
      { lineWidth: 4, strokeStyle: "rgb(54 78 110 / 72%)" },
    ]);
  });
});
