<script setup lang="ts">
import { ChevronRight, List, PencilLine, Settings2 } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import type {
  CellBorder,
  CellBorderAction,
  CellBorderFormatPatch,
  CellBorderLineStyle,
  CellBorderPreset,
} from "@idea10/core/style";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { useRovingFocus } from "../../../shared/focus/useRovingFocus";
import { useAppI18n } from "../../../shared/i18n";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useSubmenu } from "../../../shared/menu/useSubmenu";
import BorderColorPanel from "./BorderColorPanel.vue";
import BorderLineStylePanel from "../../../shared/borders/BorderLineStylePanel.vue";
import BorderPresetGrid from "./BorderPresetGrid.vue";
import CellBorderPresetIcon from "../../../shared/borders/CellBorderPresetIcon.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";

defineOptions({ inheritAttrs: false });

type BorderSubmenu = "color" | "style";

const DEFAULT_BORDER: CellBorder = { style: "thin", color: "#20242c" };
const STACKED_SUBMENU_BREAKPOINT = 480;
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{
  applyBorders: [action: CellBorderAction];
  updateBorderFormat: [patch: CellBorderFormatPatch];
  openCellFormat: [];
  undo: [];
  redo: [];
}>();
const { t } = useAppI18n();
const splitActionRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const triggerRef = computed(() => splitActionRef.value?.menuElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed(() => menuSurfaceRef.value?.rootElement ?? null);
const submenuRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const open = ref(false);
const stackedSubmenu = ref(false);
const lineStyle = ref<CellBorderLineStyle | null>(DEFAULT_BORDER.style);
const color = ref(DEFAULT_BORDER.color);
const lastPreset = ref<CellBorderPreset>("bottom");
const menuId = `cell-border-menu-${useId().replaceAll(":", "")}`;
const submenuId = `cell-border-submenu-${useId().replaceAll(":", "")}`;
function menuRow(row: "color" | "style"): HTMLElement | null {
  return menuRef.value?.querySelector<HTMLElement>(`[data-border-menu-row="${row}"]`) ?? null;
}
const submenuPlacement = computed(() =>
  stackedSubmenu.value ? ("bottom-end" as const) : ("right-start" as const),
);
const {
  activeSubmenu,
  submenuElement,
  submenuStyles,
  openSubmenu,
  closeSubmenu: closeSharedSubmenu,
  onSubmenuKeydown: onSharedSubmenuKeydown,
} = useSubmenu<BorderSubmenu>({
  parentOpen: open,
  submenuSurfaceRef: submenuRef,
  getAnchor: (submenu) => (stackedSubmenu.value ? menuRef.value : menuRow(submenu)),
  placement: submenuPlacement,
  offset: 4,
  focus: () => submenuItems()[0]?.focus(),
});
const { floatingStyles: menuStyles, dismiss: dismissMenu } = useDismissibleFloatingPanel(
  triggerRef,
  menuRef,
  open,
  {
    offset: 4,
    additionalInside: () => [splitActionRef.value?.rootElement, submenuElement.value],
    onDismiss: () => {
      activeSubmenu.value = null;
      open.value = false;
    },
  },
);
const { move: moveRovingFocus } = useRovingFocus();
const DOCUMENT_FOCUS_TARGET_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not(:disabled):not([tabindex="-1"])',
  'input:not(:disabled):not([tabindex="-1"])',
  'select:not(:disabled):not([tabindex="-1"])',
  'textarea:not(:disabled):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(", ");

function menuItems(): HTMLElement[] {
  return Array.from(menuRef.value?.querySelectorAll<HTMLElement>("[data-border-menu-item]") ?? []);
}
function submenuItems(): HTMLElement[] {
  return Array.from(
    submenuElement.value?.querySelectorAll<HTMLElement>(
      '[role="menuitemradio"]:not([aria-disabled="true"]), button:not(:disabled), input:not(:disabled)',
    ) ?? [],
  );
}
function normalizeColor(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}
function closeAll(restoreFocus: boolean): void {
  dismissMenu("programmatic", restoreFocus);
}
function closeSubmenu(restoreFocus: boolean): void {
  closeSharedSubmenu(restoreFocus);
}
function openMenu(preferred: "first" | "last" = "first"): void {
  if (!props.disabled) {
    open.value = true;
    activeSubmenu.value = null;
    void nextTick(() => (preferred === "last" ? menuItems().at(-1) : menuItems()[0])?.focus());
  }
}
function toggleMenu(): void {
  if (open.value) closeAll(true);
  else openMenu();
}
const lastPresetLabel = computed(() => {
  const key: Record<CellBorderPreset, Parameters<typeof t>[0]> = {
    none: "format.borderNone",
    all: "format.borderAll",
    outer: "format.borderOuter",
    inner: "format.borderInner",
    top: "format.borderTop",
    right: "format.borderRight",
    bottom: "format.borderBottom",
    left: "format.borderLeft",
    innerHorizontal: "format.borderInnerHorizontal",
    innerVertical: "format.borderInnerVertical",
    diagonalUp: "format.borderDiagonalUp",
    diagonalDown: "format.borderDiagonalDown",
  };
  return t(key[lastPreset.value]);
});
function applyLastPreset(): void {
  if (props.disabled) return;
  const preset = lastPreset.value;
  emit(
    "applyBorders",
    preset === "none"
      ? { preset }
      : { preset, border: { style: lineStyle.value ?? DEFAULT_BORDER.style, color: color.value } },
  );
  closeAll(false);
}
function selectPreset(action: CellBorderAction): void {
  if (props.disabled) return;
  lastPreset.value = action.preset;
  lineStyle.value =
    action.preset === "none" ? null : (action.border?.style ?? DEFAULT_BORDER.style);
  emit("applyBorders", action);
  closeAll(true);
}
function setColor(value: string): string | undefined {
  const normalizedColor = normalizeColor(value);
  if (normalizedColor) color.value = normalizedColor;
  return normalizedColor;
}
function selectPaletteColor(value: string): void {
  if (props.disabled) return;
  const selectedColor = setColor(value);
  if (!selectedColor) return;
  emit("updateBorderFormat", { color: selectedColor });
  closeSubmenu(true);
}

function selectLineStyle(style: CellBorderLineStyle | null): void {
  if (props.disabled) return;
  lineStyle.value = style;
  if (style === null) {
    lastPreset.value = "none";
    emit("applyBorders", { preset: "none" });
  } else emit("updateBorderFormat", { style });
  closeSubmenu(true);
}
function openCellFormat(): void {
  closeAll(true);
  emit("openCellFormat");
}
function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openMenu(event.key === "ArrowDown" ? "first" : "last");
  }
}
function moveFocusFromTrigger(direction: -1 | 1): void {
  const trigger = triggerRef.value;
  if (!trigger) return closeAll(false);
  const focusTargets = Array.from(
    document.querySelectorAll<HTMLElement>(DOCUMENT_FOCUS_TARGET_SELECTOR),
  );
  const target = focusTargets[focusTargets.indexOf(trigger) + direction];
  closeAll(false);
  void nextTick(() => target?.focus());
}
function handleHistoryShortcut(event: KeyboardEvent): boolean {
  const action = getWorkbookHistoryShortcut(event);
  if (!action) return false;
  event.preventDefault();
  if (action === "undo") emit("undo");
  else emit("redo");
  return true;
}
function onMenuKeydown(event: KeyboardEvent): void {
  if (handleHistoryShortcut(event)) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeAll(true);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    moveFocusFromTrigger(event.shiftKey ? -1 : 1);
    return;
  }
  if (event.key === "ArrowRight") {
    if (document.activeElement === menuRow("color")) openSubmenu("color");
    else if (document.activeElement === menuRow("style")) openSubmenu("style");
    return;
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.stopPropagation();
    moveRovingFocus(event, menuItems());
  }
}
function onSubmenuKeydown(event: KeyboardEvent): void {
  if (handleHistoryShortcut(event)) return;
  const isColorPaletteEvent =
    event.target instanceof HTMLElement && event.target.closest(".color-palette");
  if (event.defaultPrevented || (isColorPaletteEvent && event.key !== "Escape")) return;
  if (onSharedSubmenuKeydown(event)) return;
  if (event.key === "Tab") {
    event.preventDefault();
    moveFocusFromTrigger(event.shiftKey ? -1 : 1);
    return;
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    moveRovingFocus(event, submenuItems());
  }
}
function updateSubmenuLayout(): void {
  stackedSubmenu.value = window.innerWidth < STACKED_SUBMENU_BREAKPOINT;
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) closeAll(false);
  },
);
onMounted(() => {
  updateSubmenuLayout();
  window.addEventListener("resize", updateSubmenuLayout);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSubmenuLayout);
});
</script>

<template>
  <span v-bind="$attrs" class="ribbon-menu-tool">
    <RibbonSplitButton
      ref="splitActionRef"
      class="cell-border-menu"
      data-cell-border-control
      :label="lastPresetLabel"
      :menu-label="t('ribbon.moreOptions', { tool: t('ribbon.borders') })"
      :disabled="disabled"
      :menu-disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="applyLastPreset"
      @toggle-menu="toggleMenu"
      @menu-keydown="onTriggerKeydown"
    >
      <CellBorderPresetIcon :preset="lastPreset" />
    </RibbonSplitButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="cell-border-menu__panel"
        :style="menuStyles"
        :label="t('format.cellBorders')"
        data-cell-border-panel
        @keydown.capture="onMenuKeydown"
      >
        <li class="cell-border-menu__presets" role="none">
          <BorderPresetGrid
            :border="{ style: lineStyle ?? DEFAULT_BORDER.style, color }"
            @select="selectPreset"
          />
        </li>
        <MenuSeparator />
        <MenuItem
          data-border-menu-item
          data-border-menu-row="color"
          aria-haspopup="dialog"
          :aria-expanded="activeSubmenu === 'color'"
          :aria-controls="activeSubmenu === 'color' ? submenuId : undefined"
          @select="openSubmenu('color')"
        >
          <template #icon>
            <PencilLine :size="16" aria-hidden="true" />
          </template>
          {{ t("format.borderColor") }}
          <template #shortcut>
            <ChevronRight :size="15" aria-hidden="true" />
          </template>
        </MenuItem>
        <MenuItem
          data-border-menu-item
          data-border-menu-row="style"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'style'"
          :aria-controls="activeSubmenu === 'style' ? submenuId : undefined"
          @select="openSubmenu('style')"
        >
          <template #icon>
            <List :size="16" aria-hidden="true" />
          </template>
          {{ t("format.borderLineStyle") }}
          <template #shortcut>
            <ChevronRight :size="15" aria-hidden="true" />
          </template>
        </MenuItem>
        <MenuItem data-border-menu-item data-border-menu-row="settings" @select="openCellFormat">
          <template #icon>
            <Settings2 :size="16" aria-hidden="true" />
          </template>
          {{ t("format.borderMoreSettings") }}
        </MenuItem>
      </MenuSurface>

      <FloatingPanelSurface
        v-if="activeSubmenu"
        :id="submenuId"
        ref="submenuRef"
        class="cell-border-menu__submenu"
        :class="`is-${activeSubmenu}`"
        :style="submenuStyles"
        layer="submenu"
        :role="activeSubmenu === 'style' ? 'group' : 'dialog'"
        :padding="activeSubmenu === 'style' ? 'tool' : 'none'"
        :label="
          activeSubmenu === 'color'
            ? t('format.borderColor')
            : activeSubmenu === 'style'
              ? t('format.borderLineStyle')
              : t('format.borderLineStyle')
        "
        :data-border-submenu="activeSubmenu"
        :data-border-submenu-layout="stackedSubmenu ? 'stacked' : 'side'"
        @keydown="onSubmenuKeydown"
      >
        <BorderColorPanel
          v-if="activeSubmenu === 'color'"
          :model-value="color"
          @update="selectPaletteColor"
        />
        <BorderLineStylePanel
          v-else-if="activeSubmenu === 'style'"
          :model-value="lineStyle"
          :color="color"
          @select="selectLineStyle"
        />
      </FloatingPanelSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;
}

.cell-border-menu {
  &__panel {
    width: 174px;
    max-height: calc(100vh - 16px);
  }
  &__presets {
    padding: 0 var(--idea-tool-panel-padding);
    list-style: none;
  }
  &__submenu {
    width: 178px;
  }
  &__submenu.is-color {
    width: max-content;
    min-width: 208px;
  }
}
</style>
