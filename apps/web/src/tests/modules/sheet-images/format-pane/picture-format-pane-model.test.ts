import { describe, expect, test } from "vitest";
import {
  PICTURE_FORMAT_LABEL_KEYS,
  PICTURE_FORMAT_RESET_CONTRACT,
  canApplyPictureFormatIntent,
  cancelPictureFormatDraft,
  createPictureFormatDraftState,
  createPictureFormatFieldIntent,
  editPictureFormatDraft,
  focusPictureFormatDraft,
  pictureFormatNumericValue,
  pictureFormatOwnerKey,
  pictureFormatPointsToUnit,
  pictureFormatUnitToPoints,
  reconcilePictureFormatDraftState,
  type PictureFormatSnapshot,
} from "../../../../modules/sheet-images/picture-format-pane-model";
const snapshot = (): PictureFormatSnapshot => ({
  owner: {
    workbookId: "book",
    sheetId: "sheet",
    pictureId: "image",
    assetId: "asset",
    sessionId: "session",
  },
  revision: 1,
  values: { sizeWidthPt: 270, sizeHeightPt: 180, rotationDeg: 37 },
});
describe("picture format pane unit and intent contract", () => {
  test("centralizes inch/cm/pt conversion without a DOM or zoom dependency", () => {
    expect(pictureFormatPointsToUnit(270, "in")).toBe(3.75);
    expect(pictureFormatUnitToPoints(3.75, "in")).toBe(270);
    expect(pictureFormatPointsToUnit(72, "cm")).toBe(2.54);
    expect(pictureFormatUnitToPoints(2.54, "cm")).toBe(72);
    expect(pictureFormatUnitToPoints(37, "pt")).toBe(37);
  });
  test("creates one precisely typed field intent with a copied complete owner", () => {
    const source = snapshot();
    const intent = createPictureFormatFieldIntent(source, "sourceOffsetXPt", -36, "intent-1");
    expect(intent).toEqual({
      type: "set-field",
      owner: source.owner,
      baseRevision: 1,
      intentId: "intent-1",
      field: "sourceOffsetXPt",
      value: -36,
    });
    expect(intent.owner).not.toBe(source.owner);
    expect(source.values).toEqual({ sizeWidthPt: 270, sizeHeightPt: 180, rotationDeg: 37 });
  });
  test("only explicitly enabled capabilities authorize a matching owner", () => {
    const source = snapshot();
    const intent = createPictureFormatFieldIntent(source, "sizeWidthPt", 324, "intent-1");
    expect(canApplyPictureFormatIntent(intent, source, { fields: {} })).toBe(false);
    expect(
      canApplyPictureFormatIntent(intent, source, { fields: { sizeWidthPt: { enabled: true } } }),
    ).toBe(true);
    for (const field of ["workbookId", "sheetId", "pictureId", "assetId", "sessionId"] as const) {
      const different = { ...source, owner: { ...source.owner, [field]: "different" } };
      expect(
        canApplyPictureFormatIntent(intent, different, {
          fields: { sizeWidthPt: { enabled: true } },
        }),
      ).toBe(false);
    }
  });
  test("owner identity is unambiguous even if IDs contain delimiters", () => {
    const owner = snapshot().owner;
    expect(pictureFormatOwnerKey({ ...owner, workbookId: "a|b", sheetId: "c" })).not.toBe(
      pictureFormatOwnerKey({ ...owner, workbookId: "a", sheetId: "b|c" }),
    );
  });
  test("numeric size and crop fields remain separate intents", () => {
    const source = snapshot();
    const size = createPictureFormatFieldIntent(source, "sizeWidthPt", 324, "1");
    const crop = createPictureFormatFieldIntent(source, "cropWidthPt", 324, "2");
    expect(size.field).toBe("sizeWidthPt");
    expect(crop.field).toBe("cropWidthPt");
    expect(size).not.toHaveProperty("cropLeftPt");
  });
  test("all five resets retain distinct host contracts and capabilities", () => {
    const source = snapshot();
    expect(Object.keys(PICTURE_FORMAT_RESET_CONTRACT)).toEqual([
      "reset-size",
      "reset-picture",
      "reset-crop",
      "reset-3d-format",
      "reset-3d-rotation",
    ]);
    expect(PICTURE_FORMAT_RESET_CONTRACT["reset-crop"]).toContain("crop-to-current-source-size");
    expect(PICTURE_FORMAT_RESET_CONTRACT["reset-size"]).toContain("zero-2d-rotation");
    expect(PICTURE_FORMAT_RESET_CONTRACT["reset-picture"]).toContain("retain-all-geometry");
    expect(
      canApplyPictureFormatIntent(
        { type: "reset-crop", owner: source.owner, baseRevision: 1, intentId: "r" },
        source,
        { fields: {}, resets: { "reset-size": { enabled: true } } },
      ),
    ).toBe(false);
    expect(new Set(PICTURE_FORMAT_LABEL_KEYS).size).toBe(PICTURE_FORMAT_LABEL_KEYS.length);
  });
  test.each(["", " ", "-", ".", "0x10", "1e3", "Infinity", "NaN", "1 2"])(
    "rejects incomplete/nondecimal draft %s",
    (text) => {
      expect(pictureFormatNumericValue("sizeWidthPt", text, "pt")).toEqual({
        error: "invalidNumber",
      });
    },
  );
  test("accepts trailing decimals/local decimal commas and signed center offsets", () => {
    expect(pictureFormatNumericValue("sourceWidthPt", "4.75", "in")).toEqual({ value: 342 });
    expect(pictureFormatNumericValue("sourceOffsetXPt", "-.5", "in")).toEqual({ value: -36 });
    expect(pictureFormatNumericValue("sourceOffsetYPt", "0,50", "in")).toEqual({ value: 36 });
    expect(pictureFormatNumericValue("sizeWidthPt", "20.", "pt")).toEqual({ value: 20 });
    expect(pictureFormatNumericValue("rotationDeg", "37", "in")).toEqual({ value: 37 });
    expect(pictureFormatNumericValue("shadowBlurPt", "20", "cm")).toEqual({ value: 20 });
  });
  test("validates meaningful intrinsic and host bounds without silently clamping", () => {
    expect(pictureFormatNumericValue("sizeWidthPt", "0", "pt")).toEqual({ error: "outOfRange" });
    expect(pictureFormatNumericValue("scaleWidthPercent", "-1", "pt")).toEqual({
      error: "outOfRange",
    });
    expect(pictureFormatNumericValue("shadowTransparencyPercent", "101", "pt")).toEqual({
      error: "outOfRange",
    });
    expect(pictureFormatNumericValue("shadowSizePercent", "0", "pt")).toEqual({ value: 0 });
    expect(
      pictureFormatNumericValue("sizeWidthPt", "10", "in", { enabled: true, max: 700 }),
    ).toEqual({ error: "outOfRange" });
  });
});
describe("picture format pane pure continuous draft state", () => {
  test("typing several digits is local state and clears only this field's error", () => {
    let state = createPictureFormatDraftState(snapshot());
    state.errors = { sizeWidthPt: "applyRejected", sizeHeightPt: "outOfRange" };
    state = editPictureFormatDraft(state, "sizeWidthPt", "2");
    state = editPictureFormatDraft(state, "sizeWidthPt", "20");
    expect(state.drafts.sizeWidthPt).toMatchObject({ text: "20", dirty: true, generation: 2 });
    expect(state.errors).toEqual({ sizeHeightPt: "outOfRange" });
  });
  test("same-owner updates never erase an unsubmitted draft", () => {
    let state = editPictureFormatDraft(
      createPictureFormatDraftState(snapshot()),
      "sizeWidthPt",
      "20.",
    );
    state = reconcilePictureFormatDraftState(state, {
      ...snapshot(),
      revision: 2,
      values: { sizeWidthPt: 324 },
    });
    expect(state.drafts.sizeWidthPt?.text).toBe("20.");
  });
  test("a late accepted update cannot erase newer typing", () => {
    let state = editPictureFormatDraft(
      createPictureFormatDraftState(snapshot()),
      "sizeWidthPt",
      "20",
    );
    state.drafts.sizeWidthPt!.submitted = {
      intentId: "own-1",
      generation: 1,
      value: 20,
      accepted: true,
      baseRevision: 1,
    };
    state = editPictureFormatDraft(state, "sizeWidthPt", "200");
    state = reconcilePictureFormatDraftState(state, {
      ...snapshot(),
      revision: 2,
      acceptedIntentId: "own-1",
      values: { sizeWidthPt: 20 },
    });
    expect(state.drafts.sizeWidthPt).toMatchObject({ text: "200", dirty: true });
    expect(state.drafts.sizeWidthPt?.submitted).toBeUndefined();
  });
  test("an acknowledged focused draft preserves raw formatting, and blurred drafts reconcile", () => {
    let state = focusPictureFormatDraft(
      createPictureFormatDraftState(snapshot()),
      "sizeWidthPt",
      "20.",
      true,
    );
    state.drafts.sizeWidthPt!.submitted = {
      intentId: "own-1",
      generation: 0,
      value: 20,
      accepted: true,
      baseRevision: 1,
    };
    state = reconcilePictureFormatDraftState(state, {
      ...snapshot(),
      revision: 2,
      acceptedIntentId: "own-1",
      values: { sizeWidthPt: 20 },
    });
    expect(state.drafts.sizeWidthPt).toMatchObject({ text: "20.", focused: true, dirty: false });
    state.drafts.sizeWidthPt!.focused = false;
    state.drafts.sizeWidthPt!.submitted = {
      intentId: "own-2",
      generation: 0,
      value: 22,
      accepted: true,
      baseRevision: 2,
    };
    state = reconcilePictureFormatDraftState(state, {
      ...snapshot(),
      revision: 3,
      values: { sizeWidthPt: 22 },
    });
    expect(state.drafts.sizeWidthPt).toBeUndefined();
  });
  test("target/source/session changes reset old drafts and errors without resetting intent sequence", () => {
    let state = editPictureFormatDraft(
      createPictureFormatDraftState(snapshot(), 9),
      "cropLeftPt",
      "123",
    );
    state.errors = { "reset-crop": "applyRejected" };
    for (const field of ["workbookId", "sheetId", "pictureId", "assetId", "sessionId"] as const) {
      const reset = reconcilePictureFormatDraftState(state, {
        ...snapshot(),
        owner: { ...snapshot().owner, [field]: "new" },
      });
      expect(reset.drafts).toEqual({});
      expect(reset.errors).toEqual({});
      expect(reset.sequence).toBe(9);
    }
    state = reconcilePictureFormatDraftState(state, null);
    expect(state.owner).toBeNull();
    expect(state.drafts).toEqual({});
  });
  test("field cancellation preserves another field's draft; pane cancellation clears both", () => {
    let state = editPictureFormatDraft(
      createPictureFormatDraftState(snapshot()),
      "sizeWidthPt",
      "20",
    );
    state = editPictureFormatDraft(state, "sizeHeightPt", "30");
    state = cancelPictureFormatDraft(state, "sizeWidthPt");
    expect(state.drafts.sizeWidthPt).toBeUndefined();
    expect(state.drafts.sizeHeightPt?.text).toBe("30");
    expect(cancelPictureFormatDraft(state).drafts).toEqual({});
  });
  test("moving a leaf between actual group owner paths invalidates drafts and cloned intents", () => {
    const path = ["outer", "group-a"];
    const source = { ...snapshot(), owner: { ...snapshot().owner, ownerPath: path } };
    const intent = createPictureFormatFieldIntent(source, "sizeWidthPt", 324, "path-1");
    const state = editPictureFormatDraft(
      createPictureFormatDraftState(source),
      "sizeWidthPt",
      "210",
    );
    path[1] = "group-b";
    expect(intent.owner.ownerPath).toEqual(["outer", "group-a"]);
    expect(state.owner?.ownerPath).toEqual(["outer", "group-a"]);
    expect(
      canApplyPictureFormatIntent(intent, source, { fields: { sizeWidthPt: { enabled: true } } }),
    ).toBe(false);
    expect(reconcilePictureFormatDraftState(state, source).drafts).toEqual({});
    expect(
      createPictureFormatFieldIntent(snapshot(), "sizeWidthPt", 324, "standalone").owner,
    ).not.toHaveProperty("ownerPath");
  });
});

describe("current-size percentage draft acknowledgement", () => {
  test.each(["scaleWidthPercent", "scaleHeightPercent"] as const)(
    "returns accepted %s to 100 while keeping its focus",
    (field) => {
      const source = { ...snapshot(), values: { relativeToOriginalSize: false, [field]: 100 } };
      let state = focusPictureFormatDraft(
        createPictureFormatDraftState(source),
        field,
        "100",
        true,
      );
      state = editPictureFormatDraft(state, field, "125");
      state.drafts[field]!.submitted = {
        intentId: "scale",
        generation: 1,
        value: 125,
        accepted: true,
        baseRevision: 1,
      };
      state = reconcilePictureFormatDraftState(state, {
        ...source,
        revision: 2,
        acceptedIntentId: "scale",
      });
      expect(state.drafts[field]).toMatchObject({ text: "100", focused: true, dirty: false });
      expect(state.drafts[field]?.submitted).toBeUndefined();
    },
  );
  test("a late accepted current-size scale cannot erase a later percentage", () => {
    const source = {
      ...snapshot(),
      values: { relativeToOriginalSize: false, scaleWidthPercent: 100 },
    };
    let state = editPictureFormatDraft(
      createPictureFormatDraftState(source),
      "scaleWidthPercent",
      "125",
    );
    state.drafts.scaleWidthPercent!.submitted = {
      intentId: "scale",
      generation: 1,
      value: 125,
      accepted: true,
      baseRevision: 1,
    };
    state = editPictureFormatDraft(state, "scaleWidthPercent", "150");
    state = reconcilePictureFormatDraftState(state, {
      ...source,
      revision: 2,
      acceptedIntentId: "scale",
    });
    expect(state.drafts.scaleWidthPercent).toMatchObject({ text: "150", dirty: true });
  });
  test("original-size scale preserves accepted raw formatting", () => {
    const source = {
      ...snapshot(),
      values: { relativeToOriginalSize: true, scaleWidthPercent: 125 },
    };
    let state = focusPictureFormatDraft(
      createPictureFormatDraftState(source),
      "scaleWidthPercent",
      "125.",
      true,
    );
    state.drafts.scaleWidthPercent!.submitted = {
      intentId: "scale",
      generation: 0,
      value: 125,
      accepted: true,
      baseRevision: 1,
    };
    state = reconcilePictureFormatDraftState(state, {
      ...source,
      revision: 2,
      acceptedIntentId: "scale",
    });
    expect(state.drafts.scaleWidthPercent).toMatchObject({ text: "125.", dirty: false });
  });
});
