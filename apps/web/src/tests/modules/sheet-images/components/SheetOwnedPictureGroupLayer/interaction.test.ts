import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test, vi } from "vitest";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { resolvePictureGroup } from "@sheetcraft/core/picture-group-layout";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import SheetOwnedPictureGroupLayer from "../../../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import { createAppI18n } from "../../../../../shared/i18n";
import { pictureGroup } from "../../picture-group-fixture";
import { framedPicture } from "../../framed-picture-fixture";

function fixture(selected = true, useCallback = true) {
  const sheet = createSheet("Synthetic", "sheet");
  const geometry = createSheetGeometry({ rowCount: 20, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 600, height: 400 },
  });
  const frameContext = { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
  const group = pictureGroup();
  group.frame.anchor = { mode: "fixed", x: 100, y: 80, size: { width: 200, height: 100 } };
  group.frame.angleDeg = 0;
  group.members[0]!.frame.angleDeg = 0;
  group.members[0]!.frame.rect.widthRatio = 0.5;
  const other = framedPicture();
  other.id = "other";
  other.frame.anchor = { mode: "fixed", x: 380, y: 100, size: { width: 120, height: 80 } };
  other.frame.angleDeg = 0;
  const roots: FloatingImage[] = [group, other];
  const owner = {};
  const apply = vi.fn((_next: readonly FloatingImage[]) => true);
  const wrapper = mount(SheetOwnedPictureGroupLayer, {
    attachTo: document.body,
    props: {
      roots,
      owner,
      revision: 1,
      layout,
      frameContext,
      selectedRootId: selected ? group.id : null,
      ...(useCallback ? { applyUpdateMany: apply } : {}),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  const api = wrapper.vm as unknown as {
    handleSurfacePointerDown: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    handleSurfacePointerMove: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    handleSurfacePointerUp: (event: PointerEvent) => boolean;
    handleSurfacePointerCancel: (event: PointerEvent) => boolean;
    handleSurfaceDoubleClick: (event: MouseEvent, point: { x: number; y: number }) => boolean;
    getSurfaceCursor: (point: { x: number; y: number }) => string | undefined;
    getPaintState: () => { images: readonly FloatingImage[] };
  };
  function event(type: string, options: MouseEventInit = {}): PointerEvent {
    const event = new MouseEvent(type, { bubbles: true, button: 0, ...options }) as PointerEvent;
    Object.defineProperties(event, {
      pointerId: { value: 3 },
      currentTarget: { value: wrapper.element },
    });
    return event;
  }
  return { group, other, roots, owner, layout, frameContext, apply, wrapper, api, event };
}

describe("SheetOwnedPictureGroupLayer real ownership", () => {
  test("the first click selects the real root, the next single click selects its genuine child", async () => {
    const f = fixture(false);
    expect(f.wrapper.findAll("img, [data-image-resize]")).toHaveLength(0);
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 150, y: 130 })).toBe(true);
    expect(f.wrapper.emitted("select")).toEqual([[f.group.id]]);
    expect(f.wrapper.emitted("selectPath")).toEqual([[null]]);
    await f.wrapper.setProps({ selectedRootId: f.group.id });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.findAll("[data-image-resize]")).toHaveLength(8);
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 150, y: 130 });
    const path = [f.group.id, f.group.members[0]!.id];
    expect(f.wrapper.emitted("selectPath")?.at(-1)).toEqual([path]);
    await f.wrapper.setProps({ selectedPath: path });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.wrapper.findAll("[data-passive-outline]")).toHaveLength(1);
    expect(f.wrapper.findAll("[data-image-resize]")).toHaveLength(8);
    expect(f.wrapper.findAll("[data-image-rotate]")).toHaveLength(1);
    f.wrapper.unmount();
  });
  test("root-gap move emits one full-forest preview and one atomic transaction", () => {
    const f = fixture();
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 295, y: 160 });
    expect(f.api.getPaintState().images).toMatchObject([
      { id: f.group.id, frame: { anchor: { x: 120, y: 110 } } },
      { id: "other" },
    ]);
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0]).toHaveLength(2);
    expect(f.apply.mock.calls[0]![0][1]).toEqual(f.other);
    expect(f.api.getPaintState().images).toEqual(f.roots);
    f.wrapper.unmount();
  });
  test("ordinary multi-selection body movement retains every root and clears no root selection", async () => {
    const f = fixture();
    await f.wrapper.setProps({ selectedRootIds: [f.group.id, f.other.id] });
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 150, y: 130 });
    expect(f.wrapper.emitted("select")).toBeUndefined();
    expect(f.wrapper.emitted("selectPath")).toEqual([[null]]);
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 170, y: 160 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0]).toMatchObject([
      { frame: { anchor: { x: 120, y: 110 } } },
      { frame: { anchor: { x: 400, y: 130 } } },
    ]);
    f.wrapper.unmount();
  });
  test("owned child body movement changes its real local frame while parent and other root stay stable", async () => {
    const f = fixture();
    const path = [f.group.id, f.group.members[0]!.id];
    await f.wrapper.setProps({ selectedPath: path });
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 150, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 170, y: 160 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    const next = f.apply.mock.calls[0]![0];
    expect(next[0]).toMatchObject({
      frame: f.group.frame,
      members: [
        {
          frame: {
            rect: { xRatio: 0.1, yRatio: 0.3, widthRatio: 0.5, heightRatio: 1 },
          },
        },
      ],
    });
    expect(next[1]).toEqual(f.other);
    f.wrapper.unmount();
  });
  test("global highest standalone hit is never intercepted by a selected group's body or gap", async () => {
    const f = fixture();
    f.other.frame.anchor = { mode: "fixed", x: 120, y: 90, size: { width: 160, height: 80 } };
    await f.wrapper.setProps({ roots: [f.group, f.other] });
    for (const point of [
      { x: 150, y: 130 },
      { x: 250, y: 130 },
    ]) {
      expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), point)).toBe(false);
      expect(f.api.getSurfaceCursor(point)).toBeUndefined();
    }
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("select")).toBeUndefined();
    f.wrapper.unmount();
  });
  test("pointer cancellation and return-to-origin cannot commit a stale preview", () => {
    const f = fixture();
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 295, y: 160 });
    f.api.handleSurfacePointerCancel(f.event("pointercancel"));
    expect(f.api.getPaintState().images).toEqual(f.roots);
    expect(f.apply).not.toHaveBeenCalled();
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 295, y: 160 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 275, y: 130 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  test("Escape from inner selection cancels a gesture and clears all selection", async () => {
    const f = fixture();
    const path = [f.group.id, f.group.members[0]!.id];
    await f.wrapper.setProps({ selectedPath: path });
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 150, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 170, y: 160 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(f.api.getPaintState().images).toEqual(f.roots);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("select")?.at(-1)).toEqual([null]);
    expect(f.wrapper.emitted("selectPath")?.at(-1)).toEqual([null]);
    f.wrapper.unmount();
  });
  test("owner, revision, frame context, selection and readonly changes cancel before commit", async () => {
    for (const change of ["owner", "revision", "frameContext", "selection", "readOnly"] as const) {
      const f = fixture();
      f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
      f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 295, y: 160 });
      const update =
        change === "owner"
          ? { owner: {} }
          : change === "revision"
            ? { revision: 2 }
            : change === "frameContext"
              ? { frameContext: { ...f.frameContext } }
              : change === "selection"
                ? { selectedRootId: null }
                : { readOnly: true };
      await f.wrapper.setProps(update);
      f.api.handleSurfacePointerUp(f.event("pointerup"));
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.api.getPaintState().images).toEqual(f.roots);
      f.wrapper.unmount();
    }
  });
  test("in-place source/membership changes are rejected from the detached snapshot", () => {
    const f = fixture();
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 295, y: 160 });
    const child = f.group.members[0]!;
    if (child.kind !== "grouped-picture-v1") throw new Error("Fixture requires a leaf.");
    child.assetId = "replacement-asset";
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.api.getPaintState().images).toEqual(f.roots);
    f.wrapper.unmount();
  });
  test("callback rejection retains stable roots and selection with failure feedback", () => {
    const f = fixture();
    f.apply.mockReturnValue(false);
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 295, y: 160 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.api.getPaintState().images).toEqual(f.roots);
    expect(f.wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    expect(f.wrapper.emitted("select")?.at(-1)).toEqual([f.group.id]);
    expect(f.wrapper.emitted("updateMany")).toBeUndefined();
    f.wrapper.unmount();
  });
  test("emit-only ownership requests a full-forest update without retaining an optimistic paint", () => {
    const f = fixture(true, false);
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 295, y: 160 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.wrapper.emitted("updateMany")?.[0]?.[0]).toMatchObject([
      { frame: { anchor: { x: 120, y: 110 } } },
      { id: f.other.id },
    ]);
    expect(f.api.getPaintState().images).toEqual(f.roots);
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  test("child keyboard nudge is one pixel or Shift ten and clipboard/delete use exact owner path", async () => {
    const f = fixture();
    const path = [f.group.id, f.group.members[0]!.id];
    await f.wrapper.setProps({ selectedPath: path });
    const selected = f.wrapper.get(`[data-owned-picture-selected='${path.join("/")}']`);
    await selected.trigger("keydown", { key: "ArrowRight" });
    let group = f.apply.mock.calls[0]![0][0] as typeof f.group;
    expect(
      resolvePictureGroup(group, f.frameContext.metrics).members[0]!.layout!.rect.x,
    ).toBeCloseTo(101);
    await selected.trigger("keydown", { key: "ArrowDown", shiftKey: true });
    group = f.apply.mock.calls[1]![0][0] as typeof f.group;
    expect(
      resolvePictureGroup(group, f.frameContext.metrics).members[0]!.layout!.rect.y,
    ).toBeCloseTo(90);
    await selected.trigger("keydown", { key: "c", ctrlKey: true });
    await selected.trigger("keydown", { key: "x", ctrlKey: true });
    await selected.trigger("keydown", { key: "Delete" });
    expect(f.wrapper.emitted("copy")).toEqual([[path, f.owner]]);
    expect(f.wrapper.emitted("cut")).toEqual([[path, f.owner]]);
    expect(f.wrapper.emitted("delete")).toEqual([[path, f.owner]]);
    f.wrapper.unmount();
  });
  test("fields, IME and unrelated global key presses do not steal keyboard events", async () => {
    const f = fixture();
    const selected = f.wrapper.get("[data-owned-picture-selected]");
    await selected.trigger("keydown", { key: "ArrowRight", isComposing: true });
    const input = document.createElement("input");
    selected.element.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("copy")).toBeUndefined();
    f.wrapper.unmount();
  });
  test("read-only keeps root and child selection but never starts edits", async () => {
    const f = fixture(false);
    await f.wrapper.setProps({ readOnly: true });
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 150, y: 130 });
    expect(f.wrapper.emitted("select")).toEqual([[f.group.id]]);
    await f.wrapper.setProps({ selectedRootId: f.group.id });
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 150, y: 130 });
    expect(f.wrapper.emitted("selectPath")?.at(-1)).toEqual([[f.group.id, f.group.members[0]!.id]]);
    expect(f.wrapper.findAll("[data-image-resize]")).toHaveLength(0);
    expect(f.api.getSurfaceCursor({ x: 150, y: 130 })).toBeUndefined();
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  test("Ctrl click adds the group root and double click performs no fake-asset preview", () => {
    const f = fixture(false);
    expect(
      f.api.handleSurfacePointerDown(f.event("pointerdown", { ctrlKey: true }), { x: 150, y: 130 }),
    ).toBe(true);
    expect(f.wrapper.emitted("select")).toEqual([[f.group.id, true]]);
    expect(f.api.handleSurfaceDoubleClick(f.event("dblclick"), { x: 150, y: 130 })).toBe(true);
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
  test("minimal toolbar emits the root ungroup command and exact formatting path", async () => {
    const f = fixture();
    await nextTick();
    const toolbar = document.querySelector<HTMLElement>("[data-picture-group-toolbar]")!;
    toolbar.querySelector<HTMLButtonElement>("[data-picture-group-action='ungroup']")!.click();
    toolbar.querySelector<HTMLButtonElement>("[data-picture-group-action='format']")!.click();
    expect(f.wrapper.emitted("ungroup")).toEqual([[f.group.id]]);
    expect(f.wrapper.emitted("format")).toEqual([[[f.group.id], f.owner]]);
    toolbar.querySelector<HTMLButtonElement>("[data-picture-group-action='fill']")!.click();
    toolbar.querySelector<HTMLButtonElement>("[data-picture-group-action='line']")!.click();
    expect(f.wrapper.emitted("format")?.slice(1)).toEqual([
      [[f.group.id], f.owner, "fill"],
      [[f.group.id], f.owner, "line"],
    ]);
    await f.wrapper.setProps({ selectedPath: [f.group.id, f.group.members[0]!.id] });
    expect(document.querySelector("[data-picture-group-action='ungroup']")).toBeNull();
    f.wrapper.unmount();
  });
  test("group side resize at 37 degrees holds its opposite rotated edge without changing height", async () => {
    const f = fixture();
    f.group.frame.angleDeg = 37;
    await f.wrapper.setProps({ roots: [f.group, f.other] });
    const before = resolvePictureGroup(f.group, f.frameContext.metrics).layout;
    await f.wrapper.get("[data-image-resize='e']").trigger("pointerdown", {
      button: 0,
      pointerId: 3,
      clientX: 0,
      clientY: 0,
    });
    const angle = (37 * Math.PI) / 180;
    f.api.handleSurfacePointerMove(f.event("pointermove"), {
      x: 40 * Math.cos(angle),
      y: 40 * Math.sin(angle),
    });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    const next = f.apply.mock.calls[0]![0][0] as typeof f.group;
    const after = resolvePictureGroup(next, f.frameContext.metrics).layout;
    expect(after.rect.width).toBeCloseTo(240);
    expect(after.rect.height).toBe(100);
    for (const index of [0, 3]) {
      expect(after.corners[index]!.x).toBeCloseTo(before.corners[index]!.x);
      expect(after.corners[index]!.y).toBeCloseTo(before.corners[index]!.y);
    }
    expect(next.members).toEqual(f.group.members);
    f.wrapper.unmount();
  });
  test("inner resize uses its real owner inverse and has no active parent handles", async () => {
    const f = fixture();
    f.group.frame.angleDeg = 23;
    f.group.members[0]!.frame.angleDeg = 37;
    const path = [f.group.id, f.group.members[0]!.id];
    await f.wrapper.setProps({ roots: [f.group, f.other], selectedPath: path });
    const before = resolvePictureGroup(f.group, f.frameContext.metrics).members[0]!.layout!;
    const inner = f.wrapper.get(`[data-owned-picture-selected='${path.join("/")}']`);
    await inner.get("[data-image-resize='e']").trigger("pointerdown", {
      button: 0,
      pointerId: 3,
      clientX: 0,
      clientY: 0,
    });
    const angle = (60 * Math.PI) / 180;
    f.api.handleSurfacePointerMove(f.event("pointermove"), {
      x: 40 * Math.cos(angle),
      y: 40 * Math.sin(angle),
    });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    const next = f.apply.mock.calls[0]![0][0] as typeof f.group;
    const after = resolvePictureGroup(next, f.frameContext.metrics).members[0]!.layout!;
    expect(next.frame).toEqual(f.group.frame);
    expect(after.rect.width).toBeCloseTo(140);
    expect(after.rect.height).toBeCloseTo(100);
    for (const index of [0, 3]) {
      expect(after.corners[index]!.x).toBeCloseTo(before.corners[index]!.x);
      expect(after.corners[index]!.y).toBeCloseTo(before.corners[index]!.y);
    }
    f.wrapper.unmount();
  });
  test("multi-root side handle applies the same factor around each member's own edge", async () => {
    const f = fixture();
    await f.wrapper.setProps({ selectedRootIds: [f.group.id, f.other.id] });
    await f.wrapper.get("[data-image-resize='e']").trigger("pointerdown", {
      button: 0,
      pointerId: 3,
      clientX: 0,
      clientY: 0,
    });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 40, y: 0 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0]).toMatchObject([
      { frame: { anchor: { x: 100, y: 80, size: { width: 240, height: 100 } } } },
      { frame: { anchor: { x: 380, y: 100, size: { width: 144, height: 80 } } } },
    ]);
    f.wrapper.unmount();
  });
  test("the root rotation handle accepts arbitrary pointer angles about the actual center", async () => {
    const f = fixture();
    await f.wrapper.get("[data-image-rotate]").trigger("pointerdown", {
      button: 0,
      pointerId: 3,
      clientX: 200,
      clientY: 56,
    });
    const angle = (13.75 * Math.PI) / 180;
    f.api.handleSurfacePointerMove(f.event("pointermove"), {
      x: 200 + 74 * Math.sin(angle),
      y: 130 - 74 * Math.cos(angle),
    });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    const next = f.apply.mock.calls[0]![0][0] as typeof f.group;
    expect(next.frame.angleDeg).toBeCloseTo(13.75);
    expect(next.frame.anchor).toEqual(f.group.frame.anchor);
    expect(next.members).toEqual(f.group.members);
    f.wrapper.unmount();
  });
  test("multi-root arbitrary rotation refuses without a partial transaction", async () => {
    const f = fixture();
    await f.wrapper.setProps({ selectedRootIds: [f.group.id, f.other.id] });
    await f.wrapper.get("[data-image-rotate]").trigger("pointerdown", {
      button: 0,
      pointerId: 3,
      clientX: 200,
      clientY: 56,
    });
    expect(f.wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.api.getPaintState().images).toEqual(f.roots);
    f.wrapper.unmount();
  });
  test("deferred selection focus cannot cross a newer owner or steal focus from a newly focused input", async () => {
    const f = fixture();
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 275, y: 130 });
    const changed = f.wrapper.setProps({ owner: {} });
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    await changed;
    await nextTick();
    expect(document.activeElement).toBe(input);
    expect(f.apply).not.toHaveBeenCalled();
    input.remove();
    f.wrapper.unmount();
  });
});

test("a root permission controls a grouped leaf; denied roots are not selected and a permission loss cancels edits", async () => {
  const f = fixture(false),
    allowed = { value: false };
  await f.wrapper.setProps({ canEditRoot: () => allowed.value });
  const point = { x: 120, y: 100 };
  expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), point)).toBe(false);
  expect(f.wrapper.emitted("select")).toBeUndefined();
  expect(f.apply).not.toHaveBeenCalled();
  allowed.value = true;
  await f.wrapper.setProps({ canEditRoot: () => allowed.value });
  expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), point)).toBe(true);
  await f.wrapper.setProps({ selectedRootId: f.group.id });
  await nextTick();
  f.api.handleSurfacePointerMove(f.event("pointermove"), { x: point.x + 30, y: point.y + 20 });
  allowed.value = false;
  await f.wrapper.setProps({ canEditRoot: () => allowed.value });
  f.api.handleSurfacePointerUp(f.event("pointerup"));
  expect(f.apply).not.toHaveBeenCalled();
  f.wrapper.unmount();
});
