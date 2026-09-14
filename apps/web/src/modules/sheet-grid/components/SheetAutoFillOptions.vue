<script setup lang="ts">
import { ChevronDown, Table2 } from "lucide-vue-next";
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
    placement: "bottom-start",
    offset: 2,
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

function openMenu(keyboard = false): void {
  open.value = true;
  void nextTick(() => {
    const selected = menuElement.value?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]',
    );
    (keyboard ? (selected ?? menuElement.value) : menuElement.value)?.focus();
  });
}

function toggleMenu(event: MouseEvent): void {
  if (open.value) dismiss("programmatic", false);
  else openMenu(event.detail === 0);
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
    openMenu(true);
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
    <Table2 :size="iconSize" aria-hidden="true" />
    <ChevronDown
      class="sheet-auto-fill-options__chevron"
      :class="{ 'is-open': menuOpen }"
      :size="chevronSize"
      aria-hidden="true"
    />
  </button>
  <Teleport to="body">
    <MenuSurface
      v-if="menuOpen"
      :id="menuId"
      ref="menuSurfaceRef"
      class="sheet-auto-fill-options__menu"
      :style="menuStyles"
      :label="t('autoFill.options')"
      tabindex="-1"
      @pointerdown.stop
      @click.stop
    >
      <MenuItem
        v-if="isAvailable('copy')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('copy')"
        data-sheet-auto-fill-mode="copy"
        @select="selectMode('copy')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('copy') }"
        /></template>
        {{ t("autoFill.copy") }}
      </MenuItem>
      <MenuItem
        v-if="isAvailable('series')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('series')"
        data-sheet-auto-fill-mode="series"
        @select="selectMode('series')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('series') }"
        /></template>
        {{ t("autoFill.series") }}
      </MenuItem>
      <MenuItem
        v-if="isAvailable('fillFormatsOnly')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('fillFormatsOnly')"
        data-sheet-auto-fill-mode="fillFormatsOnly"
        @select="selectMode('fillFormatsOnly')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('fillFormatsOnly') }"
        /></template>
        {{ t("autoFill.fillFormatsOnly") }}
      </MenuItem>
      <MenuItem
        v-if="isAvailable('fillWithoutFormatting')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('fillWithoutFormatting')"
        data-sheet-auto-fill-mode="fillWithoutFormatting"
        @select="selectMode('fillWithoutFormatting')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('fillWithoutFormatting') }"
        /></template>
        {{ t("autoFill.fillWithoutFormatting") }}
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateDay')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('dateDay')"
        data-sheet-auto-fill-mode="dateDay"
        @select="selectMode('dateDay')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('dateDay') }"
        /></template>
        {{ t("autoFill.dateDay") }}
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateWeekday')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('dateWeekday')"
        data-sheet-auto-fill-mode="dateWeekday"
        @select="selectMode('dateWeekday')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('dateWeekday') }"
        /></template>
        {{ t("autoFill.dateWeekday") }}
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateMonth')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('dateMonth')"
        data-sheet-auto-fill-mode="dateMonth"
        @select="selectMode('dateMonth')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('dateMonth') }"
        /></template>
        {{ t("autoFill.dateMonth") }}
      </MenuItem>
      <MenuItem
        v-if="isAvailable('dateYear')"
        class="sheet-auto-fill-options__item"
        role="menuitemradio"
        :aria-checked="isSelected('dateYear')"
        data-sheet-auto-fill-mode="dateYear"
        @select="selectMode('dateYear')"
      >
        <template #icon
          ><span
            class="sheet-auto-fill-options__radio"
            :class="{ 'is-selected': isSelected('dateYear') }"
        /></template>
        {{ t("autoFill.dateYear") }}
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
    width: calc(36px / var(--sheet-scale, 1));
    height: calc(24px / var(--sheet-scale, 1));
    gap: calc(3px / var(--sheet-scale, 1));
    padding: 0;
    color: var(--idea-text-secondary);
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-default);
    box-shadow: none;
    cursor: pointer;

    &:hover,
    &[aria-expanded="true"] {
      background: var(--idea-surface-hover);
    }

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: 1px;
    }
  }

  &__chevron {
    &.is-open {
      transform: rotate(180deg);
    }
  }

  &__item {
    grid-template-columns: 16px minmax(0, 1fr);
    min-height: 32px;
    padding-inline: 14px 20px;
  }

  &__radio {
    display: grid;
    width: 13px;
    height: 13px;
    place-items: center;
    border: 1px solid var(--idea-border-control);
    border-radius: 50%;

    &.is-selected::after {
      width: 5px;
      height: 5px;
      content: "";
      background: var(--idea-text-secondary);
      border-radius: 50%;
    }
  }

  &__menu {
    z-index: 96;
    min-width: 156px;
    border-radius: var(--idea-radius-medium);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--idea-text-primary) 8%, transparent);
    outline: none;
  }
}
</style>
