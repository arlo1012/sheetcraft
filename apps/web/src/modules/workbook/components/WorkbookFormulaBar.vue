<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import type { CellAddress } from "@idea10/core/workbook";
import WorkbookFormulaBarAddressInput from "./WorkbookFormulaBarAddressInput.vue";
import WorkbookFormulaBarSearchControls from "./WorkbookFormulaBarSearchControls.vue";

const props = defineProps<{
  address: CellAddress;
  addressLabel: string;
  inputValue: string;
  searchQuery: string;
}>();

const emit = defineEmits<{
  navigate: [address: string];
  commitCell: [payload: { address: CellAddress; input: string }];
  traverse: [payload: { address: CellAddress; direction: "up" | "down" }];
  updateSearchQuery: [query: string];
  find: [direction: "forward" | "backward"];
}>();

const { t } = useAppI18n();
const formulaInput = ref<HTMLTextAreaElement>();
const formulaDraft = ref(props.inputValue);
const formulaSourceValue = ref(props.inputValue);
const formulaTarget = ref<CellAddress>({ ...props.address });
const formulaTargetLabel = ref(props.addressLabel);
const formulaFocused = ref(false);
const isComposing = ref(false);

watch(
  () => [props.address.row, props.address.column, props.inputValue] as const,
  () => {
    if (!formulaFocused.value) {
      syncFormulaFromProps();
    }
  },
);

function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function syncFormulaFromProps(): void {
  formulaTarget.value = { ...props.address };
  formulaTargetLabel.value = props.addressLabel;
  formulaSourceValue.value = props.inputValue;
  formulaDraft.value = props.inputValue;
}

function onFormulaFocus(): void {
  formulaFocused.value = true;
  formulaTarget.value = { ...props.address };
  formulaTargetLabel.value = props.addressLabel;
  formulaSourceValue.value = props.inputValue;
  formulaDraft.value = props.inputValue;
}

function onFormulaInput(event: Event): void {
  formulaDraft.value = readInputValue(event);
}

function commitFormulaDraft(): void {
  if (formulaDraft.value === formulaSourceValue.value) {
    return;
  }
  const payload = {
    address: { ...formulaTarget.value },
    input: formulaDraft.value,
  };
  formulaSourceValue.value = formulaDraft.value;
  emit("commitCell", payload);
}

function insertFormulaLineBreak(): void {
  const input = formulaInput.value;
  if (!input) {
    return;
  }
  const insertion = insertTextAtSelection(
    formulaDraft.value,
    input.selectionStart,
    input.selectionEnd,
    "\n",
  );
  formulaDraft.value = insertion.value;
  void nextTick(() => {
    input.setSelectionRange(insertion.caret, insertion.caret);
  });
}

function onFormulaKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && event.altKey && !event.isComposing && !isComposing.value) {
    event.preventDefault();
    insertFormulaLineBreak();
  } else if (event.key === "Enter" && !event.isComposing && !isComposing.value) {
    event.preventDefault();
    commitFormulaDraft();
    emit("traverse", {
      address: { ...formulaTarget.value },
      direction: event.shiftKey ? "up" : "down",
    });
    formulaInput.value?.blur();
  } else if (event.key === "Escape") {
    event.preventDefault();
    formulaDraft.value = formulaSourceValue.value;
    formulaInput.value?.blur();
  }
}

function onFormulaBlur(): void {
  if (!isComposing.value) {
    commitFormulaDraft();
  }
  formulaFocused.value = false;
  void nextTick(syncFormulaFromProps);
}
</script>

<template>
  <div
    class="workbook-formula-bar"
    role="group"
    :aria-label="t('formulaBar.label')"
    data-formula-bar
  >
    <WorkbookFormulaBarAddressInput
      :address-label="addressLabel"
      @navigate="emit('navigate', $event)"
    />

    <span class="workbook-formula-bar__fx" aria-hidden="true">fx</span>

    <label class="workbook-formula-bar__field workbook-formula-bar__formula">
      <span class="ui-visually-hidden">
        {{
          t("formulaBar.editor", { address: formulaFocused ? formulaTargetLabel : addressLabel })
        }}
      </span>
      <textarea
        ref="formulaInput"
        class="workbook-formula-bar__formula-input"
        :value="formulaDraft"
        rows="1"
        wrap="off"
        autocomplete="off"
        :spellcheck="false"
        :aria-label="
          t('formulaBar.editor', { address: formulaFocused ? formulaTargetLabel : addressLabel })
        "
        aria-keyshortcuts="Alt+Enter"
        :placeholder="t('formulaBar.placeholder')"
        data-formula-input
        @input="onFormulaInput"
        @focus="onFormulaFocus"
        @blur="onFormulaBlur"
        @keydown="onFormulaKeydown"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />
    </label>

    <WorkbookFormulaBarSearchControls
      :search-query="searchQuery"
      @update-search-query="emit('updateSearchQuery', $event)"
      @find="emit('find', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.workbook-formula-bar {
  display: grid;
  grid-template-columns: 104px 30px minmax(120px, 1fr) minmax(210px, 300px);
  align-items: center;
  min-width: 0;
  height: 34px;
  background: var(--idea-surface-secondary);
  border-bottom: 1px solid var(--idea-border-control);

  &__field,
  &__formula {
    min-width: 0;
    height: 100%;
    margin: 0;
  }

  &__field {
    display: block;
  }

  &__formula-input {
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 8px;
    background: var(--idea-surface-panel);
    border: 1px solid transparent;
    border-radius: 2px;
    outline: none;
    color: var(--idea-text-primary);
    font-size: 12px;
    letter-spacing: 0;

    &:focus {
      border-color: var(--idea-action-primary);
    }
  }

  &__fx {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    border-right: 1px solid var(--idea-border-control);
    color: var(--idea-text-muted);
    font-family: Georgia, serif;
    font-size: 14px;
    font-style: italic;
  }

  &__formula {
    padding: 4px 6px;
  }

  &__formula-input {
    overflow: auto;
    scrollbar-width: none;
    line-height: 18px;
    resize: none;
    white-space: pre;

    &::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  }

  @media (max-width: 520px) {
    grid-template-columns: 72px 24px minmax(64px, 1fr) 128px;

    &__formula {
      padding-right: 4px;
      padding-left: 4px;
    }
  }
}
</style>
