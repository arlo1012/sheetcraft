import { computed, ref } from "vue";
import { createGraphicDrawing } from "./drawing-defaults";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  isFramedShapeDrawing,
  type SheetFramedGraphicDrawing,
  type SheetDrawing,
  type SheetGraphicDrawing,
  type SheetGraphicKind,
  normalizeSheetDrawings,
  normalizeSheetDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  canEditShapeObject,
  canEditSheetDrawingCollection,
} from "@sheetcraft/core/shape-protection";
import type { ShapeGroupDrawing, ShapeGroupPath } from "@sheetcraft/core/shape-group";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { frameShapeView } from "./shape-view-layout";
import {
  resolveShapeDrawing,
  updateResolvedShapeDrawing,
  type ResolvedShapeDrawing,
} from "./resolved-shape-drawing";
import {
  resolveShapeGroupProjection,
  updateResolvedShapeGroupLeaf,
  type ResolvedShapeGroupLeaf,
} from "./resolved-shape-group";
import { useDrawingDialogTarget } from "../../shared/drawing-dialog/useDrawingDialogTarget";
import type { Workbook, Sheet, CellAddress } from "@sheetcraft/core/workbook";
export function useDrawingActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration?: () => number;
  getRevision?: () => number;
  getAddress: () => CellAddress;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  isBusy: () => boolean;
  name: (kind: SheetGraphicKind) => string;
  getMetrics?: () => PictureSheetMetrics | undefined;
  prepareDrawing?: (drawing: SheetDrawing, owner?: SheetDrawing) => SheetDrawing;
}) {
  const idFactory = createBrowserIdFactory();
  const targets = useDrawingDialogTarget<SheetGraphicDrawing, []>({
    ...options,
    canEditExisting: canEditShapeObject,
  });
  const { dialog, editing, close } = targets;
  const projectionRevision = ref(0);
  const dialogProjections = new WeakMap<object, ResolvedShapeDrawing>();
  const groupDialogProjections = new WeakMap<
    object,
    { leaf: ResolvedShapeGroupLeaf; revision: number | undefined }
  >();
  function validGroupDialog(
    target: NonNullable<typeof dialog.value>,
    projection: {
      leaf: ResolvedShapeGroupLeaf;
      revision: number | undefined;
    },
  ): boolean {
    const { leaf, revision } = projection;
    return (
      dialog.value === target &&
      !options.isBusy() &&
      canEditShapeObject(target.sheet, leaf.sourceRoot) &&
      target.existing === leaf.sourceRoot &&
      options.getWorkbook() === target.workbook &&
      options.getSheet() === target.sheet &&
      target.workbook.sheets.get(target.sheet.id) === target.sheet &&
      options.getGeneration?.() === target.generation &&
      options.getRevision?.() === revision &&
      options.getMetrics?.() === leaf.metrics &&
      target.sheet.drawings?.includes(leaf.sourceRoot) === true
    );
  }
  const normalizeDialogDrawing = computed(() => {
    void projectionRevision.value;
    const target = dialog.value,
      resolved = target && dialogProjections.get(target),
      group = target && groupDialogProjections.get(target);
    if (target && group) {
      return (view: SheetGraphicDrawing): SheetGraphicDrawing => {
        if (!validGroupDialog(target, group))
          throw new Error("The shape group editor owner is stale.");
        const root = updateResolvedShapeGroupLeaf(group.leaf, view, group.leaf.metrics);
        const leaf = resolveShapeGroupProjection(root, group.leaf.metrics).leaves.find(
          (item) =>
            item.path.length === group.leaf.path.length &&
            item.path.every((id, index) => id === group.leaf.path[index]),
        );
        if (!validGroupDialog(target, group) || !leaf?.view)
          throw new Error("The shape group editor owner is stale.");
        return leaf.view;
      };
    }
    if (!resolved) return undefined;
    return (view: SheetGraphicDrawing): SheetGraphicDrawing => {
      if (
        dialog.value !== target ||
        options.getMetrics?.() !== resolved.metrics ||
        options.getSheet().drawings?.find((item) => item.id === resolved.source.id) !==
          resolved.source
      )
        throw new Error("The shape editor owner is stale.");
      return resolveShapeDrawing(
        updateResolvedShapeDrawing(resolved, view, resolved.metrics),
        resolved.metrics,
      ).view as SheetGraphicDrawing;
    };
  });
  const allowed = (drawing?: SheetDrawing) =>
    !options.isBusy() &&
    (drawing
      ? canEditShapeObject(options.getSheet(), drawing)
      : canUseSheetPermission(options.getSheet(), "editObjects"));
  const canEditDialog = computed(() => {
    void projectionRevision.value;
    const target = dialog.value;
    const group = target && groupDialogProjections.get(target);
    return !!target && allowed(target.existing) && (!group || validGroupDialog(target, group));
  });
  function insert(kind: SheetGraphicKind, direction?: "horizontal" | "vertical") {
    const target = targets.prepare();
    if (!target) return;
    const initial = createGraphicDrawing(
      idFactory("drawing"),
      kind,
      options.name(kind),
      options.getAddress(),
      direction,
    );
    targets.open(target, initial, (current, next) => confirm(next, current));
  }
  function requestTextBox(direction: "horizontal" | "vertical", target = dialog.value): boolean {
    let accepted = false;
    targets.run(target, () => {
      accepted = true;
    });
    if (!accepted) return false;
    const before = dialog.value;
    insert("textBox", direction);
    return dialog.value !== before && dialog.value?.initial.kind === "textBox";
  }
  function edit(drawing: SheetGraphicDrawing | SheetFramedGraphicDrawing) {
    // Flushing an active cell can change worksheet geometry. Capture the view
    // only after target preparation has verified the surviving source owner.
    const target = targets.prepare(drawing);
    if (!target) return;
    const metrics = options.getMetrics?.();
    if (isFramedShapeDrawing(drawing) && !metrics) return;
    const resolved =
      metrics && isFramedShapeDrawing(drawing) ? resolveShapeDrawing(drawing, metrics) : undefined;
    const view = resolved
      ? (resolved.view as SheetGraphicDrawing)
      : (drawing as SheetGraphicDrawing);
    if (
      resolved &&
      (options.getMetrics?.() !== metrics ||
        options.getSheet().drawings?.find((item) => item.id === drawing.id) !== drawing)
    )
      return;
    targets.open(target, view, (current, next) => confirm(next, current, resolved));
    if (resolved && dialog.value) {
      dialogProjections.set(dialog.value, resolved);
      projectionRevision.value++;
    }
  }
  function editGroupLeaf(root: ShapeGroupDrawing, path: ShapeGroupPath): boolean {
    const target = targets.prepare(root);
    if (!target) return false;
    const metrics = options.getMetrics?.(),
      revision = options.getRevision?.();
    if (!metrics) return false;
    try {
      const leaf = resolveShapeGroupProjection(root, metrics).leaves.find(
        (item) =>
          item.path.length === path.length && item.path.every((id, index) => id === path[index]),
      );
      if (
        !leaf?.view ||
        leaf.collapsed ||
        options.getMetrics?.() !== metrics ||
        options.getRevision?.() !== revision ||
        options.getSheet() !== target.sheet ||
        options.getWorkbook() !== target.workbook ||
        options.getGeneration?.() !== target.generation ||
        !target.sheet.drawings?.includes(root)
      )
        return false;
      targets.open(target, leaf.view, (current, next) => confirm(next, current));
      const opened = dialog.value;
      if (!opened || opened.existing !== root || opened.initial !== leaf.view) return false;
      groupDialogProjections.set(opened, { leaf, revision });
      projectionRevision.value++;
      return true;
    } catch {
      return false;
    }
  }
  type CollectionBinding = {
    workbook: Workbook;
    sheet: Sheet;
    generation: number | undefined;
    revision: number | undefined;
    metrics: PictureSheetMetrics | undefined;
    expected: readonly SheetDrawing[];
    guard?: () => boolean;
  };
  let replacing = false;
  function currentCollection(binding: CollectionBinding): boolean {
    const current = binding.sheet.drawings ?? [];
    return (
      !options.isBusy() &&
      options.getWorkbook() === binding.workbook &&
      options.getSheet() === binding.sheet &&
      binding.workbook.sheets.get(binding.sheet.id) === binding.sheet &&
      options.getGeneration?.() === binding.generation &&
      options.getRevision?.() === binding.revision &&
      options.getMetrics?.() === binding.metrics &&
      current.length === binding.expected.length &&
      current.every((drawing, index) => drawing === binding.expected[index]) &&
      (binding.guard?.() ?? true)
    );
  }
  function bindCollection(
    expected: readonly SheetDrawing[],
    expectedMetrics?: PictureSheetMetrics,
    guard?: () => boolean,
  ): CollectionBinding | undefined {
    const binding: CollectionBinding = {
      workbook: options.getWorkbook(),
      sheet: options.getSheet(),
      generation: options.getGeneration?.(),
      revision: options.getRevision?.(),
      metrics: options.getMetrics?.(),
      expected: [...expected],
      guard,
    };
    if ((expectedMetrics && binding.metrics !== expectedMetrics) || !currentCollection(binding))
      return undefined;
    return binding;
  }
  function applyCollection(next: readonly SheetDrawing[], binding: CollectionBinding): boolean {
    if (replacing) return false;
    replacing = true;
    try {
      if (
        !currentCollection(binding) ||
        !canEditSheetDrawingCollection(binding.sheet, next) ||
        !currentCollection(binding)
      )
        return false;
      // Equal canonical data is a legitimate no-op, including a detached clone.
      const proposed = [...next];
      if (
        JSON.stringify(normalizeSheetDrawings(proposed)) ===
        JSON.stringify(binding.sheet.drawings ?? [])
      )
        return currentCollection(binding);
      const owners = new Map(binding.expected.map((drawing) => [drawing.id, drawing]));
      const canonicalOwners = new Map(
        normalizeSheetDrawings([...binding.expected]).map((drawing) => [
          drawing.id,
          JSON.stringify(drawing),
        ]),
      );
      const prepared: SheetDrawing[] = [];
      for (const drawing of proposed) {
        if (!currentCollection(binding)) return false;
        const id = drawing.id,
          kind = drawing.kind;
        const owner = owners.get(id);
        const unchanged =
          !!owner &&
          (drawing === owner ||
            canonicalOwners.get(id) === JSON.stringify(normalizeSheetDrawing(drawing)));
        const candidate = unchanged ? owner : (options.prepareDrawing?.(drawing, owner) ?? drawing);
        if (candidate.id !== id || candidate.kind !== kind || !currentCollection(binding))
          return false;
        prepared.push(candidate);
      }
      const command = createSetSheetDrawingsCommand(binding.sheet.id, prepared);
      if (
        !currentCollection(binding) ||
        !canEditSheetDrawingCollection(binding.sheet, command.drawings) ||
        !currentCollection(binding)
      )
        return false;
      const appliedData = JSON.stringify(command.drawings);
      const applied = () =>
        options.getWorkbook() === binding.workbook &&
        options.getSheet() === binding.sheet &&
        binding.workbook.sheets.get(binding.sheet.id) === binding.sheet &&
        options.getGeneration?.() === binding.generation &&
        JSON.stringify(binding.sheet.drawings ?? []) === appliedData;
      if (applied()) return true;
      // Recheck the complete lease immediately before the single atomic command.
      if (!currentCollection(binding)) return false;
      try {
        options.execute(command);
      } catch {
        return applied();
      }
      return applied();
    } catch {
      return false;
    } finally {
      replacing = false;
    }
  }
  function replaceCollection(
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    expectedMetrics?: PictureSheetMetrics,
  ): boolean {
    try {
      const binding = bindCollection(expected, expectedMetrics);
      return !!binding && applyCollection(next, binding);
    } catch {
      return false;
    }
  }
  function update(drawing: SheetDrawing, expected?: SheetDrawing): boolean {
    const current = options.getSheet().drawings ?? [];
    const owner = current.find((item) => item.id === drawing.id);
    if (!owner || (expected && owner !== expected) || drawing.kind !== owner.kind) return false;
    return replaceCollection(
      current.map((item) => (item === owner ? drawing : item)),
      current,
    );
  }
  function confirm(
    drawing: SheetGraphicDrawing,
    target = dialog.value,
    resolved?: ResolvedShapeDrawing,
  ) {
    resolved ??= target && dialogProjections.get(target);
    let accepted = false;
    targets.run(target, (currentTarget) => {
      if (drawing.id !== currentTarget.initial.id || drawing.kind !== currentTarget.initial.kind)
        return;
      const current = currentTarget.sheet.drawings ?? [];
      const group = groupDialogProjections.get(currentTarget);
      if (group && !validGroupDialog(currentTarget, group)) return;
      const binding = bindCollection(
        current,
        group?.leaf.metrics ?? resolved?.metrics,
        () => dialog.value === currentTarget && (!group || validGroupDialog(currentTarget, group)),
      );
      if (!binding) return;
      let candidate: SheetDrawing;
      try {
        if (group) {
          candidate = updateResolvedShapeGroupLeaf(group.leaf, drawing, group.leaf.metrics);
        } else if (currentTarget.existing && isFramedShapeDrawing(currentTarget.existing)) {
          if (
            !resolved ||
            resolved.source !== currentTarget.existing ||
            binding.metrics !== resolved.metrics
          )
            return;
          candidate = updateResolvedShapeDrawing(resolved, drawing, resolved.metrics);
        } else {
          candidate = drawing;
          if (
            !currentTarget.existing &&
            (drawing.kind === "shape" || drawing.kind === "textBox") &&
            options.getMetrics
          ) {
            if (!binding.metrics) return;
            candidate = frameShapeView(drawing, binding.metrics);
          }
        }
      } catch {
        return;
      }
      accepted = applyCollection(
        currentTarget.existing
          ? current.map((item) => (item === currentTarget.existing ? candidate : item))
          : [...current, candidate],
        binding,
      );
      if (accepted) close(currentTarget);
    });
    return accepted;
  }
  function remove(id: string) {
    const current = options.getSheet().drawings ?? [];
    if (!current.some((drawing) => drawing.id === id)) return;
    replaceCollection(
      current.filter((drawing) => drawing.id !== id),
      current,
    );
  }
  return {
    dialog,
    editing,
    canEditDialog,
    normalizeDialogDrawing,
    insert,
    edit,
    editGroupLeaf,
    update,
    replaceCollection,
    confirm,
    remove,
    close,
    requestTextBox,
  };
}
