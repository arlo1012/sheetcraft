<script setup lang="ts">
import type { CellBorder, CellBorderAction, CellBorderPreset } from "@idea10/core/style";
import { useAppI18n } from "../../../shared/i18n";
import CellBorderPresetIcon from "../../../shared/borders/CellBorderPresetIcon.vue";
import { vIconAction } from "../../../shared/focus/icon-action";

const props = defineProps<{
  border: CellBorder;
}>();

const emit = defineEmits<{
  select: [action: CellBorderAction];
}>();

const { t } = useAppI18n();

function selectPreset(preset: CellBorderPreset): void {
  if (preset === "none") {
    emit("select", { preset });
    return;
  }
  emit("select", { preset, border: { ...props.border } });
}
</script>

<template>
  <div class="border-preset-grid" :aria-label="t('format.borderPresets')">
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="none"
      :aria-label="t('format.borderNone')"
      :title="t('format.borderNone')"
      @click="selectPreset('none')"
    >
      <CellBorderPresetIcon preset="none" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="all"
      :aria-label="t('format.borderAll')"
      :title="t('format.borderAll')"
      @click="selectPreset('all')"
    >
      <CellBorderPresetIcon preset="all" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="outer"
      :aria-label="t('format.borderOuter')"
      :title="t('format.borderOuter')"
      @click="selectPreset('outer')"
    >
      <CellBorderPresetIcon preset="outer" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="inner"
      :aria-label="t('format.borderInner')"
      :title="t('format.borderInner')"
      @click="selectPreset('inner')"
    >
      <CellBorderPresetIcon preset="inner" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="top"
      :aria-label="t('format.borderTop')"
      :title="t('format.borderTop')"
      @click="selectPreset('top')"
    >
      <CellBorderPresetIcon preset="top" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="innerHorizontal"
      :aria-label="t('format.borderInnerHorizontal')"
      :title="t('format.borderInnerHorizontal')"
      @click="selectPreset('innerHorizontal')"
    >
      <CellBorderPresetIcon preset="innerHorizontal" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="innerVertical"
      :aria-label="t('format.borderInnerVertical')"
      :title="t('format.borderInnerVertical')"
      @click="selectPreset('innerVertical')"
    >
      <CellBorderPresetIcon preset="innerVertical" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="left"
      :aria-label="t('format.borderLeft')"
      :title="t('format.borderLeft')"
      @click="selectPreset('left')"
    >
      <CellBorderPresetIcon preset="left" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="bottom"
      :aria-label="t('format.borderBottom')"
      :title="t('format.borderBottom')"
      @click="selectPreset('bottom')"
    >
      <CellBorderPresetIcon preset="bottom" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="right"
      :aria-label="t('format.borderRight')"
      :title="t('format.borderRight')"
      @click="selectPreset('right')"
    >
      <CellBorderPresetIcon preset="right" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="diagonalUp"
      :aria-label="t('format.borderDiagonalUp')"
      :title="t('format.borderDiagonalUp')"
      @click="selectPreset('diagonalUp')"
    >
      <CellBorderPresetIcon preset="diagonalUp" />
    </span>
    <span
      v-icon-action
      role="menuitem"
      data-border-menu-item
      data-border-preset="diagonalDown"
      :aria-label="t('format.borderDiagonalDown')"
      :title="t('format.borderDiagonalDown')"
      @click="selectPreset('diagonalDown')"
    >
      <CellBorderPresetIcon preset="diagonalDown" />
    </span>
  </div>
</template>

<style scoped lang="scss">
.border-preset-grid {
  display: grid;
  grid-template-columns: repeat(4, 26px);
  grid-template-rows: repeat(3, 26px);
  justify-content: space-between;
  gap: 2px;
  padding-bottom: 5px;

  > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--idea-text-primary);
    cursor: pointer;

    &:hover {
      background: var(--idea-surface-hover);
      outline: none;
    }
  }
}
</style>
