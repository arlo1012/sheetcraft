import { afterEach, expect, vi } from "vitest";
import { effectScope, shallowRef, triggerRef } from "vue";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  isFramedPictureObject,
  normalizePictureObjectCollection,
} from "@sheetcraft/core/picture-object";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import { resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import type { ImageAppearance } from "@sheetcraft/core/workbook";
import {
  paintFramedPictureContent,
  paintGroupedPictureContent,
} from "../../../../modules/sheet-images/framed-picture-painter";
import { getDrawingThemeEffects } from "../../../../modules/sheet-images/drawing-theme-effects";
import { useOwnedPictureFormatPane } from "../../../../modules/sheet-images/useOwnedPictureFormatPane";
import {
  createPictureFormatFieldIntent,
  type PictureFormatField,
  type PictureFormatReset,
} from "../../../../modules/sheet-images/picture-format-pane-model";
import {
  sourceOwnerFixture,
  selectedNode,
  sourceState,
  type SourceOwnerKind,
} from "./source-scale/owner-fixture";

export const allThemeSuppression = {
  shadow: true,
  outline: true,
  reflection: true,
  bevel: true,
} as const;

const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
});

/** Share real Core/history geometry fixtures, with an observable workbook/theme owner. */
export function appearanceOwnerFixture(
  kind: SourceOwnerKind = "framed",
  appearance: ImageAppearance | undefined = { opacity: 0.8 },
) {
  const base = sourceOwnerFixture(kind);
  base.scope.stop();
  const node = selectedNode(base);
  node.transform = { ...node.transform, appearance };
  base.sheet.floatingImages = normalizePictureObjectCollection(base.sheet.floatingImages);
  const workbook = shallowRef(base.session.workbook);
  base.session.workbook.theme = {
    ...base.session.workbook.theme,
    effects: {
      id: "appearance-test",
      name: "Appearance test",
      shadow: "soft",
      reflection: true,
      bevel: true,
      outlineWidth: 4,
      gradient: true,
    },
  };
  const scope = effectScope();
  scopes.push(scope);
  const pane = scope.run(() =>
    useOwnedPictureFormatPane({
      getWorkbook: () => workbook.value,
      getSheet: () => base.sheet,
      getGeneration: () => base.generation.value,
      getRevision: () => base.revision.value,
      getContext: () => base.context.value,
      getSelectedPath: () => base.selectedPath.value,
      getSelectedIds: () => base.selectedIds.value,
      isBusy: () => base.busy.value,
      isOpen: () => base.open.value,
      getIntrinsicSize: () => base.intrinsic.value,
      execute: base.execute,
    }),
  )!;
  function field<F extends PictureFormatField>(
    key: F,
    value: Parameters<typeof createPictureFormatFieldIntent<F>>[2],
  ) {
    return createPictureFormatFieldIntent(
      pane.snapshot.value!,
      key,
      value,
      `appearance-${base.revision.value}-${key}`,
    );
  }
  function reset(type: PictureFormatReset = "reset-picture") {
    const snapshot = pane.snapshot.value!;
    return {
      type,
      owner: snapshot.owner,
      baseRevision: snapshot.revision,
      intentId: `appearance-${base.revision.value}-${type}`,
    };
  }
  return {
    ...base,
    pane,
    scope,
    workbook,
    field,
    reset,
    refreshTheme: () => triggerRef(workbook),
  };
}
export type AppearanceOwnerFixture = ReturnType<typeof appearanceOwnerFixture>;

export function appearanceCheckpoint(f: AppearanceOwnerFixture) {
  return {
    workbook: serializeWorkbook(f.session.workbook),
    snapshot: f.pane.snapshot.value,
    undo: [...f.session.history.undoStack],
    redo: [...f.session.history.redoStack],
  };
}
export function expectAppearanceUnchanged(
  f: AppearanceOwnerFixture,
  before: ReturnType<typeof appearanceCheckpoint>,
) {
  expect(serializeWorkbook(f.session.workbook)).toEqual(before.workbook);
  expect(f.pane.snapshot.value).toEqual(before.snapshot);
  expect(f.session.history.undoStack).toEqual(before.undo);
  expect(f.session.history.redoStack).toEqual(before.redo);
}

/** Capture actual renderer state at the draw, including canvas save/restore. */
export function paintAppearanceOwner(f: AppearanceOwnerFixture) {
  const draws: Record<string, unknown>[] = [];
  const borders: Record<string, unknown>[] = [];
  const state = {
    globalAlpha: 1,
    filter: "none",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineWidth: 1,
    strokeStyle: "#000000",
  };
  const stack: (typeof state)[] = [];
  const context = {
    ...state,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    strokeRect: vi.fn(),
  };
  context.save.mockImplementation(() =>
    stack.push(
      Object.fromEntries(
        Object.keys(state).map((key) => [key, context[key as keyof typeof state]]),
      ) as typeof state,
    ),
  );
  context.restore.mockImplementation(() => Object.assign(context, stack.pop()));
  context.drawImage.mockImplementation(() => draws.push({ ...context }));
  context.strokeRect.mockImplementation(() => borders.push({ ...context }));
  const node = selectedNode(f),
    source = sourceState(f);
  const decoded = { naturalWidth: 480, naturalHeight: 960 } as HTMLImageElement;
  const canvas = context as unknown as CanvasRenderingContext2D;
  const effects = getDrawingThemeEffects(f.session.workbook.theme);
  if (isGroupedPicture(node))
    paintGroupedPictureContent(
      canvas,
      decoded,
      node,
      resolvePictureSourceLayout(source.layout.rect, source.layout.angleDeg, node.frame.source),
      effects,
    );
  else if (isFramedPictureObject(node))
    paintFramedPictureContent(
      canvas,
      decoded,
      node,
      resolvePictureSourceLayout(source.layout.rect, source.layout.angleDeg, node.frame.source),
      effects,
    );
  else throw new TypeError("Prepared appearance painter requires a real framed leaf.");
  return { context, draws, borders };
}
