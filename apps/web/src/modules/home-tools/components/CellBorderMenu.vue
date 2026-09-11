<script setup lang="ts">
import { ChevronDown, ChevronRight, Grid2X2, List, PencilLine, Settings2 } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import type {
  CellBorder,
  CellBorderAction,
  CellBorderFormatPatch,
  CellBorderLineStyle,
} from "@idea10/core/style";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { useRovingFocus } from "../../../shared/focus/useRovingFocus";
import { useAppI18n } from "../../../shared/i18n";
import { getWorkbookHistoryShortcut } from "../../../shared/keyboard/workbook-history-shortcuts";
import BorderColorPanel from "./BorderColorPanel.vue";
import BorderLineStylePanel from "../../../shared/borders/BorderLineStylePanel.vue";
import BorderPresetGrid from "./BorderPresetGrid.vue";

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
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const submenuRef = ref<HTMLDivElement | null>(null);
const colorRowRef = ref<HTMLButtonElement | null>(null);
const styleRowRef = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeSubmenu = ref<BorderSubmenu | null>(null);
const stackedSubmenu = ref(false);
const lineStyle = ref<CellBorderLineStyle | null>(null);
const color = ref(DEFAULT_BORDER.color);
const menuId = `cell-border-menu-${useId().replaceAll(":", "")}`;
const submenuId = `cell-border-submenu-${useId().replaceAll(":", "")}`;
const submenuOpen = computed(() => activeSubmenu.value !== null);
const submenuAnchorRef = computed(() => {
  if (stackedSubmenu.value) return menuRef.value;
  if (activeSubmenu.value === "color") return colorRowRef.value;
  if (activeSubmenu.value === "style") return styleRowRef.value;
  return styleRowRef.value;
});
const submenuPlacement = computed(() =>
  stackedSubmenu.value ? ("bottom-end" as const) : ("right-start" as const),
);
const { floatingStyles: menuStyles, dismiss: dismissMenu } = useDismissibleFloatingPanel(
  triggerRef,
  menuRef,
  open,
  {
    offset: 4,
    additionalInside: () => [submenuRef.value],
    onDismiss: () => {
      activeSubmenu.value = null;
      open.value = false;
    },
  },
);
const { floatingStyles: submenuStyles } = useFloatingPanel(
  submenuAnchorRef,
  submenuRef,
  submenuOpen,
  { placement: submenuPlacement, offset: 4 },
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

function menuItems(): HTMLButtonElement[] {
  return Array.from(
    menuRef.value?.querySelectorAll<HTMLButtonElement>("[data-border-menu-item]") ?? [],
  );
}
function submenuItems(): HTMLElement[] {
  return Array.from(
    submenuRef.value?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled)",
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
  const row =
    activeSubmenu.value === "color"
      ? colorRowRef.value
      : activeSubmenu.value === "style"
        ? styleRowRef.value
        : styleRowRef.value;
  activeSubmenu.value = null;
  if (restoreFocus) void nextTick(() => row?.focus());
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
function openSubmenu(submenu: BorderSubmenu): void {
  activeSubmenu.value = submenu;
  void nextTick(() => submenuItems()[0]?.focus());
}
function selectPreset(action: CellBorderAction): void {
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
  const selectedColor = setColor(value);
  if (!selectedColor) return;
  emit("updateBorderFormat", { color: selectedColor });
  closeSubmenu(true);
}

function selectLineStyle(style: CellBorderLineStyle | null): void {
  lineStyle.value = style;
  if (style === null) emit("applyBorders", { preset: "none" });
  else emit("updateBorderFormat", { style });
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
    if (document.activeElement === colorRowRef.value) openSubmenu("color");
    else if (document.activeElement === styleRowRef.value) openSubmenu("style");
    return;
  }
  moveRovingFocus(event, menuItems());
}
function onSubmenuKeydown(event: KeyboardEvent): void {
  if (handleHistoryShortcut(event)) return;
  const isColorPaletteEvent =
    event.target instanceof HTMLElement && event.target.closest(".color-palette");
  if (event.defaultPrevented || (isColorPaletteEvent && event.key !== "Escape")) return;
  if (event.key === "Escape" || event.key === "ArrowLeft") {
    event.preventDefault();
    event.stopPropagation();
    closeSubmenu(true);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    moveFocusFromTrigger(event.shiftKey ? -1 : 1);
    return;
  }
  moveRovingFocus(event, submenuItems());
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
  <button
    ref="triggerRef"
    type="button"
    class="cell-border-menu__trigger"
    :class="{ 'is-expanded': open }"
    data-cell-border-trigger
    :disabled="disabled"
    :aria-label="t('format.cellBorders')"
    :title="t('format.cellBorders')"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <Grid2X2 :size="18" :stroke-width="1.8" aria-hidden="true" />
    <ChevronDown
      class="cell-border-menu__disclosure"
      :class="{ 'is-expanded': open }"
      :size="10"
      aria-hidden="true"
    />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      :id="menuId"
      ref="menuRef"
      class="cell-border-menu__panel"
      :style="menuStyles"
      role="menu"
      :aria-label="t('format.cellBorders')"
      data-cell-border-panel
      @keydown="onMenuKeydown"
    >
      <BorderPresetGrid
        :border="{ style: lineStyle ?? DEFAULT_BORDER.style, color }"
        @select="selectPreset"
      />
      <div class="cell-border-menu__rows">
        <button
          ref="colorRowRef"
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-menu-row="color"
          aria-haspopup="dialog"
          :aria-expanded="activeSubmenu === 'color'"
          :aria-controls="activeSubmenu === 'color' ? submenuId : undefined"
          @click="openSubmenu('color')"
        >
          <PencilLine :size="16" aria-hidden="true" />
          <span>{{ t("format.borderColor") }}</span>
          <ChevronRight :size="15" aria-hidden="true" />
        </button>
        <button
          ref="styleRowRef"
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-menu-row="style"
          aria-haspopup="menu"
          :aria-expanded="activeSubmenu === 'style'"
          :aria-controls="activeSubmenu === 'style' ? submenuId : undefined"
          @click="openSubmenu('style')"
        >
          <List :size="16" aria-hidden="true" />
          <span>{{ t("format.borderLineStyle") }}</span>
          <ChevronRight :size="15" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-menu-row="settings"
          @click="openCellFormat"
        >
          <Settings2 :size="16" aria-hidden="true" />
          <span>{{ t("format.borderMoreSettings") }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="activeSubmenu"
      :id="submenuId"
      ref="submenuRef"
      class="cell-border-menu__submenu"
      :class="`is-${activeSubmenu}`"
      :style="submenuStyles"
      :role="activeSubmenu === 'style' ? 'menu' : 'dialog'"
      :aria-label="
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
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.cell-border-menu {
  &__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--cell-format-compact-track, 40px);
    height: var(--cell-format-control-height, 26px);
    gap: 2px;
    padding: 0 3px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--idea-text-primary);
    cursor: pointer;
    &:hover:not(:disabled),
    &.is-expanded {
      background: var(--idea-surface-hover);
    }
    &:focus-visible:not(.is-expanded) {
      border-color: var(--idea-action-primary);
      outline: none;
      box-shadow: 0 0 0 2px var(--idea-action-focus);
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }
  &__disclosure {
    color: var(--idea-text-muted);
    transition: transform 120ms ease;
    &.is-expanded {
      transform: rotate(180deg);
    }
  }
  &__panel,
  &__submenu {
    z-index: 100;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-medium);
    box-shadow: var(--idea-shadow-floating);
  }
  &__panel {
    width: 174px;
    padding: var(--idea-tool-panel-padding);
  }
  &__rows {
    display: grid;
    gap: 1px;
    padding-top: 5px;
    border-top: 1px solid var(--idea-border-subtle);
    > button {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 16px;
      align-items: center;
      width: 100%;
      height: 29px;
      gap: 6px;
      padding: 0 5px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      color: var(--idea-text-primary);
      cursor: pointer;
      font: inherit;
      font-size: var(--idea-font-size-body-medium);
      line-height: var(--idea-line-height-body-medium);
      text-align: left;
      > svg:last-child {
        color: var(--idea-text-muted);
      }
      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      &:hover,
      &[aria-expanded="true"] {
        background: var(--idea-surface-hover);
        outline: none;
      }
      &:focus-visible {
        background: var(--idea-surface-hover);
        outline: none;
        box-shadow: 0 0 0 2px var(--idea-action-focus);
      }
    }
  }
  &__submenu {
    width: 178px;
    padding: var(--idea-tool-panel-padding);
  }
  &__submenu.is-color {
    width: max-content;
    min-width: 208px;
    padding: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cell-border-menu__disclosure {
    transition: none;
  }
}
</style>
