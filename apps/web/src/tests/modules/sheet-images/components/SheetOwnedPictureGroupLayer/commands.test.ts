import { mount } from "@vue/test-utils";
import { describe, expect, test, vi } from "vitest";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import SheetOwnedPictureGroupLayer from "../../../../../modules/sheet-images/components/SheetOwnedPictureGroupLayer.vue";
import SheetOwnedPictureContextMenu from "../../../../../modules/sheet-images/components/SheetOwnedPictureContextMenu.vue";
import SheetPictureSelectionToolbar from "../../../../../modules/sheet-images/components/SheetPictureSelectionToolbar.vue";
import type { OwnedPictureSelectionSnapshot } from "../../../../../modules/sheet-images/owned-picture-selection-commands";
import type {
  PictureAlignment,
  PictureAlignmentReference,
} from "../../../../../modules/sheet-images/usePictureTools";
import { createAppI18n } from "../../../../../shared/i18n";
import { pictureGroup } from "../../picture-group-fixture";
import { framedPicture } from "../../framed-picture-fixture";

function fixture() {
  const sheet = createSheet("Synthetic", "sheet");
  const geometry = createSheetGeometry({ rowCount: 20, columnCount: 20 });
  const rows = createRowVisibilityIndex({ rowCount: 20, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 700, height: 400 },
  });
  const frameContext = { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
  const group = pictureGroup();
  group.frame.anchor = { mode: "fixed", x: 100, y: 80, size: { width: 200, height: 100 } };
  group.frame.angleDeg = 0;
  group.members[0]!.frame.angleDeg = 0;
  group.members[0]!.frame.rect.widthRatio = 0.5;
  const framed = framedPicture();
  framed.frame.anchor = { mode: "fixed", x: 380, y: 100, size: { width: 120, height: 80 } };
  framed.frame.angleDeg = 0;
  const legacy: FloatingImage = {
    id: "legacy",
    assetId: "legacy-asset",
    altText: "Synthetic legacy",
    anchor: { row: 1, column: 1 },
    offsetX: 20,
    offsetY: 12,
    width: 60,
    height: 50,
  };
  const roots = [legacy, group, framed];
  const owner = {};
  const apply = vi.fn((_next: readonly FloatingImage[]): boolean => true);
  const wrapper = mount(SheetOwnedPictureGroupLayer, {
    attachTo: document.body,
    props: {
      roots,
      owner,
      revision: 1,
      layout,
      frameContext,
      selectedRootId: group.id,
      applyUpdateMany: apply,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        SheetOwnedPictureContextMenu: true,
        SheetPictureGroupToolbar: true,
      },
    },
  });
  const api = wrapper.vm as unknown as {
    getSelectionSnapshot: () => OwnedPictureSelectionSnapshot | null;
    rotateSelected: (turns: -1 | 1 | 2, snapshot?: OwnedPictureSelectionSnapshot | null) => boolean;
    flipSelected: (
      axis: "horizontal" | "vertical",
      snapshot?: OwnedPictureSelectionSnapshot | null,
    ) => boolean;
    arrangeSelection: (
      ids: readonly string[],
      action: PictureAlignment,
      reference?: PictureAlignmentReference,
      snapshot?: OwnedPictureSelectionSnapshot | null,
    ) => boolean;
    handleSurfaceContextMenu: (event: MouseEvent, point: { x: number; y: number }) => boolean;
    getPaintState: () => { images: readonly FloatingImage[] };
  };
  const menuEvent = () =>
    new MouseEvent("contextmenu", { bubbles: true, clientX: 275, clientY: 130 });
  return {
    group,
    framed,
    legacy,
    roots,
    owner,
    layout,
    frameContext,
    wrapper,
    api,
    apply,
    menuEvent,
  };
}

describe("SheetOwnedPictureGroupLayer displayed commands", () => {
  test("root commands commit the complete interleaved forest once and preserve all selection", async () => {
    const f = fixture();
    const ids = [f.group.id, f.legacy.id, f.framed.id];
    await f.wrapper.setProps({ selectedRootIds: ids });
    expect(f.api.rotateSelected(1)).toBe(true);
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0].map(({ id }) => id)).toEqual(f.roots.map(({ id }) => id));
    expect(f.apply.mock.calls[0]![0][1]).toMatchObject({
      kind: "picture-group-v1",
      frame: { angleDeg: 90 },
    });
    expect(f.apply.mock.calls[0]![0][1]).not.toHaveProperty("assetId");
    expect(f.wrapper.emitted("select")).toBeUndefined();
    expect(f.wrapper.emitted("selectPath")).toBeUndefined();
    expect(f.api.getPaintState().images).toEqual(f.roots);
    f.wrapper.unmount();
  });

  test("an inner command changes the actual leased member and never its root frame", async () => {
    const f = fixture();
    const path = [f.group.id, f.group.members[0]!.id];
    await f.wrapper.setProps({ selectedPath: path });
    expect(f.api.rotateSelected(1)).toBe(true);
    expect(f.apply.mock.calls[0]![0][1]).toMatchObject({
      frame: f.group.frame,
      members: [{ frame: { angleDeg: 90 } }],
    });
    expect(f.apply.mock.calls[0]![0][0]).toEqual(f.legacy);
    expect(f.apply.mock.calls[0]![0][2]).toEqual(f.framed);
    expect(f.api.arrangeSelection([f.group.id], "left")).toBe(false);
    expect(f.apply).toHaveBeenCalledOnce();
    f.wrapper.unmount();
  });

  test("stale exposed leases reject owner, source, member-selection and readonly drift", async () => {
    for (const change of ["owner", "source", "path", "readonly", "metrics", "layout"] as const) {
      const f = fixture();
      const lease = f.api.getSelectionSnapshot();
      if (change === "owner") await f.wrapper.setProps({ owner: {} });
      if (change === "source") f.framed.altText = "unrelated root replacement";
      if (change === "path")
        await f.wrapper.setProps({ selectedPath: [f.group.id, f.group.members[0]!.id] });
      if (change === "readonly") await f.wrapper.setProps({ readOnly: true });
      if (change === "metrics") f.frameContext.metrics = { ...f.frameContext.metrics };
      if (change === "layout") f.layout.panes.body.clip.width -= 1;
      expect(f.api.rotateSelected(1, lease)).toBe(false);
      expect(f.api.flipSelected("horizontal", lease)).toBe(false);
      expect(f.apply).not.toHaveBeenCalled();
      expect(f.wrapper.emitted("select")).toBeUndefined();
      f.wrapper.unmount();
    }
  });

  test("only an explicit true callback result succeeds and rejected plans never retain preview", () => {
    const f = fixture();
    f.apply.mockImplementation(() => 1 as unknown as boolean);
    expect(f.api.flipSelected("vertical")).toBe(false);
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    expect(f.wrapper.emitted("updateMany")).toBeUndefined();
    expect(f.api.getPaintState().images).toEqual(f.roots);
    f.wrapper.unmount();
  });

  test("mixed and frame-only toolbars use exact captured owner callbacks and emit real root IDs", async () => {
    const f = fixture();
    const ids = [f.group.id, f.framed.id, f.legacy.id];
    await f.wrapper.setProps({ selectedRootIds: ids });
    await vi.waitFor(() =>
      expect(f.wrapper.findComponent(SheetPictureSelectionToolbar).props("count")).toBe(3),
    );
    const toolbar = f.wrapper.findComponent(SheetPictureSelectionToolbar);
    expect(toolbar.exists()).toBe(true);
    expect(toolbar.props("count")).toBe(3);
    const captured = toolbar.vm.$.vnode.props!;
    const key = toolbar.props("selectionKey") as string;
    const align = captured.onAlign as (
      action: PictureAlignment,
      reference: PictureAlignmentReference,
      key: string,
    ) => void;
    const group = captured.onGroup as (key: string) => void;
    group(key);
    expect(f.wrapper.emitted("group")).toEqual([[ids]]);
    await f.wrapper.setProps({ owner: {} });
    align("left", "selection", key);
    group(key);
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.emitted("group")).toHaveLength(1);
    await f.wrapper.setProps({
      selectedRootId: f.framed.id,
      selectedRootIds: [f.legacy.id, f.framed.id],
    });
    expect(f.wrapper.findComponent(SheetPictureSelectionToolbar).props("count")).toBe(2);
    const current = f.wrapper.findComponent(SheetPictureSelectionToolbar);
    current.vm.$emit("align", "left", "selection", current.props("selectionKey"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0][1]).toEqual(f.group);
    await f.wrapper.setProps({ selectedRootId: f.legacy.id, selectedRootIds: [f.legacy.id] });
    expect(f.wrapper.findComponent(SheetPictureSelectionToolbar).exists()).toBe(false);
    f.wrapper.unmount();
  });

  test("a stale menu action cannot act on or dismiss a later reopened menu", async () => {
    const f = fixture();
    expect(f.api.handleSurfaceContextMenu(f.menuEvent(), { x: 275, y: 130 })).toBe(true);
    await f.wrapper.vm.$nextTick();
    const first = f.wrapper.findComponent(SheetOwnedPictureContextMenu);
    const oldDelete = first.vm.$.vnode.props!.onDelete as () => void;
    const oldClose = first.vm.$.vnode.props!.onClose as (restore: boolean) => void;
    expect(f.api.handleSurfaceContextMenu(f.menuEvent(), { x: 275, y: 130 })).toBe(true);
    await f.wrapper.vm.$nextTick();
    oldDelete();
    oldClose(false);
    expect(f.wrapper.emitted("delete")).toBeUndefined();
    expect(f.wrapper.findComponent(SheetOwnedPictureContextMenu).exists()).toBe(true);
    f.wrapper.findComponent(SheetOwnedPictureContextMenu).vm.$emit("delete");
    expect(f.wrapper.emitted("delete")).toEqual([[[f.group.id], f.owner]]);
    f.wrapper.unmount();
  });

  test("keyboard menu targets the actual inner path, allows readonly copy and blocks mutation", async () => {
    const f = fixture();
    const path = [f.group.id, f.group.members[0]!.id];
    await f.wrapper.setProps({ selectedPath: path, readOnly: true });
    const active = f.wrapper.find("[data-owned-picture-selected]:not([data-passive-outline])");
    await active.trigger("keydown", { key: "F10", shiftKey: true });
    const menu = f.wrapper.findComponent(SheetOwnedPictureContextMenu);
    expect(menu.exists()).toBe(true);
    expect(menu.props("canUngroup")).toBe(false);
    expect(menu.props("readOnly")).toBe(true);
    const oldCut = menu.vm.$.vnode.props!.onCut as () => void;
    oldCut();
    expect(f.wrapper.emitted("cut")).toBeUndefined();
    await active.trigger("keydown", { key: "ContextMenu" });
    f.wrapper.findComponent(SheetOwnedPictureContextMenu).vm.$emit("copy");
    expect(f.wrapper.emitted("copy")).toEqual([[path, f.owner]]);
    expect(f.apply).not.toHaveBeenCalled();
    f.wrapper.unmount();
  });
});

test.each(["replace", "save", "crop", "annotate", "preview"] as const)(
  "real owned source %s uses the exact path and closed instance cannot retarget",
  async (action) => {
    const f = fixture(),
      path = [f.group.id, f.group.members[0]!.id];
    await f.wrapper.setProps({
      selectedPath: path,
      assetUrls: new Map([["synthetic-asset", "blob:source"]]),
    });
    const selected = f.wrapper.get("[data-owned-picture-selected]:not([data-passive-outline])");
    await selected.trigger("keydown", { key: "ContextMenu" });
    const old = f.wrapper.getComponent(SheetOwnedPictureContextMenu),
      key = `on${action[0]!.toUpperCase()}${action.slice(1)}`,
      callback = old.vm.$.vnode.props![key] as () => void;
    expect(old.props("canSource")).toBe(true);
    expect(old.props("sourceUnavailable")).toBe(false);
    old.vm.$emit("close", false);
    await f.wrapper.vm.$nextTick();
    await selected.trigger("keydown", { key: "ContextMenu" });
    callback();
    expect(f.wrapper.emitted("sourceAction")).toBeUndefined();
    f.wrapper.getComponent(SheetOwnedPictureContextMenu).vm.$emit(action);
    expect(f.wrapper.emitted("sourceAction")).toEqual([[action, path, f.owner]]);
    f.wrapper.unmount();
  },
);
test("owned container has no source actions and readonly leaf saves without edit permission", async () => {
  const f = fixture();
  await f.wrapper.setProps({ assetUrls: new Map([["synthetic-asset", "blob:source"]]) });
  expect(f.api.handleSurfaceContextMenu(f.menuEvent(), { x: 275, y: 130 })).toBe(true);
  await f.wrapper.vm.$nextTick();
  let menu = f.wrapper.getComponent(SheetOwnedPictureContextMenu);
  expect(menu.props("canSource")).toBe(false);
  menu.vm.$emit("replace");
  expect(f.wrapper.emitted("sourceAction")).toBeUndefined();
  const path = [f.group.id, f.group.members[0]!.id];
  await f.wrapper.setProps({ selectedPath: path, readOnly: true });
  await f.wrapper
    .get("[data-owned-picture-selected]:not([data-passive-outline])")
    .trigger("keydown", { key: "ContextMenu" });
  menu = f.wrapper.getComponent(SheetOwnedPictureContextMenu);
  menu.vm.$emit("crop");
  expect(f.wrapper.emitted("sourceAction")).toBeUndefined();
  await f.wrapper
    .get("[data-owned-picture-selected]:not([data-passive-outline])")
    .trigger("keydown", { key: "ContextMenu" });
  f.wrapper.getComponent(SheetOwnedPictureContextMenu).vm.$emit("save");
  expect(f.wrapper.emitted("sourceAction")).toEqual([["save", path, f.owner]]);
  f.wrapper.unmount();
});

test("busy owned-source commands cannot replace an in-flight source operation", async () => {
  const f = fixture(),
    path = [f.group.id, f.group.members[0]!.id];
  await f.wrapper.setProps({
    selectedPath: path,
    assetUrls: new Map([["synthetic-asset", "blob:source"]]),
  });
  await f.wrapper
    .get("[data-owned-picture-selected]:not([data-passive-outline])")
    .trigger("keydown", { key: "ContextMenu" });
  const menu = f.wrapper.getComponent(SheetOwnedPictureContextMenu);
  const replace = menu.vm.$.vnode.props!.onReplace as () => void;
  await f.wrapper.setProps({ sourceToolsDisabled: true });
  replace();
  expect(f.wrapper.emitted("sourceAction")).toBeUndefined();
  expect(f.wrapper.findComponent(SheetOwnedPictureContextMenu).exists()).toBe(true);
  await f.wrapper.setProps({ sourceToolsDisabled: false });
  replace();
  expect(f.wrapper.emitted("sourceAction")).toEqual([["replace", path, f.owner]]);
  f.wrapper.unmount();
});
