<script setup lang="ts">
import { TextAlignCenter, TextAlignEnd, TextAlignStart } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
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
    <TButton
      type="button"
      variant="text"
      shape="square"
      size="small"
      class="ui-toolbar-icon-button horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('left') }"
      :disabled="disabled"
      :aria-label="t('format.alignLeft')"
      :title="t('format.alignLeft')"
      :aria-pressed="isActive('left')"
      @click="align('left')"
    >
      <template #icon>
        <TextAlignStart :size="17" :stroke-width="2" aria-hidden="true" />
      </template>
    </TButton>
    <TButton
      type="button"
      variant="text"
      shape="square"
      size="small"
      class="ui-toolbar-icon-button horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('center') }"
      :disabled="disabled"
      :aria-label="t('format.alignCenter')"
      :title="t('format.alignCenter')"
      :aria-pressed="isActive('center')"
      @click="align('center')"
    >
      <template #icon>
        <TextAlignCenter :size="17" :stroke-width="2" aria-hidden="true" />
      </template>
    </TButton>
    <TButton
      type="button"
      variant="text"
      shape="square"
      size="small"
      class="ui-toolbar-icon-button horizontal-alignment-controls__button"
      :class="{ 'is-active': isActive('right') }"
      :disabled="disabled"
      :aria-label="t('format.alignRight')"
      :title="t('format.alignRight')"
      :aria-pressed="isActive('right')"
      @click="align('right')"
    >
      <template #icon>
        <TextAlignEnd :size="17" :stroke-width="2" aria-hidden="true" />
      </template>
    </TButton>
  </div>
</template>

<style scoped lang="scss">
.horizontal-alignment-controls {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;

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
