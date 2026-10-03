<script setup lang="ts">
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { computed, ref, watch } from "vue";
import type { CellAddress, Sheet, SheetEvaluator } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import { getColumnChoices } from "../column-context-data";

const props = defineProps<{
  sheet: Sheet;
  evaluator: SheetEvaluator;
  address: CellAddress;
  readOnly?: boolean;
}>();
const emit = defineEmits<{ choose: [value: string]; close: [] }>();
const { t } = useAppI18n();
const search = ref("");
const choiceListRef = ref<HTMLElement | null>(null);
const choices = computed(() => getColumnChoices(props.sheet, props.address, props.evaluator));
const filteredChoices = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return query === ""
    ? choices.value
    : choices.value.filter((choice) => choice.value.toLocaleLowerCase().includes(query));
});

function choose(value: string): void {
  if (props.readOnly) return;
  emit("choose", value);
}

function onChoiceListKeydown(event: KeyboardEvent): void {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const buttons = [
    ...(choiceListRef.value?.querySelectorAll<HTMLButtonElement>('button[role="option"]') ?? []),
  ].filter((button) => !button.disabled);
  if (buttons.length === 0) return;
  const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowUp"
          ? Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)
          : Math.min(buttons.length - 1, currentIndex < 0 ? 0 : currentIndex + 1);
  event.preventDefault();
  buttons[nextIndex]?.focus();
}

watch(
  () => props.address,
  () => {
    search.value = "";
  },
  { deep: true },
);
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('contextMenu.chooseFromColumn')"
    :visible="true"
    :header="t('contextMenu.chooseFromColumn')"
    :confirm-btn="null"
    :cancel-btn="t('cellFormat.cancel')"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    width="min(420px, calc(100vw - 32px))"
    placement="center"
    class="sheet-column-choice-dialog"
    @close="emit('close')"
  >
    <TInput
      v-model="search"
      clearable
      :placeholder="t('contextMenu.searchChoices')"
      :aria-label="t('contextMenu.searchChoices')"
      data-column-choice-search
    />
    <ul
      ref="choiceListRef"
      class="sheet-column-choice-dialog__list"
      role="listbox"
      :aria-label="t('contextMenu.chooseFromColumn')"
      @keydown="onChoiceListKeydown"
    >
      <li v-if="filteredChoices.length === 0" class="sheet-column-choice-dialog__empty">
        {{ t("contextMenu.noChoices") }}
      </li>
      <li v-for="choice in filteredChoices" :key="choice.value">
        <button
          type="button"
          role="option"
          :aria-selected="false"
          :disabled="readOnly"
          :title="choice.value"
          :data-column-choice="choice.value"
          @click="choose(choice.value)"
        >
          <span>{{ choice.value }}</span>
          <small>{{ choice.count }}</small>
        </button>
      </li>
    </ul>
  </Dialog>
</template>

<style scoped lang="scss">
.sheet-column-choice-dialog {
  &__list {
    max-height: min(360px, 48vh);
    padding: 0;
    margin: var(--idea-space-3) 0 0;
    overflow: auto;
    list-style: none;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-small);
  }

  li + li {
    border-top: 1px solid var(--idea-border-control);
  }

  button {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: var(--idea-space-2);
    padding: 8px var(--idea-space-3);
    color: var(--idea-text-primary);
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;

    &:hover:not(:disabled) {
      background: var(--idea-surface-hover);
      outline: none;
    }
    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      margin-left: auto;
      color: var(--idea-text-secondary);
      font-variant-numeric: tabular-nums;
    }
  }

  &__empty {
    padding: var(--idea-space-4);
    color: var(--idea-text-secondary);
    text-align: center;
  }
}
</style>
