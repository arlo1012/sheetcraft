import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { computed, defineComponent, h, ref, shallowRef } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { undoWorkbookCommand, redoWorkbookCommand } from "@sheetcraft/core/history";
import { findPictureGroupNode, isPictureGroup } from "@sheetcraft/core/picture-group";
import PictureToolbar from "../../../../modules/sheet-images/components/PictureToolbar.vue";
import PictureOwnedLeafRibbon from "../../../../modules/sheet-images/components/PictureOwnedLeafRibbon.vue";
import PictureAppearanceTools from "../../../../modules/sheet-images/components/PictureAppearanceTools.vue";
import PicturePresetChoices from "../../../../modules/sheet-images/components/format-pane/PicturePresetChoices.vue";
import { usePictureToolbarOwner } from "../../../../modules/sheet-images/usePictureToolbarOwner";
import { usePictureEffectsFocusReturn } from "../../../../modules/sheet-images/usePictureEffectsFocusReturn";
import { usePictureTools } from "../../../../modules/sheet-images/usePictureTools";
import { restoreFocusAfterRemount } from "../../../../shared/floating/useDismissibleFloatingPanel";
import { routeRibbonHistoryShortcut } from "../../../../app/ribbon-history-shortcuts";
import { createAppI18n } from "../../../../shared/i18n";
import { fixture, legacy, tree, contextFor } from "../owned-group-tools/fixture";

vi.mock("../../../../modules/sheet-images/picture-preset-preview", () => ({
  picturePresetPreview: () => "data:image/png;base64,c2FtcGxl",
}));
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function mountOwner(owned = false) {
  const f = fixture(owned ? [tree()] : [legacy("a"), legacy("b")]);
  f.selectedIds.value = [owned ? "root" : "a"];
  const path = ref<string[] | null>(owned ? ["root", "c"] : null);
  const revision = ref(0),
    generation = ref(0),
    blocked = ref(false);
  const context = shallowRef(contextFor(f.sheet));
  let reject = false;
  const refresh = () => {
    revision.value++;
    context.value = contextFor(f.sheet);
  };
  const tools = usePictureTools({
    getSheet: () => f.sheet,
    selectedIds: f.selectedIds,
    getSelectedPath: () => path.value,
    getFrameContext: () => context.value,
    isBusy: () => reject,
    execute: (command) => {
      const result = f.execute(command);
      refresh();
      return result;
    },
  });
  const undo = vi.fn(() => {
    const accepted = undoWorkbookCommand(f.session);
    refresh();
    return accepted;
  });
  const redo = vi.fn(() => {
    const accepted = redoWorkbookCommand(f.session);
    refresh();
    return accepted;
  });
  const Parent = defineComponent({
    setup() {
      const toolbar = ref<InstanceType<typeof PictureToolbar>>();
      const ownedRibbon = ref<InstanceType<typeof PictureOwnedLeafRibbon>>();
      const image = computed(() => {
        void revision.value;
        return f.sheet.floatingImages.find((entry) => entry.id === f.selectedIds.value[0]);
      });
      const leaf = computed(() => {
        const root = image.value;
        if (!root || !isPictureGroup(root) || !path.value) return;
        const node = findPictureGroupNode(root, path.value)?.node;
        return node?.kind === "grouped-picture-v1" ? node : undefined;
      });
      const focusReturn = usePictureEffectsFocusReturn({
        getOwner: () => {
          void revision.value;
          const target = leaf.value ?? image.value;
          if (!target || isPictureGroup(target)) return;
          return {
            workbook: f.session.workbook,
            sheet: f.sheet,
            generation: generation.value,
            mode: owned ? "owned" : "standalone",
            path: path.value,
            targets: [{ id: f.selectedIds.value[0]!, assetId: target.assetId }],
          };
        },
        isBlocked: () => blocked.value,
        getTarget: (mode) =>
          (mode === "owned" ? ownedRibbon.value : toolbar.value)?.getEffectsTrigger() ?? null,
      });
      const owner = usePictureToolbarOwner({
        getWorkbook: () => f.session.workbook,
        getSheet: () => f.sheet,
        getGeneration: () => generation.value,
        getImage: () => image.value,
        getSelectedIds: () => f.selectedIds.value,
        getFrameContext: () => context.value,
        isBusy: () => blocked.value,
        resize: () => false,
        aspectRatio: () => false,
        effect: tools.applyEffect,
      });
      return () =>
        h(
          "div",
          {
            onKeydownCapture: (event: KeyboardEvent) => {
              const restore = focusReturn.value,
                trigger = restore();
              const fromTrigger = event.target instanceof Node && trigger?.contains(event.target);
              const active = document.activeElement;
              const handled = routeRibbonHistoryShortcut(event, {
                blocked: blocked.value,
                editing: false,
                cropping: false,
                undo,
                redo,
              });
              if (handled && fromTrigger && trigger)
                restoreFocusAfterRemount(trigger, restore, () => true, active);
            },
          },
          [
            h("div", { "data-workbook-history-surface": "ribbon" }, [
              owned && leaf.value
                ? h(PictureOwnedLeafRibbon, {
                    ref: ownedRibbon,
                    key: `owned-${revision.value}`,
                    ownerKey: `owned-${revision.value}`,
                    image: leaf.value,
                    disabled: blocked.value,
                    canReplace: false,
                    replaceHandler: () => {},
                    formatHandler: () => {},
                    appearanceHandler: () => true,
                    effectHandler: tools.applyEffect,
                    restoreEffectsFocusTarget: focusReturn.value,
                  })
                : !owned && image.value
                  ? h(PictureToolbar, {
                      ref: toolbar,
                      key: owner.value?.key,
                      image: image.value,
                      appearanceDraftKey: owner.value?.appearanceDraftKey,
                      draftOwnerKey: owner.value?.draftKey,
                      effectHandler: owner.value?.effect,
                      restoreEffectsFocusTarget: focusReturn.value,
                      disabled: blocked.value,
                      selectionCount: f.selectedIds.value.length,
                      previewOnDoubleClick: true,
                    })
                  : null,
            ]),
            h("button", { "data-other": "" }, "Other control"),
          ],
        );
    },
  });
  const wrapper = mount(Parent, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return {
    ...f,
    wrapper,
    path,
    generation,
    revision,
    blocked,
    refresh,
    undo,
    redo,
    reject: () => {
      reject = true;
    },
  };
}
async function openChoice(f: ReturnType<typeof mountOwner>) {
  await f.wrapper.get('[aria-label="Effects"]').trigger("click");
  await flushPromises();
  (document.querySelector('[data-effect-category="reflection"]') as HTMLElement).click();
  await flushPromises();
  const choice = f.wrapper.getComponent(PicturePresetChoices).findAll("button")[1]!
    .element as HTMLElement;
  choice.focus();
  return choice;
}
test.each([false, true])(
  "real %s owner remount returns to its new trigger and CtrlZ executes once",
  async (owned) => {
    const f = mountOwner(owned),
      before = f.forest();
    const choice = await openChoice(f);
    const oldTrigger = f.wrapper.get('[aria-label="Effects"]').element;
    const oldAppearance = f.wrapper.getComponent(PictureAppearanceTools).vm;
    const oldToolbar = f.wrapper.findComponent(owned ? PictureOwnedLeafRibbon : PictureToolbar).vm
      .$;
    choice.click();
    await flushPromises();
    const newTrigger = f.wrapper.get('[aria-label="Effects"]').element;
    expect(oldTrigger.isConnected).toBe(false);
    expect(newTrigger).not.toBe(oldTrigger);
    expect(f.wrapper.getComponent(PictureAppearanceTools).vm).not.toBe(oldAppearance);
    if (owned) expect(f.wrapper.getComponent(PictureOwnedLeafRibbon).vm.$).not.toBe(oldToolbar);
    else expect(f.wrapper.getComponent(PictureToolbar).vm.$).toBe(oldToolbar);
    expect(document.activeElement).toBe(newTrigger);
    expect(f.session.history.undoStack).toHaveLength(1);
    newTrigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(f.undo).toHaveBeenCalledOnce();
    expect(f.forest()).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(f.redo).toHaveBeenCalledOnce();
    expect(f.session.history.undoStack).toHaveLength(1);
  },
);
test.each([
  "selection",
  "asset",
  "path",
  "generation",
  "blocked",
  "focus",
  "unmount",
  "selection-away-back",
])("accepted edit never redirects focus after %s changes", async (change) => {
  const f = mountOwner(change === "path"),
    choice = await openChoice(f);
  choice.click();
  if (change === "selection") f.selectedIds.value = ["b"];
  if (change === "selection-away-back") {
    f.selectedIds.value = ["b"];
    f.selectedIds.value = ["a"];
  }
  if (change === "asset") {
    const image = f.sheet.floatingImages[0]!;
    if (isPictureGroup(image)) throw Error("Expected picture");
    image.assetId = "replacement-asset";
    f.refresh();
  }
  if (change === "path") f.path.value = ["root", "inner", "a"];
  if (change === "generation") f.generation.value++;
  if (change === "blocked") f.blocked.value = true;
  const other = f.wrapper.get("[data-other]").element as HTMLElement;
  if (change === "focus") other.focus();
  if (change === "unmount") f.wrapper.unmount();
  await flushPromises();
  expect(document.activeElement?.getAttribute("aria-label")).not.toBe("Effects");
  if (change === "focus") expect(document.activeElement).toBe(other);
});
test("rejected Core intent keeps menu and choice focus without history", async () => {
  const f = mountOwner(),
    choice = await openChoice(f);
  f.reject();
  choice.click();
  await flushPromises();
  expect(f.session.history.undoStack).toHaveLength(0);
  expect(document.querySelectorAll('[role="menu"]')).toHaveLength(2);
  expect(document.activeElement).toBe(choice);
});
