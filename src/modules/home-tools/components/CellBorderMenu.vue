<script setup lang="ts">
import {
  Check,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  List,
  PencilLine,
  Settings2,
} from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import type { CellBorder, CellBorderAction, CellBorderLineStyle } from "../../workbook/cell-style";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import { getWorkbookHistoryShortcut } from "../history-shortcuts";
import CellBorderPresetIcon from "./CellBorderPresetIcon.vue";

type BorderSubmenu = "color" | "style" | "settings";

const DEFAULT_BORDER: CellBorder = { style: "thin", color: "#20242c" };
const STACKED_SUBMENU_BREAKPOINT = 480;
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{
  applyBorders: [action: CellBorderAction];
  undo: [];
  redo: [];
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const submenuRef = ref<HTMLDivElement | null>(null);
const colorRowRef = ref<HTMLButtonElement | null>(null);
const styleRowRef = ref<HTMLButtonElement | null>(null);
const settingsRowRef = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const activeSubmenu = ref<BorderSubmenu | null>(null);
const stackedSubmenu = ref(false);
const lineStyle = ref<CellBorderLineStyle>(DEFAULT_BORDER.style);
const color = ref(DEFAULT_BORDER.color);
const menuId = `cell-border-menu-${useId().replaceAll(":", "")}`;
const submenuId = `cell-border-submenu-${useId().replaceAll(":", "")}`;
const submenuOpen = computed(() => activeSubmenu.value !== null);
const submenuAnchorRef = computed(() => {
  if (stackedSubmenu.value) return menuRef.value;
  if (activeSubmenu.value === "color") return colorRowRef.value;
  if (activeSubmenu.value === "style") return styleRowRef.value;
  return settingsRowRef.value;
});
const submenuPlacement = computed(() =>
  stackedSubmenu.value ? ("bottom-end" as const) : ("right-start" as const),
);
const { floatingStyles: menuStyles } = useFloatingPanel(triggerRef, menuRef, open, { offset: 4 });
const { floatingStyles: submenuStyles } = useFloatingPanel(
  submenuAnchorRef,
  submenuRef,
  submenuOpen,
  { placement: submenuPlacement, offset: 4 },
);
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
  activeSubmenu.value = null;
  open.value = false;
  if (restoreFocus) void nextTick(() => triggerRef.value?.focus());
}
function closeSubmenu(restoreFocus: boolean): void {
  const row =
    activeSubmenu.value === "color"
      ? colorRowRef.value
      : activeSubmenu.value === "style"
        ? styleRowRef.value
        : settingsRowRef.value;
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
  emit("applyBorders", action);
  closeAll(true);
}
function applyPreset(preset: Exclude<CellBorderAction["preset"], "none">): void {
  const normalizedColor = normalizeColor(color.value);
  if (normalizedColor)
    selectPreset({
      preset,
      border: { style: lineStyle.value, color: normalizedColor },
    });
}
function updateColor(event: Event): void {
  const nextColor = normalizeColor((event.target as HTMLInputElement).value);
  if (nextColor) color.value = nextColor;
}
function selectLineStyle(style: CellBorderLineStyle): void {
  lineStyle.value = style;
  closeSubmenu(true);
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
function moveFocus(event: KeyboardEvent, items: HTMLElement[]): boolean {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  if (items.length === 0 || currentIndex < 0) return false;
  event.preventDefault();
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowUp"
          ? currentIndex === 0
            ? items.length - 1
            : currentIndex - 1
          : currentIndex === items.length - 1
            ? 0
            : currentIndex + 1;
  items[nextIndex]?.focus();
  return true;
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
    else if (document.activeElement === settingsRowRef.value) openSubmenu("settings");
    return;
  }
  moveFocus(event, menuItems());
}
function onSubmenuKeydown(event: KeyboardEvent): void {
  if (handleHistoryShortcut(event)) return;
  if (event.key === "Escape" || event.key === "ArrowLeft") {
    event.preventDefault();
    closeSubmenu(true);
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    moveFocusFromTrigger(event.shiftKey ? -1 : 1);
    return;
  }
  moveFocus(event, submenuItems());
}
function isInsideMenu(target: EventTarget | null): boolean {
  return (
    target instanceof Node &&
    (triggerRef.value?.contains(target) === true ||
      menuRef.value?.contains(target) === true ||
      submenuRef.value?.contains(target) === true)
  );
}
function onDocumentPointerDown(event: PointerEvent): void {
  if (open.value && !isInsideMenu(event.target)) closeAll(false);
}
function onDocumentFocusIn(event: FocusEvent): void {
  if (open.value && !isInsideMenu(event.target)) closeAll(false);
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
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("focusin", onDocumentFocusIn);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSubmenuLayout);
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("focusin", onDocumentFocusIn);
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
      <div class="cell-border-menu__presets" :aria-label="t('format.borderPresets')">
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="none"
          :aria-label="t('format.borderNone')"
          :title="t('format.borderNone')"
          @click="selectPreset({ preset: 'none' })"
        >
          <CellBorderPresetIcon preset="none" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="all"
          :aria-label="t('format.borderAll')"
          :title="t('format.borderAll')"
          @click="applyPreset('all')"
        >
          <CellBorderPresetIcon preset="all" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="outer"
          :aria-label="t('format.borderOuter')"
          :title="t('format.borderOuter')"
          @click="applyPreset('outer')"
        >
          <CellBorderPresetIcon preset="outer" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="inner"
          :aria-label="t('format.borderInner')"
          :title="t('format.borderInner')"
          @click="applyPreset('inner')"
        >
          <CellBorderPresetIcon preset="inner" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="top"
          :aria-label="t('format.borderTop')"
          :title="t('format.borderTop')"
          @click="applyPreset('top')"
        >
          <CellBorderPresetIcon preset="top" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="innerHorizontal"
          :aria-label="t('format.borderInnerHorizontal')"
          :title="t('format.borderInnerHorizontal')"
          @click="applyPreset('innerHorizontal')"
        >
          <CellBorderPresetIcon preset="innerHorizontal" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="innerVertical"
          :aria-label="t('format.borderInnerVertical')"
          :title="t('format.borderInnerVertical')"
          @click="applyPreset('innerVertical')"
        >
          <CellBorderPresetIcon preset="innerVertical" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="left"
          :aria-label="t('format.borderLeft')"
          :title="t('format.borderLeft')"
          @click="applyPreset('left')"
        >
          <CellBorderPresetIcon preset="left" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="bottom"
          :aria-label="t('format.borderBottom')"
          :title="t('format.borderBottom')"
          @click="applyPreset('bottom')"
        >
          <CellBorderPresetIcon preset="bottom" />
        </button>
        <button
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-preset="right"
          :aria-label="t('format.borderRight')"
          :title="t('format.borderRight')"
          @click="applyPreset('right')"
        >
          <CellBorderPresetIcon preset="right" />
        </button>
      </div>
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
          <PencilLine :size="16" aria-hidden="true" /><span>{{ t("format.borderColor") }}</span
          ><ChevronRight :size="15" aria-hidden="true" />
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
          <List :size="16" aria-hidden="true" /><span>{{ t("format.borderLineStyle") }}</span
          ><ChevronRight :size="15" aria-hidden="true" />
        </button>
        <button
          ref="settingsRowRef"
          type="button"
          role="menuitem"
          data-border-menu-item
          data-border-menu-row="settings"
          aria-haspopup="dialog"
          :aria-expanded="activeSubmenu === 'settings'"
          :aria-controls="activeSubmenu === 'settings' ? submenuId : undefined"
          @click="openSubmenu('settings')"
        >
          <Settings2 :size="16" aria-hidden="true" /><span>{{
            t("format.borderMoreSettings")
          }}</span
          ><ChevronRight :size="15" aria-hidden="true" />
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
            : t('format.borderMoreSettings')
      "
      :data-border-submenu="activeSubmenu"
      :data-border-submenu-layout="stackedSubmenu ? 'stacked' : 'side'"
      @keydown="onSubmenuKeydown"
    >
      <template v-if="activeSubmenu === 'color'">
        <div
          class="cell-border-menu__color-grid"
          role="radiogroup"
          :aria-label="t('format.borderColor')"
        >
          <button
            type="button"
            role="radio"
            data-border-color="#20242c"
            :aria-label="t('format.borderColorValue', { value: '#20242c' })"
            :aria-checked="color === '#20242c'"
            @click="color = '#20242c'"
          >
            <span style="--border-swatch-color: #20242c" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            data-border-color="#6b7280"
            :aria-label="t('format.borderColorValue', { value: '#6b7280' })"
            :aria-checked="color === '#6b7280'"
            @click="color = '#6b7280'"
          >
            <span style="--border-swatch-color: #6b7280" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            data-border-color="#ef4444"
            :aria-label="t('format.borderColorValue', { value: '#ef4444' })"
            :aria-checked="color === '#ef4444'"
            @click="color = '#ef4444'"
          >
            <span style="--border-swatch-color: #ef4444" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            data-border-color="#f97316"
            :aria-label="t('format.borderColorValue', { value: '#f97316' })"
            :aria-checked="color === '#f97316'"
            @click="color = '#f97316'"
          >
            <span style="--border-swatch-color: #f97316" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            data-border-color="#eab308"
            :aria-label="t('format.borderColorValue', { value: '#eab308' })"
            :aria-checked="color === '#eab308'"
            @click="color = '#eab308'"
          >
            <span style="--border-swatch-color: #eab308" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            data-border-color="#22c55e"
            :aria-label="t('format.borderColorValue', { value: '#22c55e' })"
            :aria-checked="color === '#22c55e'"
            @click="color = '#22c55e'"
          >
            <span style="--border-swatch-color: #22c55e" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            data-border-color="#3b82f6"
            :aria-label="t('format.borderColorValue', { value: '#3b82f6' })"
            :aria-checked="color === '#3b82f6'"
            @click="color = '#3b82f6'"
          >
            <span style="--border-swatch-color: #3b82f6" aria-hidden="true" />
          </button>
          <button
            type="button"
            role="radio"
            data-border-color="#8b5cf6"
            :aria-label="t('format.borderColorValue', { value: '#8b5cf6' })"
            :aria-checked="color === '#8b5cf6'"
            @click="color = '#8b5cf6'"
          >
            <span style="--border-swatch-color: #8b5cf6" aria-hidden="true" />
          </button>
        </div>
        <label class="cell-border-menu__custom-color"
          ><span>{{ t("format.customBorderColor") }}</span
          ><input
            :value="color"
            type="color"
            data-border-custom-color
            :aria-label="t('format.customBorderColor')"
            @input="updateColor"
        /></label>
      </template>
      <template v-else-if="activeSubmenu === 'style'">
        <button
          type="button"
          role="menuitemradio"
          data-border-line-option="thin"
          :aria-label="t('format.borderLineThin')"
          :aria-checked="lineStyle === 'thin'"
          @click="selectLineStyle('thin')"
        >
          <span
            class="cell-border-menu__line-sample cell-border-menu__line-sample--thin"
            aria-hidden="true"
          /><Check :size="15" :class="{ 'is-visible': lineStyle === 'thin' }" aria-hidden="true" />
        </button>
        <button
          type="button"
          role="menuitemradio"
          data-border-line-option="medium"
          :aria-label="t('format.borderLineMedium')"
          :aria-checked="lineStyle === 'medium'"
          @click="selectLineStyle('medium')"
        >
          <span
            class="cell-border-menu__line-sample cell-border-menu__line-sample--medium"
            aria-hidden="true"
          /><Check
            :size="15"
            :class="{ 'is-visible': lineStyle === 'medium' }"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          role="menuitemradio"
          data-border-line-option="dashed"
          :aria-label="t('format.borderLineDashed')"
          :aria-checked="lineStyle === 'dashed'"
          @click="selectLineStyle('dashed')"
        >
          <span
            class="cell-border-menu__line-sample cell-border-menu__line-sample--dashed"
            aria-hidden="true"
          /><Check
            :size="15"
            :class="{ 'is-visible': lineStyle === 'dashed' }"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          role="menuitemradio"
          data-border-line-option="dotted"
          :aria-label="t('format.borderLineDotted')"
          :aria-checked="lineStyle === 'dotted'"
          @click="selectLineStyle('dotted')"
        >
          <span
            class="cell-border-menu__line-sample cell-border-menu__line-sample--dotted"
            aria-hidden="true"
          /><Check
            :size="15"
            :class="{ 'is-visible': lineStyle === 'dotted' }"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          role="menuitemradio"
          data-border-line-option="double"
          :aria-label="t('format.borderLineDouble')"
          :aria-checked="lineStyle === 'double'"
          @click="selectLineStyle('double')"
        >
          <span
            class="cell-border-menu__line-sample cell-border-menu__line-sample--double"
            aria-hidden="true"
          /><Check
            :size="15"
            :class="{ 'is-visible': lineStyle === 'double' }"
            aria-hidden="true"
          />
        </button>
      </template>
      <template v-else>
        <div class="cell-border-menu__settings-heading">
          {{ t("format.borderMoreSettings") }}
        </div>
        <label class="cell-border-menu__settings-color"
          ><span>{{ t("format.borderColor") }}</span
          ><input
            :value="color"
            type="color"
            data-border-settings-color
            :aria-label="t('format.borderColor')"
            @input="updateColor"
        /></label>
        <div class="cell-border-menu__settings-styles" :aria-label="t('format.borderLineStyle')">
          <button
            type="button"
            data-border-settings-style="thin"
            :aria-label="t('format.borderLineThin')"
            :aria-pressed="lineStyle === 'thin'"
            @click="lineStyle = 'thin'"
          >
            <span
              class="cell-border-menu__line-sample cell-border-menu__line-sample--thin"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            data-border-settings-style="medium"
            :aria-label="t('format.borderLineMedium')"
            :aria-pressed="lineStyle === 'medium'"
            @click="lineStyle = 'medium'"
          >
            <span
              class="cell-border-menu__line-sample cell-border-menu__line-sample--medium"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            data-border-settings-style="dashed"
            :aria-label="t('format.borderLineDashed')"
            :aria-pressed="lineStyle === 'dashed'"
            @click="lineStyle = 'dashed'"
          >
            <span
              class="cell-border-menu__line-sample cell-border-menu__line-sample--dashed"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            data-border-settings-style="dotted"
            :aria-label="t('format.borderLineDotted')"
            :aria-pressed="lineStyle === 'dotted'"
            @click="lineStyle = 'dotted'"
          >
            <span
              class="cell-border-menu__line-sample cell-border-menu__line-sample--dotted"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            data-border-settings-style="double"
            :aria-label="t('format.borderLineDouble')"
            :aria-pressed="lineStyle === 'double'"
            @click="lineStyle = 'double'"
          >
            <span
              class="cell-border-menu__line-sample cell-border-menu__line-sample--double"
              aria-hidden="true"
            />
          </button>
        </div>
      </template>
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
    color: var(--td-text-color-primary);
    cursor: pointer;
    &:hover:not(:disabled),
    &.is-expanded {
      background: var(--td-bg-color-container-hover);
    }
    &:focus-visible:not(.is-expanded) {
      border-color: var(--td-brand-color);
      outline: none;
      box-shadow: 0 0 0 2px var(--td-brand-color-focus);
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }
  &__disclosure {
    color: var(--td-text-color-placeholder);
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
    background: var(--td-bg-color-container);
    border: 1px solid var(--td-component-border);
    border-radius: var(--td-radius-medium);
    box-shadow: var(--td-shadow-2);
  }
  &__panel {
    width: 168px;
    padding: 5px;
  }
  &__presets {
    display: grid;
    grid-template-columns: repeat(5, 26px);
    grid-template-rows: repeat(2, 26px);
    justify-content: space-between;
    gap: 2px;
    padding-bottom: 5px;
    > button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      color: var(--td-text-color-primary);
      cursor: pointer;
      &:hover,
      &:focus-visible {
        background: var(--td-bg-color-container-hover);
        outline: none;
      }
      &:focus-visible {
        box-shadow: 0 0 0 2px var(--td-brand-color-focus);
      }
    }
  }
  &__rows {
    display: grid;
    gap: 1px;
    padding-top: 5px;
    border-top: 1px solid var(--td-border-level-1-color);
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
      color: var(--td-text-color-primary);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      text-align: left;
      > svg:last-child {
        color: var(--td-text-color-placeholder);
      }
      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      &:hover,
      &[aria-expanded="true"] {
        background: var(--td-bg-color-container-hover);
        outline: none;
      }
      &:focus-visible {
        background: var(--td-bg-color-container-hover);
        outline: none;
        box-shadow: 0 0 0 2px var(--td-brand-color-focus);
      }
    }
  }
  &__submenu {
    width: 174px;
    padding: 6px;
  }
  &__submenu.is-style {
    display: grid;
    gap: 2px;
  }
  &__submenu.is-style > button {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 16px;
    align-items: center;
    width: 100%;
    height: 29px;
    padding: 0 7px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;
    &:hover,
    &:focus-visible {
      background: var(--td-bg-color-container-hover);
      border-color: var(--td-brand-color);
      outline: none;
    }
    > svg {
      opacity: 0;
      color: var(--td-brand-color);
    }
    > svg.is-visible {
      opacity: 1;
    }
  }
  &__line-sample {
    display: block;
    width: 100%;
    height: 0;
    border-top: 1px solid var(--td-text-color-primary);
  }
  &__line-sample--medium {
    border-top-width: 2px;
  }
  &__line-sample--dashed {
    border-top-style: dashed;
  }
  &__line-sample--dotted {
    border-top-style: dotted;
  }
  &__line-sample--double {
    height: 3px;
    border-top: 3px double var(--td-text-color-primary);
  }
  &__color-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding-bottom: 7px;
    border-bottom: 1px solid var(--td-border-level-1-color);
    > button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 24px;
      padding: 3px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 2px;
      cursor: pointer;
      &:hover,
      &:focus-visible,
      &[aria-checked="true"] {
        border-color: var(--td-brand-color);
        outline: none;
      }
      > span {
        width: 100%;
        height: 100%;
        background: var(--border-swatch-color);
        border: 1px solid var(--td-component-border);
      }
    }
  }
  &__custom-color,
  &__settings-color {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    color: var(--td-text-color-primary);
    font-size: 13px;
    input {
      width: 28px;
      height: 22px;
      padding: 1px;
      border: 1px solid var(--td-component-border);
      border-radius: 2px;
      cursor: pointer;
    }
  }
  &__custom-color {
    margin-top: 7px;
  }
  &__submenu.is-settings {
    display: grid;
    gap: 9px;
    padding: 9px;
  }
  &__settings-heading {
    color: var(--td-text-color-primary);
    font-size: 13px;
    font-weight: 600;
  }
  &__settings-styles {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
  }
  &__settings-styles > button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    padding: 0 3px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;
    &:hover,
    &:focus-visible,
    &[aria-pressed="true"] {
      background: var(--td-bg-color-container-hover);
      border-color: var(--td-brand-color);
      outline: none;
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .cell-border-menu__disclosure {
    transition: none;
  }
}
</style>
