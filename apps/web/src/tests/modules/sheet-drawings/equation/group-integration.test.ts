// @vitest-environment node
import { effectScope, ref, shallowRef } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  findShapeGroupNode,
  isShapeGroupDrawing,
  isSheetGroupedEquationDrawing,
  type ShapeGroupDrawing,
  type ShapeGroupPath,
  type SheetGroupedEquationDrawing,
} from "@sheetcraft/core/shape-group";
import {
  groupShapeRoots,
  isShapeGroupEligibleRoot,
  normalizeShapeDrawingForest,
  promoteEquationRootFrame,
  resolveShapeRootLayout,
  ungroupShapeRoot,
} from "@sheetcraft/core/shape-group-planning";
import {
  isFramedEquationDrawing,
  type SheetDrawing,
  type SheetFramedEquationDrawing,
  type SheetGraphicDrawing,
} from "@sheetcraft/core/sheet-drawings";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { resolveShapeForestForRender } from "../../../../modules/sheet-drawings/resolved-shape-render-source";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
} from "../../../../modules/sheet-drawings/resolved-shape-drawing";
import {
  resolveShapeGroupProjection,
  updateResolvedShapeGroupLeaf,
} from "../../../../modules/sheet-drawings/resolved-shape-group";
import { useDrawingActions } from "../../../../modules/sheet-drawings/useDrawingActions";
import { useShapeObjectControls } from "../../../../modules/sheet-drawings/useShapeObjectControls";
import { framedShape } from "../framed-shape-fixture";
import { clipboardFixture, equationDrawing, rawEquationSource } from "./clipboard-fixture";

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));

function framedEquation(id = "math", structured = true): SheetFramedEquationDrawing {
  const sheet = getActiveSheet(createWorkbook({ id: "placement", sheetId: "placement-sheet" }));
  return {
    ...promoteEquationRootFrame(equationDrawing(id, structured), createPictureSheetMetrics(sheet)),
    equationFlipX: true,
    equationFlipY: true,
    shapeProperties: { locked: false, printObject: false, altTitle: "Exact math" },
  };
}

function groupedForest(structured = true, connected = false): SheetDrawing[] {
  const sheet = getActiveSheet(createWorkbook({ id: "group", sheetId: "group-sheet" }));
  const first = framedShape(),
    second = framedShape();
  first.id = "a";
  first.shapeGeometry = { preset: "rightArrow" };
  second.id = "b";
  second.shapeGeometry = { preset: "ellipse" };
  second.shapeFrame = {
    kind: "shape-frame-v1",
    anchor: { mode: "fixed", x: 520, y: 32, size: { width: 120, height: 80 } },
  };
  const roots: SheetDrawing[] = [framedEquation("math", structured), first, second];
  if (connected) {
    const connector = framedShape();
    connector.id = "connection";
    connector.text = "";
    connector.shapeGeometry = { preset: "bentConnector3" };
    connector.shapeConnector = {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "a", preset: "rightArrow", siteIndex: 0 },
      end: { kind: "site", targetId: "b", preset: "ellipse", siteIndex: 0 },
    };
    roots.push(connector);
  }
  return groupShapeRoots(
    roots,
    roots.map((root) => root.id),
    { id: "owner", name: "Math and shapes" },
    createPictureSheetMetrics(sheet),
  );
}

function group(values: readonly SheetDrawing[]): ShapeGroupDrawing {
  const root = values.find(isShapeGroupDrawing);
  if (!root) throw new Error("Expected Equation group.");
  return root;
}

function math(root: ShapeGroupDrawing, id = "math"): SheetGroupedEquationDrawing {
  const node = findShapeGroupNode(root, [root.id, id])?.node;
  if (!node || !isSheetGroupedEquationDrawing(node)) throw new Error("Expected owned Equation.");
  return node;
}

function expectSource(
  actual: SheetGraphicDrawing | SheetFramedEquationDrawing | SheetGroupedEquationDrawing,
  source: SheetGraphicDrawing | SheetFramedEquationDrawing | SheetGroupedEquationDrawing,
) {
  expect(actual.kind).toBe("equation");
  expect(actual.text).toBe(source.text);
  expect(actual.equationDocument).toEqual(source.equationDocument);
  expect(actual.equationFlipX).toBe(source.equationFlipX);
  expect(actual.equationFlipY).toBe(source.equationFlipY);
  if (source.equationDocument) {
    expect(actual.equationDocument!.body.children[0]!.id).toBe("fraction");
    const fraction = actual.equationDocument!.body.children[0]!;
    if (fraction.kind !== "fraction") throw new Error("Expected preserved fraction.");
    expect(fraction.denominator.children[0]).toEqual({
      kind: "latex",
      id: "opaque",
      value: "\\unknown{b}",
    });
  } else {
    expect(actual.text).toBe(rawEquationSource);
    expect(actual).not.toHaveProperty("equationDocument");
  }
  expect(actual).not.toHaveProperty("shapeFlipX");
  expect(actual).not.toHaveProperty("shapeFlipY");
}

function fixture(drawings: SheetDrawing[] = [framedEquation()]) {
  const workbook = createWorkbook({ id: "integration", sheetId: "integration-sheet" });
  const sheet = getActiveSheet(workbook);
  sheet.drawings = normalizeShapeDrawingForest(drawings);
  const metrics = createPictureSheetMetrics(sheet);
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const revision = ref(0);
  const paths = shallowRef<readonly ShapeGroupPath[]>([[sheet.drawings[0]!.id]]);
  const prepare = vi.fn((drawing: SheetDrawing) => drawing);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
    const result = executeWorkbookCommand(session, command);
    if (result) revision.value++;
    return result;
  });
  const scope = effectScope();
  scopes.push(scope);
  const common = {
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getGeneration: () => 0,
    getRevision: () => revision.value,
    getMetrics: () => metrics,
    isBusy: () => false,
    flush: () => true,
  };
  const actions = scope.run(() =>
    useDrawingActions({
      ...common,
      getAddress: () => ({ row: 0, column: 0 }),
      name: (kind) => kind,
      execute,
      prepareDrawing: prepare,
    }),
  )!;
  const controls = scope.run(() =>
    useShapeObjectControls({
      ...common,
      getSelection: () => paths.value,
      select: (next) => {
        paths.value = next;
        return true;
      },
      format: () => false,
      replaceCollection: actions.replaceCollection,
      replaceVisibilityCollection: actions.replaceVisibilityCollection,
    }),
  )!;
  return {
    workbook,
    sheet,
    metrics,
    session,
    revision,
    paths,
    prepare,
    execute,
    actions,
    controls,
  };
}

type Corruption = "source" | "tree" | "flip";
function corruptEquation<
  T extends SheetGraphicDrawing | SheetFramedEquationDrawing | SheetGroupedEquationDrawing,
>(source: T, change: Corruption): T {
  const value = structuredClone(source);
  if (change === "source") value.text += " changed";
  else if (change === "tree") delete value.equationDocument;
  else delete value.equationFlipX;
  return value;
}

function corruptOwned(root: SheetDrawing, change: Corruption): SheetDrawing {
  if (!isShapeGroupDrawing(root)) throw new Error("Expected changed owned root.");
  return {
    ...root,
    members: root.members.map((node) =>
      node.kind === "equation" ? corruptEquation(node, change) : node,
    ),
  };
}

describe("Equation group integration retains mathematical source through real consumers", () => {
  test.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ] as const)(
    "native resolved forest preserves structured=%s Equation source, tree IDs and flips with connectors=%s",
    (structured, connected) => {
      const f = fixture(groupedForest(structured, connected)),
        root = group(f.sheet.drawings!);
      const source = math(root),
        before = serializeWorkbook(f.workbook);
      const pass = resolveShapeForestForRender({
        drawings: f.sheet.drawings!,
        metrics: f.metrics,
        revision: 0,
      });
      const leaf = pass.getLeaf("math")!;
      expect(leaf.sourceRoot).toBe(root);
      expect(leaf.sourceNode).toBe(source);
      expect(leaf.path).toEqual(["owner", "math"]);
      expectSource(leaf.carrierLeaf!.view!, source);
      expect(leaf.carrierLeaf!.view).not.toHaveProperty("groupFrame");
      expect(leaf.carrierLeaf!.view).not.toHaveProperty("shapeFrame");
      expect(leaf.carrierLeaf!.view).not.toHaveProperty("shapeProperties");
      expect(leaf.connector).toBeUndefined();
      expect(pass.connections !== null).toBe(connected);
      if (connected) expect(pass.getLeaf("connection")!.connector?.status).toBe("ready");
      pass.assertCurrent(f.sheet.drawings!, f.metrics, 0);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test.each(["source", "tree", "flip"] as const)(
    "root and owned Equation geometry inverses reject %s loss before any command",
    (change) => {
      const f = fixture(),
        source = f.sheet.drawings![0]!;
      const resolved = resolveShapeDrawing(source, f.metrics);
      const view = resolved.view;
      if (view.kind !== "equation") throw new Error("Expected Equation view.");
      const before = serializeWorkbook(f.workbook);
      expect(() =>
        updateResolvedShapeDrawing(resolved, corruptEquation(view, change), f.metrics),
      ).toThrow();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      const owned = fixture(groupedForest()),
        owner = group(owned.sheet.drawings!);
      const leaf = resolveShapeGroupProjection(owner, owned.metrics).leaves.find(
        (entry) => entry.sourceNode.id === "math",
      )!;
      const ownedBefore = serializeWorkbook(owned.workbook);
      expect(() =>
        updateResolvedShapeGroupLeaf(leaf, corruptEquation(leaf.view!, change), owned.metrics),
      ).toThrow();
      expect(serializeWorkbook(owned.workbook)).toEqual(ownedBefore);
      expect(f.execute).not.toHaveBeenCalled();
      expect(owned.execute).not.toHaveBeenCalled();
    },
  );

  test("whole-collection preparation rejects a same-ID owned Equation replacement by an ordinary body", () => {
    const f = fixture(groupedForest()),
      expected = f.sheet.drawings!,
      owner = group(expected);
    const source = math(owner);
    const {
      equationDocument: _tree,
      equationFlipX: _flipX,
      equationFlipY: _flipY,
      ...body
    } = source;
    const proposal: SheetDrawing[] = [
      {
        ...owner,
        members: owner.members.map((node) => (node === source ? { ...body, kind: "shape" } : node)),
      },
    ];
    const before = serializeWorkbook(f.workbook);
    expect(f.actions.replaceCollection(proposal, expected, f.metrics)).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
  });

  test.each(["source", "tree", "flip"] as const)(
    "changed-root preparation cannot remove an owned Equation %s",
    (change) => {
      const f = fixture(groupedForest()),
        expected = f.sheet.drawings!;
      const proposal = [{ ...group(expected), name: "Changed group" }];
      f.prepare.mockImplementationOnce((root) => corruptOwned(root, change));
      const before = serializeWorkbook(f.workbook);
      expect(f.actions.replaceCollection(proposal, expected, f.metrics)).toBe(false);
      expect(f.prepare).toHaveBeenCalledOnce();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test("real group, owned nudge/90-degree rotation, two flips and release retain source with exact Undo", () => {
    const f = fixture([framedEquation(), framedEquation("sibling", false)]);
    const initial = serializeWorkbook(f.workbook),
      source = f.sheet.drawings![0]!;
    if (!isFramedEquationDrawing(source)) throw new Error("Expected framed Equation.");
    const grouped = groupShapeRoots(
      f.sheet.drawings!,
      ["math", "sibling"],
      { id: "owner", name: "Math group" },
      f.metrics,
    );
    expect(f.actions.replaceCollection(grouped, f.sheet.drawings!, f.metrics)).toBe(true);
    f.paths.value = [["owner", "math"]];
    let root = group(f.sheet.drawings!);
    const leaf = resolveShapeGroupProjection(root, f.metrics).leaves[0]!;
    const originalRect = leaf.layout!.rect;
    const moved = updateResolvedShapeGroupLeaf(
      leaf,
      {
        ...leaf.view!,
        offsetX: leaf.view!.offsetX + 6,
        offsetY: leaf.view!.offsetY + 3,
      },
      f.metrics,
    );
    expect(f.actions.replaceCollection([moved], f.sheet.drawings!, f.metrics)).toBe(true);
    const movedRect = resolveShapeGroupProjection(group(f.sheet.drawings!), f.metrics).leaves[0]!
      .layout!.rect;
    expect(movedRect.x).toBeCloseTo(originalRect.x + 6);
    expect(movedRect.y).toBeCloseTo(originalRect.y + 3);
    expect(movedRect.width).toBeCloseTo(originalRect.width);
    expect(movedRect.height).toBeCloseTo(originalRect.height);
    expect(f.controls.snapshot.value!.canRotate).toBe(true);
    expect(f.controls.snapshot.value!.actionHandler("rotate-right")).toBe(true);
    root = group(f.sheet.drawings!);
    expect(math(root).rotation).toBeCloseTo(source.rotation + 90);
    const beforeFlip = serializeWorkbook(f.workbook);
    expect(f.controls.snapshot.value!.canFlip).toBe(true);
    expect(f.controls.snapshot.value!.actionHandler("flip-horizontal")).toBe(true);
    expect(math(group(f.sheet.drawings!)).equationFlipX).toBeUndefined();
    expect(f.controls.snapshot.value!.actionHandler("flip-horizontal")).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(beforeFlip);
    expectSource(math(group(f.sheet.drawings!)), source);
    const releaseBefore = serializeWorkbook(f.workbook);
    expect(
      f.actions.replaceCollection(
        ungroupShapeRoot(f.sheet.drawings!, "owner", f.metrics),
        f.sheet.drawings!,
        f.metrics,
      ),
    ).toBe(true);
    expect(f.sheet.drawings!.map((node) => node.id)).toEqual(["math", "sibling"]);
    const released = f.sheet.drawings![0]!;
    if (!isFramedEquationDrawing(released)) throw new Error("Expected released math frame.");
    expectSource(released, source);
    expect(released).not.toHaveProperty("groupFrame");
    expect(serializeWorkbook(deserializeWorkbook(serializeWorkbook(f.workbook)))).toEqual(
      serializeWorkbook(f.workbook),
    );
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.workbook)).toEqual(releaseBefore);
    while (undoWorkbookCommand(f.session)) f.revision.value++;
    expect(serializeWorkbook(f.workbook)).toEqual(initial);
  });

  test("canonical root and owned Equation controls support H/V/90/hide without ordinary body fields", () => {
    for (const owned of [false, true]) {
      const f = fixture(owned ? groupedForest() : [framedEquation()]);
      f.paths.value = [owned ? ["owner", "math"] : ["math"]];
      const source = owned ? math(group(f.sheet.drawings!)) : f.sheet.drawings![0]!;
      if (source.kind !== "equation") throw new Error("Expected math source.");
      expect(f.controls.snapshot.value!.canFlip).toBe(true);
      expect(f.controls.snapshot.value!.canRotate).toBe(true);
      expect(f.controls.snapshot.value!.canFormat).toBe(false);
      for (const action of [
        "flip-horizontal",
        "flip-horizontal",
        "flip-vertical",
        "flip-vertical",
      ] as const)
        expect(f.controls.snapshot.value!.actionHandler(action)).toBe(true);
      expect(f.controls.snapshot.value!.actionHandler("rotate-right")).toBe(true);
      const path = owned ? ["owner", "math"] : ["math"];
      expect(f.controls.snapshot.value!.visibilityHandler(path, true)).toBe(true);
      const hidden = owned ? math(group(f.sheet.drawings!)) : f.sheet.drawings![0]!;
      if (hidden.kind !== "equation") throw new Error("Expected hidden math.");
      expectSource(hidden, source);
      expect(hidden).toHaveProperty("hidden", true);
      expect(hidden.rotation).toBeCloseTo(source.rotation + 90);
      expect(hidden).not.toHaveProperty("shapeGeometry");
      expect(f.controls.snapshot.value!.visibilityHandler(path, false)).toBe(true);
      const shown = owned ? math(group(f.sheet.drawings!)) : f.sheet.drawings![0]!;
      expect(shown).not.toHaveProperty("hidden");
      expect(f.session.history.undoStack).toHaveLength(7);
    }
  });

  test("hiding legacy math promotes only exact world placement to a dedicated fixed frame and Undo restores legacy type", () => {
    const f = fixture([{ ...equationDrawing(), equationFlipX: true, equationFlipY: true }]);
    const source = f.sheet.drawings![0]!;
    if (
      source.kind !== "equation" ||
      isFramedEquationDrawing(source) ||
      !isShapeGroupEligibleRoot(source)
    )
      throw new Error("Expected legacy math.");
    const before = serializeWorkbook(f.workbook),
      layout = resolveShapeRootLayout(source, f.metrics);
    expect(f.controls.snapshot.value!.visibilityHandler(["math"], true)).toBe(true);
    const hidden = f.sheet.drawings![0]!;
    if (!isFramedEquationDrawing(hidden)) throw new Error("Expected promoted math frame.");
    expectSource(hidden, source);
    expect(hidden.shapeFrame).toEqual({
      kind: "shape-frame-v1",
      anchor: {
        mode: "fixed",
        x: layout.rect.x,
        y: layout.rect.y,
        size: { width: layout.rect.width, height: layout.rect.height },
      },
    });
    expect(hidden.rotation).toBe(source.rotation);
    expect(hidden.hidden).toBe(true);
    expect(hidden).not.toHaveProperty("anchor");
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    f.revision.value++;
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.sheet.drawings![0]).not.toHaveProperty("shapeFrame");
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("visibility-only collection rejects style, frame and source changes, including forged legacy promotion", () => {
    for (const change of ["style", "frame", "source", "tree", "flip"] as const) {
      const f = fixture([equationDrawing()]),
        expected = f.sheet.drawings!;
      const promoted = promoteEquationRootFrame(expected[0]!, f.metrics);
      const next = { ...promoted, hidden: true as const };
      if (change === "style") next.color = "#123456";
      else if (change === "frame") {
        if (next.shapeFrame.anchor.mode !== "fixed") throw new Error("Expected fixed promotion.");
        next.shapeFrame = {
          ...next.shapeFrame,
          anchor: { ...next.shapeFrame.anchor, x: next.shapeFrame.anchor.x + 1 },
        };
      } else if (change === "source") next.text += " changed";
      else if (change === "tree") delete next.equationDocument;
      else next.equationFlipX = true;
      const before = serializeWorkbook(f.workbook);
      expect(f.actions.replaceVisibilityCollection([next], expected, f.metrics)).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
    }
  });

  test("copying an Equation-containing group creates fresh drawing IDs while preserving exact local math IDs and flags", () => {
    const f = clipboardFixture(groupedForest());
    scopes.push(f.scope);
    const root = group(f.source.drawings!),
      source = math(root);
    f.select([["owner"]]);
    expect(f.clipboard.copy()).toBe(true);
    const before = serializeWorkbook(f.workbook);
    expect(f.clipboard.paste()).toBe(true);
    const pasted = group(f.source.drawings!.slice(1));
    expect(pasted.id).not.toBe(root.id);
    const copy = pasted.members.find((node) => node.kind === "equation")!;
    if (!isSheetGroupedEquationDrawing(copy)) throw new Error("Expected copied math.");
    expect(copy.id).not.toBe(source.id);
    expectSource(copy, source);
    expect(copy.groupFrame).toEqual(source.groupFrame);
    expect(copy.equationDocument).not.toBe(source.equationDocument);
    expect(f.session.history.undoStack).toHaveLength(1);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("owned Equation Cut across sheets supplies exact fresh-ID provenance and retains uncut release plus one atomic Undo", () => {
    const placement = getActiveSheet(createWorkbook({ id: "cut", sheetId: "cut-sheet" }));
    const forest = groupShapeRoots(
      [framedEquation(), framedEquation("sibling", false)],
      ["math", "sibling"],
      { id: "owner", name: "Two equations" },
      createPictureSheetMetrics(placement),
    );
    const f = clipboardFixture(forest);
    scopes.push(f.scope);
    const source = math(group(f.source.drawings!)),
      sibling = math(group(f.source.drawings!), "sibling");
    f.select([["owner", "math"]]);
    expect(f.clipboard.cut()).toBe(true);
    expect(f.source.drawings).toHaveLength(1);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.navigate();
    const before = serializeWorkbook(f.workbook);
    expect(f.clipboard.paste()).toBe(true);
    expect(f.replaceCollections).toHaveBeenCalledOnce();
    const collections = f.replaceCollections.mock.calls[0]![0];
    expect(collections[1].equationSources).toEqual([{ sourceId: "math", targetId: "fresh-1" }]);
    expect(f.source.drawings!.map((node) => node.id)).toEqual(["sibling"]);
    const released = f.source.drawings![0]!,
      target = f.target.drawings![0]!;
    if (!isFramedEquationDrawing(released) || !isFramedEquationDrawing(target))
      throw new Error("Expected independent math root frames.");
    expectSource(released, sibling);
    expectSource(target, source);
    expect(target.id).toBe("fresh-1");
    expect(target).not.toHaveProperty("groupFrame");
    expect(f.clipboard.hasPending()).toBe(false);
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.execute.mock.calls[0]![0].type).toBe("replaceSheetDrawingCollections");
    expect(f.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.workbook);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("foreign mathematical proposals and transfer preparation reject source/tree/flag loss with zero history", () => {
    for (const stage of ["proposal", "preparation"] as const)
      for (const change of ["source", "tree", "flip"] as const) {
        const f = clipboardFixture([framedEquation()]);
        scopes.push(f.scope);
        const source = f.source.drawings![0]!;
        if (!isFramedEquationDrawing(source)) throw new Error("Expected source math.");
        f.navigate();
        let incoming = { ...structuredClone(source), id: "fresh-math" };
        if (stage === "proposal") incoming = corruptEquation(incoming, change);
        else
          f.prepareTransfer.mockImplementation((_sheet, _metrics, drawing) => {
            if (!isFramedEquationDrawing(drawing)) return drawing;
            return corruptEquation(drawing, change);
          });
        const before = serializeWorkbook(f.workbook);
        expect(
          f.replaceCollections(
            [
              {
                sheet: f.source,
                expected: f.source.drawings!,
                next: [],
                metrics: createPictureSheetMetrics(f.source),
              },
              {
                sheet: f.target,
                expected: [],
                next: [incoming],
                metrics: createPictureSheetMetrics(f.target),
                equationSources: [{ sourceId: "math", targetId: "fresh-math" }],
              },
            ],
            () => true,
          ),
        ).toBe(false);
        expect(serializeWorkbook(f.workbook)).toEqual(before);
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.session.history.undoStack).toHaveLength(0);
      }
  });
});
