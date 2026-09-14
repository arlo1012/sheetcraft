<script setup lang="ts">
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  ListOrdered,
  Paintbrush,
} from "lucide-vue-next";
import type { CellFillMode } from "@idea10/core/cell-autofill";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

export type { CellFillMode } from "@idea10/core/cell-autofill";

const props = withDefaults(
  defineProps<{
    position: { x: number; y: number };
    visible: boolean;
    currentMode: CellFillMode;
    availableModes: readonly CellFillMode[];
    scale?: number;
  }>(),
  { scale: 1 },
);
const emit = defineEmits<{
  select: [mode: CellFillMode];
}>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const open = ref(false);
const menuId = `sheet-auto-fill-options-${useId().replaceAll(":", "")}`;
const triggerElement = computed(() => triggerRef.value);
const menuElement = computed(() => menuSurfaceRef.value?.rootElement ?? null);
const menuOpen = computed(() => props.visible && open.value);
const triggerStyle = computed(() => ({
  left: `${props.position.x}px`,
  top: `${props.position.y}px`,
}));
const iconSize = computed(() => 14 / props.scale);
const chevronSize = computed(() => 11 / props.scale);
const { floatingStyles: menuStyles, dismiss } = useDismissibleFloatingPanel(
  triggerElement,
  menuElement,
  menuOpen,
  {
    placement: "bottom-end",
    offset: 4,
    padding: 8,
    onDismiss: () => closeMenu(),
  },
);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) open.value = false;
  },
);

function isAvailable(mode: CellFillMode): boolean {
  return props.availableModes.includes(mode);
}

function isSelected(mode: CellFillMode): boolean {
  return props.currentMode === mode;
}

function openMenu(): void {
  open.value = true;
  void nextTick(() => {
    const selected = menuElement.value?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]',
    );
    (selected ?? menuSurfaceRef.value?.rootElement)?.focus();
  });
}

function toggleMenu(): void {
  if (open.value) dismiss("programmatic", false);
  else openMenu();
}

function closeMenu(): void {
  open.value = false;
}

function selectMode(mode: CellFillMode): void {
  if (!isAvailable(mode)) return;
  open.value = false;
  emit("select", mode);
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    openMenu();
  }
}
</script>

<template>
  <button
    v-if="visible"
    ref="triggerRef"
    type="button"
    class="sheet-auto-fill-options__trigger"
    :style="triggerStyle"
    :aria-label="t('autoFill.options')"
    :aria-controls="menuOpen ? menuId : undefined"
    :aria-expanded="menuOpen"
    aria-haspopup="menu"
    :title="t('autoFill.options')"
    data-sheet-auto-fill-options-trigger
    @pointerdown.prevent.stop
    @click.stop="toggleMenu"
    @keydown.stop="onTriggerKeydown"
  >
    <Clipboard :size="iconSize" aria-hidden="true" />
    <ChevronDown :size="chevronSize" aria-hidden="true" />
  </button>
  <Teleport to="body">
    <MenuSurface
      v-if="menuOpen"
      :id="menuId"
      ref="menuSurfaceRef"
      class="sheet-auto-fill-options__menu"
      :style="menuStyles"
      :label="t('autoFill.options')"
      @pointerdown.stop
      @click.stop
    >
      <MenuItem
        v-if="isAvailable('copy')"
        role="menuitemradio"
        :aria-checked="isSelected('copy')"
        data-sheet-auto-fill-mode="copy"
        @select="selectMode('copy')"
      >
        <template #icon><Copy :size="15" /></template>
        {{ t("autoFill.copy") }}
        <template #shortcut><Check v-if="isSelected('copy')" :size="15" /></template>
      </MenuItem>
      <MenuItem
        v-if="isAvailable('series')"
        role="menuitemradio"
        :aria-checked="isSelected('series')"
        data-sheet-auto-fill-mode="series"
        @select="selectMode('series')"
      >
        <template #icon><ListOrdered :size="15" /></template>
        {{ t("autoFill.series") }}
        <template #shortcut><Check v-if="isSelected('series')" :size="15" /></template>
      </MenuItem>
      <MenuItem
        v-if="isAvailable('fillFormatsOnly')"
        role="menuitemradio"
        :aria-checked="isSelected('fillFormatsOnly')"
        data-sheet-auto-fill-mode="fillFormatsOnly"
        @select="selectMode('fillFormatsOnly')"
      >
        <template #icon><Paintbrush :size="15" /></template>
        {{ t("autoFill.fillFormatsOnly") }}
        <template #shortcut><Check v-if="isSelected('fillFormatsOnly')" :size="15" /></template>
      </MenuItem>
      <MenuItem
        v-if="isAvailable('fillWithoutFormatting')"
        role="menuitemradio"
        :aria-checked="isSelected('fillWithoutFormatting')"
        data-sheet-auto-fill-mode="fillWithoutFormatting"
        @select="selectMode('fillWithoutFormatting')"
      >
        <template #icon><Clipboard :size="15" /></template>
        {{ t("autoFill.fillWithoutFormatting") }}
        <template #shortcut
          ><Check v-if="isSelected('fillWithoutFormatting')" :size="15"
        /></template>
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateDay')"
        role="menuitemradio"
        :aria-checked="isSelected('dateDay')"
        data-sheet-auto-fill-mode="dateDay"
        @select="selectMode('dateDay')"
      >
        <template #icon><CalendarDays :size="15" /></template>
        {{ t("autoFill.dateDay") }}
        <template #shortcut><Check v-if="isSelected('dateDay')" :size="15" /></template>
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateWeekday')"
        role="menuitemradio"
        :aria-checked="isSelected('dateWeekday')"
        data-sheet-auto-fill-mode="dateWeekday"
        @select="selectMode('dateWeekday')"
      >
        <template #icon><CalendarDays :size="15" /></template>
        {{ t("autoFill.dateWeekday") }}
        <template #shortcut><Check v-if="isSelected('dateWeekday')" :size="15" /></template>
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateMonth')"
        role="menuitemradio"
        :aria-checked="isSelected('dateMonth')"
        data-sheet-auto-fill-mode="dateMonth"
        @select="selectMode('dateMonth')"
      >
        <template #icon><CalendarDays :size="15" /></template>
        {{ t("autoFill.dateMonth") }}
        <template #shortcut><Check v-if="isSelected('dateMonth')" :size="15" /></template>
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateYear')"
        role="menuitemradio"
        :aria-checked="isSelected('dateYear')"
        data-sheet-auto-fill-mode="dateYear"
        @select="selectMode('dateYear')"
      >
        <template #icon><CalendarDays :size="15" /></template>
        {{ t("autoFill.dateYear") }}
        <template #shortcut><Check v-if="isSelected('dateYear')" :size="15" /></template>
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-auto-fill-options {
  &__trigger {
    position: absolute;
    z-index: 95;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: calc(24px / var(--sheet-scale, 1));
    height: calc(20px / var(--sheet-scale, 1));
    gap: 0;
    padding: 0;
    color: var(--idea-text-secondary);
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: 2px;
    box-shadow: var(--idea-shadow-menu);
    cursor: pointer;

    &:hover,
    &[aria-expanded="true"] {
      color: var(--idea-action-primary);
      background: var(--idea-surface-hover);
      border-color: var(--idea-action-primary);
    }

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: 1px;
    }
  }

  &__menu {
    z-index: 96;
    min-width: 188px;
  }
}
</style>
