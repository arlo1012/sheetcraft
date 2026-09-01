<script setup lang="ts">
import { Baseline, PaintBucket } from "lucide-vue-next";
import { computed, type CSSProperties } from "vue";
import {
  DEFAULT_CELL_FILL_COLOR,
  DEFAULT_CELL_TEXT_COLOR,
  type CellStylePatch,
} from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellColorPicker from "./CellColorPicker.vue";

const props = defineProps<{
  kind: "text" | "fill";
  state: SelectionCellStyleState;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const colorState = computed(() =>
  props.kind === "text" ? props.state.textColor : props.state.fillColor,
);
const defaultColor = computed(() =>
  props.kind === "text" ? DEFAULT_CELL_TEXT_COLOR : DEFAULT_CELL_FILL_COLOR,
);
const indicatorStyle = computed<CSSProperties>(() => ({
  "--cell-color-indicator": colorState.value.value ?? defaultColor.value,
}));
const label = computed(() => {
  if (props.kind === "text") {
    return t(props.state.textColor.mixed ? "format.textColorMixed" : "format.textColor");
  }
  return t(props.state.fillColor.mixed ? "format.fillColorMixed" : "format.fillColor");
});

function applyColor(color: string | null): void {
  emit("applyStyle", props.kind === "text" ? { textColor: color } : { fillColor: color });
}
</script>

<template>
  <div class="cell-color-control" :data-cell-color-control="kind">
    <CellColorPicker
      :label="label"
      :value="colorState.value"
      :default-color="defaultColor"
      :mixed="colorState.mixed"
      :disabled="disabled"
      @change="applyColor"
    >
      <span
        class="cell-color-control__icon"
        :class="[`cell-color-control__icon--${kind}`, { 'is-mixed': colorState.mixed }]"
        :style="indicatorStyle"
        :data-cell-color-icon="kind"
      >
        <Baseline v-if="kind === 'text'" :size="18" :stroke-width="1.8" aria-hidden="true" />
        <PaintBucket v-else :size="18" :stroke-width="1.8" aria-hidden="true" />
        <span class="cell-color-control__indicator" data-color-indicator />
      </span>
    </CellColorPicker>
  </div>
</template>

<style scoped lang="scss">
.cell-color-control {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: var(--cell-format-control-height, 26px);

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;

    &--text {
      position: relative;

      :deep(svg) {
        transform: translateY(1px);
      }

      :deep(path:first-of-type) {
        display: none;
      }
    }

    &--fill {
      position: relative;

      :deep(svg) {
        transform: translateY(-1px);
      }

      :deep(path:nth-of-type(3)) {
        display: none;
      }
    }
  }

  &__indicator {
    position: absolute;
    right: 2px;
    bottom: 0;
    left: 2px;
    height: 3px;
    background: var(--cell-color-indicator);
    border-radius: 1px;
    box-shadow: inset 0 0 0 1px rgb(32 36 44 / 22%);
  }

  &__icon.is-mixed &__indicator {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--td-text-color-placeholder);
  }
}
</style>
