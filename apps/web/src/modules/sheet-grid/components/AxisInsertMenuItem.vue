<script setup lang="ts">
import { Check } from "lucide-vue-next";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { computed, ref } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import MenuItem from "../../../shared/menu/MenuItem.vue";

const props = defineProps<{
  label: string;
  action: string;
  initialCount: number;
  maximum: number;
  disabled: boolean;
  compact?: boolean;
}>();
const emit = defineEmits<{ insert: [count: number] }>();
const { t } = useAppI18n();
const draft = ref<InputNumberValue>(props.initialCount);
const valid = computed(
  () =>
    typeof draft.value === "number" &&
    Number.isInteger(draft.value) &&
    draft.value >= 1 &&
    draft.value <= props.maximum,
);
function onInputKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
    event.preventDefault();
    event.stopPropagation();
    insert();
  }
}

function insert(): void {
  if (!props.disabled && valid.value) emit("insert", draft.value as number);
}
</script>

<template>
  <MenuItem :data-row-column-action="action" :disabled="disabled || !valid" @select="insert">
    <template #icon><slot /></template>
    {{ label }}
    <template #trailing>
      <div
        class="axis-insert-menu-item__controls"
        role="group"
        :aria-label="label"
        @keydown="onInputKeydown"
      >
        <TInputNumber
          v-model="draft"
          class="axis-insert-menu-item__count sheetcraft-input-number--persistent-controls"
          :style="{ width: compact ? '48px' : '64px', minWidth: '0' }"
          :min="1"
          :max="Math.max(1, maximum)"
          :decimal-places="0"
          :step="1"
          :disabled="disabled || maximum < 1"
          size="small"
          theme="column"
          :aria-label="`${label} · ${t('axisMenu.insertCount')}`"
          :data-axis-insert-count="action"
        />
        <span
          v-icon-action="disabled || !valid"
          class="axis-insert-menu-item__confirm"
          :aria-label="`${t('cellFormat.confirm')} · ${label}`"
          :data-axis-insert-confirm="action"
          @click="insert"
        >
          <Check :size="14" aria-hidden="true" />
        </span>
      </div>
    </template>
  </MenuItem>
</template>

<style scoped lang="scss">
.axis-insert-menu-item {
  &__controls {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
  }
  &__confirm {
    display: grid;
    place-items: center;
    width: 22px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--sheetcraft-radius-default);
    color: var(--sheetcraft-text-secondary);
    background: transparent;
    cursor: pointer;

    &[aria-disabled="true"] {
      color: var(--sheetcraft-text-disabled);
      cursor: default;
    }
  }
}
</style>
