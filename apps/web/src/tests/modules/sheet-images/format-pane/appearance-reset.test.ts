import { describe, expect, test } from "vitest";
import { redoWorkbookCommand, undoWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { resolvePictureThemeEffects } from "../../../../modules/sheet-images/drawing-theme-effects";
import { ownerKinds, selectedNode, sourceState } from "./source-scale/owner-fixture";
import {
  allThemeSuppression,
  appearanceOwnerFixture,
  paintAppearanceOwner,
} from "./appearance-owner-fixture";

describe("Reset Picture clears the selected picture's own styles and inherited effects", () => {
  test.each(ownerKinds)(
    "%s reset is one exact Core edit preserving geometry, crop, metadata and every other owner",
    (kind) => {
      const f = appearanceOwnerFixture(kind, {
        opacity: 0.4,
        brightness: 0.5,
        contrast: 1.5,
        saturation: 0.3,
        grayscale: 0.8,
        sepia: 0.6,
        transparentColor: "#123456",
        transparentTolerance: 12,
        border: { color: "#ABCDEF", width: 6 },
        shadow: "hard",
        suppressThemeEffects: { reflection: true },
      });
      const before = serializeWorkbook(f.session.workbook);
      const geometry = sourceState(f);
      const expectedForest = structuredClone(f.sheet.floatingImages);
      const expectedNode = selectedNode({
        ...f,
        sheet: { ...f.sheet, floatingImages: expectedForest },
      });
      expectedNode.transform = {
        ...expectedNode.transform,
        appearance: { suppressThemeEffects: allThemeSuppression },
      };
      const intent = f.reset(),
        sessionId = intent.owner.sessionId;
      expect(f.pane.capabilities.value.resets!["reset-picture"]?.enabled).toBe(true);
      expect(f.pane.onIntent(intent)).toBe(true);
      expect(f.sheet.floatingImages).toEqual(expectedForest);
      expect(sourceState(f)).toEqual(geometry);
      expect(f.pane.snapshot.value!.values).toMatchObject({
        lineMode: "none",
        shadowPreset: "none",
      });
      expect(f.pane.snapshot.value!.values).not.toHaveProperty("lineColor");
      expect(f.pane.snapshot.value!.values).not.toHaveProperty("lineWidthPt");
      expect(f.pane.snapshot.value!.owner.sessionId).toBe(sessionId);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBe(intent.intentId);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(
        resolvePictureThemeEffects(
          selectedNode(f).transform?.appearance,
          f.session.workbook.theme.effects,
        ),
      ).toMatchObject({
        shadow: "none",
        outlineWidth: 0,
        reflection: false,
        bevel: false,
        gradient: true,
      });
      if (kind !== "legacy") {
        const painted = paintAppearanceOwner(f);
        expect(painted.draws).toHaveLength(1);
        expect(painted.draws[0]).toMatchObject({
          globalAlpha: 1,
          filter: "none",
          shadowColor: "transparent",
        });
        expect(painted.borders).toHaveLength(0);
        expect(painted.context.stroke).not.toHaveBeenCalled();
      }
      const written = serializeWorkbook(f.session.workbook);
      const repeated = { ...f.reset(), intentId: "repeated-reset" };
      expect(f.pane.onIntent(repeated)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(written);
      expect(f.pane.snapshot.value!.owner.sessionId).toBe(sessionId);
      expect(f.pane.snapshot.value!.acceptedIntentId).toBe(repeated.intentId);
      expect(f.execute).toHaveBeenCalledOnce();
      expect(f.session.history.undoStack).toHaveLength(1);
      expect(f.session.history.redoStack).toHaveLength(0);
      expect(undoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.session)).toBe(true);
      expect(serializeWorkbook(f.session.workbook)).toEqual(written);
    },
  );

  test("legacy own reflection can be reset without promotion or rewriting its crop, rotation or flips", () => {
    const f = appearanceOwnerFixture("legacy", { reflection: true, opacity: 0.4 });
    const oldNode = structuredClone(selectedNode(f));
    const before = serializeWorkbook(f.session.workbook);
    expect(f.pane.capabilities.value.resets!["reset-crop"]?.enabled).toBe(false);
    expect(f.pane.capabilities.value.resets!["reset-size"]?.enabled).toBe(false);
    expect(f.pane.capabilities.value.resets!["reset-picture"]?.enabled).toBe(true);
    expect(f.pane.onIntent(f.reset())).toBe(true);
    const node = selectedNode(f);
    expect(node).not.toHaveProperty("frame");
    expect(node).toEqual({
      ...oldNode,
      transform: {
        ...oldNode.transform,
        appearance: { suppressThemeEffects: allThemeSuppression },
      },
    });
    expect(f.pane.capabilities.value.resets!["reset-crop"]?.enabled).toBe(true);
    expect(f.pane.capabilities.value.resets!["reset-size"]?.enabled).toBe(true);
    expect(f.session.history.undoStack).toHaveLength(1);
    const written = serializeWorkbook(f.session.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(written);
  });
});
