<script setup lang="ts">
import { computed, ref, type CSSProperties } from "vue";
import {
  DEFAULT_CELL_FILL_COLOR,
  DEFAULT_CELL_TEXT_COLOR,
  type CellStylePatch,
} from "@idea10/core/style";
import { useAppI18n } from "../../../shared/i18n";
import CellColorPicker from "./CellColorPicker.vue";

const props = defineProps<{
  kind: "text" | "fill";
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const selectedColor = ref<string | null>(props.kind === "text" ? "#ff0000" : "#ffff00");
const defaultColor = computed(() =>
  props.kind === "text" ? DEFAULT_CELL_TEXT_COLOR : DEFAULT_CELL_FILL_COLOR,
);
const indicatorStyle = computed<CSSProperties>(() => ({
  "--cell-color-indicator": selectedColor.value ?? defaultColor.value,
}));
const label = computed(() => t(props.kind === "text" ? "format.textColor" : "format.fillColor"));
const defaultLabel = computed(() =>
  t(props.kind === "text" ? "cellFormat.automatic" : "cellFormat.noFill"),
);

function applyColor(color: string | null): void {
  if (props.disabled) return;
  selectedColor.value = color;
  emit("applyStyle", props.kind === "text" ? { textColor: color } : { fillColor: color });
}
</script>

<template>
  <div class="cell-color-control" :data-cell-color-control="kind">
    <CellColorPicker
      :label="label"
      :value="selectedColor"
      :default-color="defaultColor"
      :default-label="defaultLabel"
      :disabled="disabled"
      @change="applyColor"
    >
      <span class="cell-color-control__icon" :style="indicatorStyle" :data-cell-color-icon="kind">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <g transform="translate(0 -0.5) scale(1 0.9)">
            <path v-if="kind === 'text'" d="m4 17 8-14 8 14M7.5 11h9" />
            <template v-else>
              <path
                d="m8 4 2-2a1 1 0 0 1 1.4 0l8.6 8.6a1 1 0 0 1 0 1.4l-6 6a3 3 0 0 1-4.2 0l-6-6a3 3 0 0 1 0-4.2L6 5.6M5 2l6 6M3 12h16"
              />
            </template>
          </g>
          <rect
            class="cell-color-control__indicator"
            x="1.5"
            y="19"
            width="21"
            height="4"
            rx="1.5"
            stroke="none"
            data-color-indicator
          />
        </svg>
      </span>
    </CellColorPicker>
  </div>
</template>

<style scoped lang="scss">
.cell-color-control {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: var(--ribbon-control-height, 26px);

  &__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--idea-icon-size, var(--idea-action-icon-size));
    height: var(--idea-icon-size, var(--idea-action-icon-size));

    svg {
      stroke-width: var(--idea-icon-stroke-width);
    }
  }

  &__indicator {
    fill: var(--cell-color-indicator);
  }
}
</style>
