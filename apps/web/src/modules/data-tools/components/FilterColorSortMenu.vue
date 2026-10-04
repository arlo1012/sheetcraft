<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { PaintBucket } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { FilterColorSort } from "../data-tools-types";

const props = defineProps<{
  colors: { cellColors: readonly (string | null)[]; fontColors: readonly string[] };
  disabled?: boolean;
}>();
const emit = defineEmits<{ select: [sort: FilterColorSort]; custom: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof TButton> | null>(null);
const triggerRef = computed<HTMLElement | null>(() => buttonRef.value?.$el ?? null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `filter-color-sort-${useId().replaceAll(":", "")}`;
const cellColors = computed(() => [...new Set(props.colors.cellColors)]);
const fontColors = computed(() => [...new Set(props.colors.fontColors)]);
const colorColumns = computed(() =>
  Math.min(5, Math.max(cellColors.value.length, fontColors.value.length, 1)),
);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => Boolean(props.disabled)),
  placement: "bottom-start",
});
defineExpose({ rootElement: computed(() => surfaceRef.value?.rootElement ?? null) });

function label(color: string | null): string {
  return color === null ? t("dataTools.sort.noFill") : color.toUpperCase();
}
function select(sort: FilterColorSort): void {
  dismiss("programmatic", false);
  emit("select", sort);
}
function custom(): void {
  dismiss("programmatic", false);
  emit("custom");
}
</script>

<template>
  <TButton
    ref="buttonRef"
    variant="text"
    theme="default"
    size="small"
    :disabled="disabled"
    :aria-label="t('dataTools.filter.colorSort')"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="menuId"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <template #icon><PaintBucket class="idea-action-icon" aria-hidden="true" /></template>
    {{ t("dataTools.filter.colorSort") }}
  </TButton>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="surfaceRef"
      class="filter-color-sort-menu"
      :style="[floatingStyles, { '--color-sort-columns': colorColumns }]"
      :label="t('dataTools.filter.colorSort')"
      @keydown.esc.stop.prevent="dismiss('escape', true)"
    >
      <li class="filter-color-sort-menu__label" role="presentation">
        {{ t("dataTools.filter.sortFillColors") }}
      </li>
      <li class="filter-color-sort-menu__choices" role="none">
        <button
          v-for="color in cellColors"
          :key="color ?? 'no-fill'"
          class="filter-color-sort-menu__color"
          :class="{ 'is-no-fill': color === null }"
          :style="color === null ? undefined : { backgroundColor: color }"
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="disabled"
          :aria-label="t('dataTools.filter.sortFillColor', { color: label(color) })"
          :title="label(color)"
          @click="select({ sortOn: 'cellColor', color })"
        />
        <span v-if="!cellColors.length" class="filter-color-sort-menu__empty">{{
          t("dataTools.sort.noColors")
        }}</span>
      </li>
      <li class="filter-color-sort-menu__label" role="presentation">
        {{ t("dataTools.filter.sortFontColors") }}
      </li>
      <li class="filter-color-sort-menu__choices" role="none">
        <button
          v-for="color in fontColors"
          :key="color"
          class="filter-color-sort-menu__color filter-color-sort-menu__font"
          :style="{ color }"
          type="button"
          role="menuitem"
          tabindex="-1"
          :disabled="disabled"
          :aria-label="t('dataTools.filter.sortFontColor', { color: label(color) })"
          :title="label(color)"
          @click="select({ sortOn: 'fontColor', color })"
        >
          A
        </button>
        <span v-if="!fontColors.length" class="filter-color-sort-menu__empty">{{
          t("dataTools.sort.noColors")
        }}</span>
      </li>
      <MenuSeparator />
      <MenuItem @select="custom">{{ t("dataTools.sort.custom") }}</MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.filter-color-sort-menu {
  z-index: var(--idea-layer-popover-submenu);
  width: max-content;

  &__label {
    padding: 4px 14px;
    color: var(--idea-text-secondary);
  }
  &__choices {
    display: grid;
    grid-template-columns: repeat(var(--color-sort-columns), 24px);
    gap: 8px;
    padding: 4px 14px 10px;
  }
  &__color {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--idea-border-control);
    border-radius: 50%;
    background: var(--idea-surface-panel);
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--idea-action-primary);
    }
    &.is-no-fill {
      background: linear-gradient(
        135deg,
        transparent 46%,
        var(--idea-border-control) 48%,
        var(--idea-border-control) 52%,
        transparent 54%
      );
    }
  }
  &__font {
    font-size: 18px;
    font-weight: var(--idea-font-weight-semibold);
    line-height: 1;
  }
  &__empty {
    grid-column: 1 / -1;
    white-space: nowrap;
    color: var(--idea-text-secondary);
  }
}
</style>
