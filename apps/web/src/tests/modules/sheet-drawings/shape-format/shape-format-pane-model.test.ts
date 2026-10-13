import { describe, expect, test, vi } from "vitest";
import {
  createShapeFormatSession,
  shapeFormatFromDisplay,
  shapeFormatOwnerKey,
  shapeFormatToDisplay,
  type ShapeFormatCapabilities,
  type ShapeFormatFailure,
  type ShapeFormatIntentHandler,
  type ShapeFormatSnapshot,
} from "../../../../modules/sheet-drawings/shape-format-pane-model";
import {
  createShapeFormatTranslate,
  SHAPE_FORMAT_LABELS,
} from "../../../../modules/sheet-drawings/components/shape-format/shape-format-labels";
function snapshot(): ShapeFormatSnapshot {
  return {
    owner: { workbookId: "book", sheetId: "sheet", drawingId: "shape", sessionId: "session" },
    revision: 2,
    drawing: {
      id: "shape",
      name: "Shape",
      kind: "shape",
      shape: "roundedRectangle",
      shapeGeometry: { preset: "roundRect" },
      anchor: { row: 2, column: 3 },
      offsetX: 0,
      offsetY: 0,
      width: 288,
      height: 192,
      rotation: 37,
      text: "shape\ntext",
      fill: "#4472C4",
      stroke: "#203864",
      strokeWidth: 1,
      color: "#FFFFFF",
      fontSize: 12,
      bold: false,
      italic: false,
    },
    values: { sizeWidthPt: 216 },
  };
}
function fixture() {
  let value: ShapeFormatSnapshot | null = snapshot(),
    capability: ShapeFormatCapabilities = {
      fields: {
        sizeWidthPt: { enabled: true, min: 1, max: 1000 },
        textWrap: { enabled: true },
        textMarginLeftPt: { enabled: true, min: 0 },
        textMarginRightPt: { enabled: true, min: 0 },
        textMarginTopPt: { enabled: true, min: 0 },
        textMarginBottomPt: { enabled: true, min: 0 },
      },
      styles: { shape: { fill: { enabled: true } } },
      lineEnds: { enabled: true },
    },
    handler: ShapeFormatIntentHandler = vi.fn(() => true);
  const failures: (ShapeFormatFailure | undefined)[] = [],
    accepted: string[] = [];
  const session = createShapeFormatSession({
    snapshot: () => value,
    capabilities: () => capability,
    handler: () => handler,
    feedback: (failure) => failures.push(failure),
    accepted: (id) => accepted.push(id),
  });
  return {
    session,
    failures,
    accepted,
    get handler() {
      return handler;
    },
    set handler(next) {
      handler = next;
    },
    get snapshot() {
      return value;
    },
    set snapshot(next) {
      value = next;
    },
    get capabilities() {
      return capability;
    },
    set capabilities(next) {
      capability = next;
    },
  };
}
describe("shape-owned canonical format contract", () => {
  test("physical lengths round-trip exactly without pixels or hidden clamps", () => {
    expect(shapeFormatToDisplay(216, "in")).toBe(3);
    expect(shapeFormatFromDisplay(2.54, "cm")).toBe(72);
    expect(shapeFormatFromDisplay(-0.25, "in")).toBe(-18);
    expect(shapeFormatToDisplay(7.2, "pt")).toBe(7.2);
  });
  test("owner key is collision-free and contains no invented picture/source identity", () => {
    expect(shapeFormatOwnerKey(snapshot().owner)).not.toContain("asset");
    expect(shapeFormatOwnerKey({ ...snapshot().owner, sheetId: "a:b", drawingId: "c" })).not.toBe(
      shapeFormatOwnerKey({ ...snapshot().owner, sheetId: "a", drawingId: "b:c" }),
    );
  });
  test("field edits carry the exact drawing owner and revision, detached from mutable inputs", () => {
    const f = fixture();
    expect(f.session.fieldAction("sizeWidthPt")(320)).toBe(true);
    expect(f.handler).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "set-field",
        field: "sizeWidthPt",
        value: 320,
        baseRevision: 2,
        owner: snapshot().owner,
      }),
    );
    expect(f.accepted).toHaveLength(1);
    expect(f.snapshot!.values.sizeWidthPt).toBe(216);
  });
  test("stale selection, revision, handler, mismatched drawing and cancelled tokens never retarget", () => {
    for (const change of ["owner", "revision", "handler", "drawing", "cancel"] as const) {
      const f = fixture(),
        action = f.session.fieldAction("sizeWidthPt"),
        originalHandler = f.handler;
      if (change === "owner")
        f.snapshot = { ...f.snapshot!, owner: { ...f.snapshot!.owner, sessionId: "new-session" } };
      if (change === "revision") f.snapshot = { ...f.snapshot!, revision: 3 };
      if (change === "handler") f.handler = vi.fn(() => true);
      if (change === "drawing")
        f.snapshot = { ...f.snapshot!, drawing: { ...f.snapshot!.drawing, id: "other" } };
      if (change === "cancel") f.session.cancel();
      expect(action(300)).toBe(false);
      expect(originalHandler).not.toHaveBeenCalled();
      expect(f.failures.at(-1)).toBe("stale-owner");
    }
  });
  test("missing capabilities and narrowed numeric bounds remain blocked", () => {
    const f = fixture();
    expect(f.session.fieldAction("fontSizePt")(12)).toBe(false);
    expect(f.failures.at(-1)).toBe("unsupported");
    const action = f.session.fieldAction("sizeWidthPt");
    f.capabilities = { fields: { sizeWidthPt: { enabled: true, min: 10, max: 100 } } };
    expect(action(200)).toBe(false);
    expect(action(NaN)).toBe(false);
    expect(f.handler).not.toHaveBeenCalled();
    expect(f.failures.at(-1)).toBe("out-of-range");
  });
  test("false and thrown transactions report failure without acknowledgement", () => {
    for (const handler of [
      vi.fn(() => false),
      vi.fn(() => {
        throw Error("transaction failed");
      }),
    ]) {
      const f = fixture();
      f.handler = handler;
      expect(f.session.fieldAction("sizeWidthPt")(100)).toBe(false);
      expect(f.failures.at(-1)).toBe("apply-rejected");
      expect(f.accepted).toEqual([]);
    }
  });
  test("paint and endpoint edits remain actual shape-owned and category-gated", () => {
    const f = fixture();
    expect(f.session.styleAction("shape", "fill")({ kind: "none" })).toBe(true);
    expect(f.session.styleAction("text", "fill")({ kind: "none" })).toBe(false);
    expect(
      f.session.lineEndsAction()({
        begin: { kind: "oval", width: "small", length: "large" },
        end: { kind: "open", width: "large", length: "small" },
      }),
    ).toBe(true);
    expect(f.handler).toHaveBeenCalledTimes(2);
  });
  test("actual group owners route line-end intents only through the explicit host capability", () => {
    const f = fixture();
    f.snapshot = {
      ...f.snapshot!,
      owner: { ...f.snapshot!.owner, drawingId: "group" },
      drawing: {
        kind: "shapeGroup",
        id: "group",
        name: "Actual group",
        rotation: 0,
        shapeFrame: {
          kind: "shape-frame-v1",
          anchor: { mode: "fixed", x: 10, y: 20, size: { width: 200, height: 100 } },
        },
        members: [
          {
            kind: "shape",
            id: "member",
            name: "Member",
            shape: "rectangle",
            groupFrame: {
              kind: "shape-group-local-v1",
              rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
            },
            rotation: 0,
            text: "",
            fill: "#4472C4",
            stroke: "#203864",
            strokeWidth: 1,
            color: "#FFFFFF",
            fontSize: 12,
            bold: false,
            italic: false,
          },
        ],
      },
    };
    expect(f.session.fieldAction("sizeWidthPt")(300)).toBe(true);
    expect(f.handler).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ owner: f.snapshot.owner, field: "sizeWidthPt", value: 300 }),
    );
    expect(f.session.lineEndAction()("begin", { kind: "open" })).toBe(true);
    expect(f.handler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "set-line-end",
        endpoint: "begin",
        value: { kind: "open" },
        owner: f.snapshot.owner,
      }),
    );
    f.capabilities.lineEnds = { enabled: false };
    expect(f.session.lineEndsAction()(undefined)).toBe(false);
    expect(f.failures.at(-1)).toBe("unsupported");
    expect(f.handler).toHaveBeenCalledTimes(2);
  });
  test("text paint remains independent and the layout KeepFlat field has one identity", () => {
    const f = fixture();
    f.capabilities.styles = {
      shape: { fill: { enabled: true } },
      text: { fill: { enabled: true } },
    };
    f.capabilities.fields.shapeKeepTextFlat = { enabled: true };
    expect(f.session.styleAction("text", "fill")({ kind: "none" })).toBe(true);
    expect(f.session.fieldAction("shapeKeepTextFlat")(true)).toBe(true);
    expect(f.handler).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "set-style",
        target: "text",
        category: "fill",
        value: { kind: "none" },
      }),
    );
    expect(f.handler).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "set-field",
        field: "shapeKeepTextFlat",
        value: true,
      }),
    );
  });
  test("margin presets are one atomic intent, require all four capabilities and respect bounds", () => {
    const f = fixture(),
      margins = { leftPt: 7.2, rightPt: 7.2, topPt: 3.6, bottomPt: 3.6 };
    expect(f.session.marginsAction()(margins)).toBe(true);
    expect(f.handler).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "set-text-margins", value: margins }),
    );
    f.capabilities.fields.textMarginBottomPt = { enabled: false };
    expect(f.session.marginsAction()(margins)).toBe(false);
    f.capabilities.fields.textMarginBottomPt = { enabled: true, max: 3 };
    expect(f.session.marginsAction()(margins)).toBe(false);
    expect(f.handler).toHaveBeenCalledTimes(1);
  });
  test("all shape labels exist in both languages and localized labels do not change field IDs", () => {
    expect(Object.keys(SHAPE_FORMAT_LABELS["zh-CN"]).sort()).toEqual(
      Object.keys(SHAPE_FORMAT_LABELS["en-US"]).sort(),
    );
    expect(createShapeFormatTranslate("zh-CN")("textMarginLeftPt")).toBe("左边距");
    expect(createShapeFormatTranslate("en-US")("textMarginLeftPt")).toBe("Left margin");
  });
});
