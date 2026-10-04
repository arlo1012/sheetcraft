<script setup lang="ts">
import { ChevronDown, Table2 } from "lucide-vue-next";
import type { CellFillMode } from "@idea10/core/cell-autofill";
import { computed, ref, useId } from "vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
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
const menuId = `sheet-auto-fill-options-${useId().replaceAll(":", "")}`;
const triggerStyle = computed(() => ({
  left: `${props.position.x}px`,
  top: `${props.position.y}px`,
}));
const iconSize = computed(() => 14 / props.scale);
const chevronSize = computed(() => 11 / props.scale);
const {
  open: menuOpen,
  floatingStyles: menuStyles,
  dismiss,
  toggleMenu,
  onTriggerKeydown,
} = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => !props.visible),
  placement: "bottom-start",
  offset: 2,
  defaultFocus: "selected",
  pointerFocus: "menu",
});

function isAvailable(mode: CellFillMode): boolean {
  return props.availableModes.includes(mode);
}

function isSelected(mode: CellFillMode): boolean {
  return props.currentMode === mode;
}

function selectMode(mode: CellFillMode): void {
  if (!isAvailable(mode)) return;
  dismiss("programmatic", false);
  emit("select", mode);
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
      <MenuRadioItem
        v-if="isAvailable('copy')"
        :checked="isSelected('copy')"
        data-sheet-auto-fill-mode="copy"
        @select="selectMode('copy')"
      >
        {{ t("autoFill.copy") }}
      </MenuRadioItem>
      <MenuRadioItem
        v-if="isAvailable('series')"
        :checked="isSelected('series')"
        data-sheet-auto-fill-mode="series"
        @select="selectMode('series')"
      >
        {{ t("autoFill.series") }}
      </MenuRadioItem>
      <MenuRadioItem
        v-if="isAvailable('fillFormatsOnly')"
        :checked="isSelected('fillFormatsOnly')"
        data-sheet-auto-fill-mode="fillFormatsOnly"
        @select="selectMode('fillFormatsOnly')"
      >
        {{ t("autoFill.fillFormatsOnly") }}
      </MenuRadioItem>
      <MenuRadioItem
        v-if="isAvailable('fillWithoutFormatting')"
        :checked="isSelected('fillWithoutFormatting')"
        data-sheet-auto-fill-mode="fillWithoutFormatting"
        @select="selectMode('fillWithoutFormatting')"
      >
        {{ t("autoFill.fillWithoutFormatting") }}
      </MenuRadioItem>
      <MenuRadioItem
        v-if="isAvailable('dateDay')"
        :checked="isSelected('dateDay')"
        data-sheet-auto-fill-mode="dateDay"
        @select="selectMode('dateDay')"
      >
        {{ t("autoFill.dateDay") }}
      </MenuRadioItem>
      <MenuRadioItem
        v-if="isAvailable('dateWeekday')"
        :checked="isSelected('dateWeekday')"
        data-sheet-auto-fill-mode="dateWeekday"
        @select="selectMode('dateWeekday')"
      >
        {{ t("autoFill.dateWeekday") }}
      </MenuRadioItem>
      <MenuRadioItem
        v-if="isAvailable('dateMonth')"
        :checked="isSelected('dateMonth')"
        data-sheet-auto-fill-mode="dateMonth"
        @select="selectMode('dateMonth')"
      >
        {{ t("autoFill.dateMonth") }}
      </MenuRadioItem>
      <MenuRadioItem
        v-if="isAvailable('dateYear')"
        :checked="isSelected('dateYear')"
        data-sheet-auto-fill-mode="dateYear"
        @select="selectMode('dateYear')"
      >
        {{ t("autoFill.dateYear") }}
      </MenuRadioItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-auto-fill-options {
  &__trigger {
    position: absolute;
    z-index: var(--idea-layer-toolbar);
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
  }

  &__chevron {
    &.is-open {
      transform: rotate(180deg);
    }
  }

  &__menu {
    z-index: var(--idea-layer-context-menu);
    outline: none;
  }
}
</style>
