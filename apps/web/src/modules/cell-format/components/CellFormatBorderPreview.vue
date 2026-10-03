<script setup lang="ts">
import type { SelectionBorderState } from "@idea10/core/style-state";
import CellBorderPresetIcon from "../../../shared/borders/CellBorderPresetIcon.vue";
import { vIconAction } from "../../../shared/focus/icon-action";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatBorderPreviewEdge from "./CellFormatBorderPreviewEdge.vue";
import type { CellFormatBorderCapabilities } from "../border-capabilities";

defineProps<{
  state: SelectionBorderState;
  capabilities?: CellFormatBorderCapabilities;
}>();
const emit = defineEmits<{ toggle: [side: keyof SelectionBorderState] }>();
const { t } = useAppI18n();
</script>

<template>
  <div class="cell-format-border-preview">
    <div class="cell-format-border-preview__horizontal-controls">
      <span
        v-icon-action
        :data-border-side="'top'"
        :aria-label="t('format.borderTop')"
        :title="t('format.borderTop')"
        :aria-pressed="state.top.mixed ? 'mixed' : Boolean(state.top.value)"
        @click="emit('toggle', 'top')"
      >
        <CellBorderPresetIcon preset="top" />
      </span>
      <span
        v-icon-action="capabilities?.innerHorizontal === false"
        :data-border-side="'innerHorizontal'"
        :aria-label="t('format.borderInnerHorizontal')"
        :title="t('format.borderInnerHorizontal')"
        :aria-pressed="state.innerHorizontal.mixed ? 'mixed' : Boolean(state.innerHorizontal.value)"
        @click="emit('toggle', 'innerHorizontal')"
      >
        <CellBorderPresetIcon preset="innerHorizontal" />
      </span>
      <span
        v-icon-action
        :data-border-side="'bottom'"
        :aria-label="t('format.borderBottom')"
        :title="t('format.borderBottom')"
        :aria-pressed="state.bottom.mixed ? 'mixed' : Boolean(state.bottom.value)"
        @click="emit('toggle', 'bottom')"
      >
        <CellBorderPresetIcon preset="bottom" />
      </span>
    </div>
    <div class="cell-format-border-preview__surface">
      <div
        class="cell-format-border-preview__samples"
        :class="{
          'has-rows': capabilities?.innerHorizontal !== false,
          'has-columns': capabilities?.innerVertical !== false,
        }"
        aria-hidden="true"
      >
        <span>{{ t("cellFormat.previewText") }}</span>
        <span v-if="capabilities?.innerVertical !== false">{{ t("cellFormat.previewText") }}</span>
        <span v-if="capabilities?.innerHorizontal !== false">{{
          t("cellFormat.previewText")
        }}</span>
        <span
          v-if="capabilities?.innerHorizontal !== false && capabilities?.innerVertical !== false"
          >{{ t("cellFormat.previewText") }}</span
        >
      </div>
      <svg
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        role="group"
        :aria-label="t('cellFormat.borderPreview')"
      >
        <g
          class="cell-format-border-preview__guides"
          fill="none"
          stroke="var(--idea-border-control)"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        >
          <path
            d="M 18 24 V 18 H 24 M 276 18 H 282 V 24 M 18 176 V 182 H 24 M 276 182 H 282 V 176"
          />
          <path
            v-if="capabilities?.innerVertical !== false"
            d="M 144 18 H 156 M 150 18 V 24 M 144 182 H 156 M 150 182 V 176"
          />
          <path
            v-if="capabilities?.innerHorizontal !== false"
            d="M 18 94 V 106 M 18 100 H 24 M 282 94 V 106 M 276 100 H 282"
          />
          <path
            v-if="capabilities?.innerHorizontal !== false && capabilities?.innerVertical !== false"
            d="M 144 100 H 156 M 150 94 V 106"
          />
        </g>
        <CellFormatBorderPreviewEdge
          side="top"
          :border="state.top.value"
          :mixed="state.top.mixed"
          :label="t('format.borderTop')"
          @toggle="emit('toggle', 'top')"
        />
        <CellFormatBorderPreviewEdge
          side="right"
          :border="state.right.value"
          :mixed="state.right.mixed"
          :label="t('format.borderRight')"
          @toggle="emit('toggle', 'right')"
        />
        <CellFormatBorderPreviewEdge
          side="bottom"
          :border="state.bottom.value"
          :mixed="state.bottom.mixed"
          :label="t('format.borderBottom')"
          @toggle="emit('toggle', 'bottom')"
        />
        <CellFormatBorderPreviewEdge
          side="left"
          :border="state.left.value"
          :mixed="state.left.mixed"
          :label="t('format.borderLeft')"
          @toggle="emit('toggle', 'left')"
        />
        <CellFormatBorderPreviewEdge
          side="innerHorizontal"
          :disabled="capabilities?.innerHorizontal === false"
          :border="state.innerHorizontal.value"
          :mixed="state.innerHorizontal.mixed"
          :label="t('format.borderInnerHorizontal')"
          @toggle="emit('toggle', 'innerHorizontal')"
        />
        <CellFormatBorderPreviewEdge
          side="innerVertical"
          :disabled="capabilities?.innerVertical === false"
          :border="state.innerVertical.value"
          :mixed="state.innerVertical.mixed"
          :label="t('format.borderInnerVertical')"
          @toggle="emit('toggle', 'innerVertical')"
        />
        <CellFormatBorderPreviewEdge
          side="diagonalUp"
          :border="state.diagonalUp.value"
          :mixed="state.diagonalUp.mixed"
          :label="t('format.borderDiagonalUp')"
          @toggle="emit('toggle', 'diagonalUp')"
        />
        <CellFormatBorderPreviewEdge
          side="diagonalDown"
          :border="state.diagonalDown.value"
          :mixed="state.diagonalDown.mixed"
          :label="t('format.borderDiagonalDown')"
          @toggle="emit('toggle', 'diagonalDown')"
        />
      </svg>
    </div>
    <div class="cell-format-border-preview__vertical-controls">
      <span
        v-icon-action
        :data-border-side="'diagonalUp'"
        :aria-label="t('format.borderDiagonalUp')"
        :title="t('format.borderDiagonalUp')"
        :aria-pressed="state.diagonalUp.mixed ? 'mixed' : Boolean(state.diagonalUp.value)"
        @click="emit('toggle', 'diagonalUp')"
      >
        <CellBorderPresetIcon preset="diagonalUp" />
      </span>
      <span
        v-icon-action
        :data-border-side="'left'"
        :aria-label="t('format.borderLeft')"
        :title="t('format.borderLeft')"
        :aria-pressed="state.left.mixed ? 'mixed' : Boolean(state.left.value)"
        @click="emit('toggle', 'left')"
      >
        <CellBorderPresetIcon preset="left" />
      </span>
      <span
        v-icon-action="capabilities?.innerVertical === false"
        :data-border-side="'innerVertical'"
        :aria-label="t('format.borderInnerVertical')"
        :title="t('format.borderInnerVertical')"
        :aria-pressed="state.innerVertical.mixed ? 'mixed' : Boolean(state.innerVertical.value)"
        @click="emit('toggle', 'innerVertical')"
      >
        <CellBorderPresetIcon preset="innerVertical" />
      </span>
      <span
        v-icon-action
        :data-border-side="'right'"
        :aria-label="t('format.borderRight')"
        :title="t('format.borderRight')"
        :aria-pressed="state.right.mixed ? 'mixed' : Boolean(state.right.value)"
        @click="emit('toggle', 'right')"
      >
        <CellBorderPresetIcon preset="right" />
      </span>
      <span
        v-icon-action
        :data-border-side="'diagonalDown'"
        :aria-label="t('format.borderDiagonalDown')"
        :title="t('format.borderDiagonalDown')"
        :aria-pressed="state.diagonalDown.mixed ? 'mixed' : Boolean(state.diagonalDown.value)"
        @click="emit('toggle', 'diagonalDown')"
      >
        <CellBorderPresetIcon preset="diagonalDown" />
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cell-format-border-preview {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  grid-template-rows: 208px 32px;
  gap: 8px;

  &__horizontal-controls {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  &__vertical-controls {
    display: flex;
    grid-column: 1 / -1;
    justify-content: space-between;
  }
  &__horizontal-controls,
  &__vertical-controls {
    > span {
      display: grid;
      flex: none;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--idea-border-subtle);
      border-radius: var(--idea-radius-default);
      background: var(--idea-surface-panel);
      color: var(--idea-text-primary);
      cursor: pointer;

      &:hover:not([aria-disabled="true"]) {
        background: var(--idea-icon-button-hover-bg);
      }
      &[aria-pressed="true"] {
        border-color: var(--idea-action-primary);
        background: var(--idea-surface-selected);
      }
      &[aria-pressed="mixed"] {
        border-style: dashed;
        color: var(--idea-text-muted);
      }

      &[aria-disabled="true"] {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }
  }
  &__surface {
    position: relative;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-panel);

    > svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
  }
  &__guides {
    pointer-events: none;
  }
  &__samples {
    position: absolute;
    inset: 9% 6%;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    place-items: center;
    overflow: hidden;
    color: var(--idea-text-primary);
    pointer-events: none;

    &.has-rows {
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
    &.has-columns {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    > span {
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
    }
  }
}
</style>
