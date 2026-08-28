<script setup lang="ts">
import { TextAlignCenter, TextAlignEnd, TextAlignStart } from "lucide-vue-next";
import { computed } from "vue";
import type { CellStylePatch, HorizontalCellAlignment } from "../../workbook/cell-style";
import type { SelectionCellStyleState } from "../../workbook/style-state";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const groupLabel = computed(() =>
  t(
    props.state.horizontalAlign.mixed
      ? "format.horizontalAlignmentMixed"
      : "format.horizontalAlignment",
  ),
);

function isActive(alignment: HorizontalCellAlignment): boolean {
  if (props.state.horizontalAlign.mixed) {
    return false;
  }
  return (props.state.horizontalAlign.value ?? "left") === alignment;
}

function align(alignment: HorizontalCellAlignment): void {
  emit("applyStyle", { horizontalAlign: alignment === "left" ? null : alignment });
}
</script>

<template>
  <div
    class="horizontal-alignment-controls"
    :class="{ 'is-mixed': state.horizontalAlign.mixed }"
    role="group"
    :aria-label="groupLabel"
  >
    <button
      type="button"
      class="horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('left') }"
      :disabled="disabled"
      :aria-label="t('format.alignLeft')"
      :title="t('format.alignLeft')"
      :aria-pressed="isActive('left')"
      @click="align('left')"
    >
      <TextAlignStart :size="17" :stroke-width="2" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('center') }"
      :disabled="disabled"
      :aria-label="t('format.alignCenter')"
      :title="t('format.alignCenter')"
      :aria-pressed="isActive('center')"
      @click="align('center')"
    >
      <TextAlignCenter :size="17" :stroke-width="2" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('right') }"
      :disabled="disabled"
      :aria-label="t('format.alignRight')"
      :title="t('format.alignRight')"
      :aria-pressed="isActive('right')"
      @click="align('right')"
    >
      <TextAlignEnd :size="17" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.horizontal-alignment-controls {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;

  &__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--ui-radius-control);
    color: var(--ui-text-primary);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--ui-surface-hover);
    }

    &:focus-visible {
      border-color: var(--ui-brand-primary);
      outline: none;
      box-shadow: 0 0 0 2px var(--ui-brand-soft);
    }

    &.is-active {
      background: var(--ui-brand-soft);
      color: var(--ui-brand-primary);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  &.is-mixed::after {
    position: absolute;
    right: 6px;
    bottom: 2px;
    left: 6px;
    height: 2px;
    background: var(--ui-text-muted);
    content: "";
    pointer-events: none;
  }
}
</style>
