<script setup lang="ts">
import { computed } from "vue";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import type { CellTextRotation } from "@idea10/core/style";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  modelValue: CellTextRotation | undefined;
  mixed: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: CellTextRotation | null];
}>();
const { t } = useAppI18n();
const degrees = computed(() => (typeof props.modelValue === "number" ? props.modelValue : 0));

function setDegrees(next: InputNumberValue): void {
  if (typeof next !== "number" || !Number.isFinite(next)) return;
  const value = Math.max(-90, Math.min(90, Math.round(next)));
  emit("update:modelValue", value || null);
}
function setVertical(next: boolean): void {
  emit("update:modelValue", next ? "vertical" : null);
}
</script>

<template>
  <fieldset class="cell-format-text-orientation">
    <legend>{{ t("cellFormat.orientation") }}</legend>
    <div class="cell-format-text-orientation__dial" aria-hidden="true">
      <span :style="{ transform: `rotate(${-degrees}deg)` }"></span>
      <i
        v-for="tick in 9"
        :key="tick"
        :style="{ transform: `rotate(${(tick - 5) * 22.5}deg)` }"
      ></i>
    </div>
    <label class="cell-format-text-orientation__range">
      <span class="sr-only">{{ t("cellFormat.rotationDegrees") }}</span>
      <input
        type="range"
        min="-90"
        max="90"
        step="1"
        :value="degrees"
        :disabled="modelValue === 'vertical'"
        data-cell-format-rotation-dial
        @input="setDegrees(Number(($event.target as HTMLInputElement).value))"
      />
    </label>
    <div
      class="cell-format-text-orientation__input"
      role="group"
      :aria-label="t('cellFormat.rotationDegrees')"
    >
      <TInputNumber
        :model-value="typeof modelValue === 'number' ? modelValue : undefined"
        :min="-90"
        :max="90"
        :decimal-places="0"
        :disabled="modelValue === 'vertical'"
        theme="column"
        class="idea-input-number--persistent-controls"
        :placeholder="mixed ? t('format.mixed') : undefined"
        data-cell-format-rotation
        @change="setDegrees"
      />
      <span>{{ t("cellFormat.degrees") }}</span>
    </div>
    <TCheckbox
      :model-value="modelValue === 'vertical'"
      :indeterminate="mixed"
      data-cell-format-vertical-text
      @change="setVertical"
      >{{ t("cellFormat.verticalText") }}</TCheckbox
    >
  </fieldset>
</template>

<style scoped lang="scss">
.cell-format-text-orientation {
  display: grid;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  > legend {
    padding: 0 0 8px;
    font-weight: var(--idea-font-weight-semibold);
  }

  &__dial {
    position: relative;
    display: grid;
    place-items: center;
    width: 118px;
    height: 118px;
    margin: 0 auto 8px;
    overflow: hidden;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-default);

    span {
      width: 70px;
      height: 1px;
      background: var(--idea-text-primary);
      transform-origin: center;

      &::before {
        position: absolute;
        top: -3px;
        left: 33px;
        width: 7px;
        height: 7px;
        background: var(--idea-action-primary);
        border-radius: 50%;
        content: "";
      }
    }

    i {
      position: absolute;
      width: 4px;
      height: 4px;
      margin-top: -86px;
      background: var(--idea-text-primary);
      border-radius: 50%;
      transform-origin: 2px 61px;
    }
  }

  &__range {
    margin: 0 0 8px;

    input {
      width: 100%;
    }
  }

  &__input {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }
}

@media (max-width: 520px) {
  .cell-format-text-orientation {
    grid-template-columns: 118px minmax(0, 1fr);
    column-gap: 12px;

    > legend {
      grid-column: 1 / -1;
    }
    &__dial {
      grid-row: span 3;
    }
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
