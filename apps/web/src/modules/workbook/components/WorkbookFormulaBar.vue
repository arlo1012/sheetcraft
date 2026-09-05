<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import type { CellAddress, CellRange } from "@idea10/core/workbook";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import FormulaTextOverlay from "../../../shared/formula-editing/FormulaTextOverlay.vue";
import { completeFormulaForCommit } from "../../../shared/formula-editing/formula-commit";
import WorkbookFormulaBarAddressInput from "./WorkbookFormulaBarAddressInput.vue";
import WorkbookFormulaBarSearchControls from "./WorkbookFormulaBarSearchControls.vue";

const props = defineProps<{
  address: CellAddress;
  addressLabel: string;
  inputValue: string;
  searchQuery: string;
  sheetId?: string;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  navigate: [address: string];
  commitCell: [payload: { address: CellAddress; input: string; sheetId?: string }];
  traverse: [
    payload: {
      address: CellAddress;
      direction: "up" | "down" | "left" | "right";
      sheetId?: string;
    },
  ];
  updateSearchQuery: [query: string];
  find: [direction: "forward" | "backward"];
}>();

const { t } = useAppI18n();
const formulaInput = ref<HTMLTextAreaElement>();
const formulaAssistRef = ref<InstanceType<typeof FormulaInputAssist> | null>(null);
const formulaDraft = ref(props.inputValue);
const formulaSourceValue = ref(props.inputValue);
const formulaTarget = ref<CellAddress>({ ...props.address });
const formulaTargetLabel = ref(props.addressLabel);
const formulaTargetSheetId = ref(props.sheetId);
const formulaFocused = ref(false);
const isComposing = ref(false);
const showFormulaColors = computed(
  () =>
    !props.readOnly &&
    formulaFocused.value &&
    !isComposing.value &&
    formulaDraft.value.startsWith("="),
);
let finishAfterComposition = false;

watch(
  () => props.readOnly,
  (readOnly) => {
    if (!readOnly) return;
    formulaFocused.value = false;
    isComposing.value = false;
    finishAfterComposition = false;
    syncFormulaFromProps();
  },
);

watch(
  () => [props.sheetId, props.address.row, props.address.column, props.inputValue] as const,
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
  formulaTargetSheetId.value = props.sheetId;
  formulaSourceValue.value = props.inputValue;
  formulaDraft.value = props.inputValue;
}

function onFormulaFocus(): void {
  if (props.readOnly) {
    syncFormulaFromProps();
    return;
  }
  if (formulaFocused.value) return;
  formulaFocused.value = true;
  finishAfterComposition = false;
  syncFormulaFromProps();
}

function onFormulaInput(event: Event): void {
  if (props.readOnly) {
    syncFormulaFromProps();
    if (formulaInput.value) formulaInput.value.value = props.inputValue;
    return;
  }
  formulaDraft.value = readInputValue(event);
}

function commitFormulaDraft(): void {
  if (props.readOnly) return;
  if (formulaDraft.value === formulaSourceValue.value) {
    return;
  }
  const payload = {
    address: { ...formulaTarget.value },
    input: formulaDraft.value,
    ...(formulaTargetSheetId.value ? { sheetId: formulaTargetSheetId.value } : {}),
  };
  formulaSourceValue.value = formulaDraft.value;
  emit("commitCell", payload);
}

function flushPendingEdit(): boolean {
  if (isComposing.value) {
    return false;
  }
  commitFormulaDraft();
  return true;
}

function hasPendingEdit(): boolean {
  return !props.readOnly && (isComposing.value || formulaDraft.value !== formulaSourceValue.value);
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
  applyFormulaTextEdit(insertion);
}

function applyFormulaTextEdit(edit: { value: string; caret: number }): void {
  if (props.readOnly) return;
  const input = formulaInput.value;
  formulaDraft.value = edit.value;
  if (!input) return;
  input.value = edit.value;
  input.setSelectionRange(edit.caret, edit.caret);
  void nextTick(() => {
    input.setSelectionRange(edit.caret, edit.caret);
  });
}

function onFormulaKeydown(event: KeyboardEvent): void {
  if (props.readOnly) return;
  if (formulaAssistRef.value?.handleKeydown(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === "Enter" && event.altKey && !event.isComposing && !isComposing.value) {
    event.preventDefault();
    insertFormulaLineBreak();
  } else if (
    (event.key === "Enter" || event.key === "Tab") &&
    !event.isComposing &&
    !isComposing.value
  ) {
    event.preventDefault();
    formulaDraft.value = completeFormulaForCommit(formulaDraft.value);
    commitFormulaDraft();
    emit("traverse", {
      address: { ...formulaTarget.value },
      ...(formulaTargetSheetId.value ? { sheetId: formulaTargetSheetId.value } : {}),
      direction:
        event.key === "Tab" ? (event.shiftKey ? "left" : "right") : event.shiftKey ? "up" : "down",
    });
    formulaFocused.value = false;
    formulaInput.value?.blur();
  } else if (event.key === "Escape") {
    event.preventDefault();
    formulaDraft.value = formulaSourceValue.value;
    isComposing.value = false;
    finishAfterComposition = false;
    formulaFocused.value = false;
    formulaInput.value?.blur();
  }
}

function onFormulaBlur(): void {
  if (isComposing.value) {
    finishAfterComposition = true;
    return;
  }
  commitFormulaDraft();
  formulaFocused.value = false;
  void nextTick(syncFormulaFromProps);
}

function onFormulaCompositionStart(): void {
  if (props.readOnly) return;
  isComposing.value = true;
  finishAfterComposition = false;
}

function onFormulaCompositionEnd(event: CompositionEvent): void {
  if (props.readOnly) return;
  formulaDraft.value = readInputValue(event);
  isComposing.value = false;
  if (finishAfterComposition) {
    finishAfterComposition = false;
    onFormulaBlur();
  }
}

defineExpose({
  flushPendingEdit,
  hasPendingEdit,
  get references() {
    return formulaTargetSheetId.value === props.sheetId
      ? (formulaAssistRef.value?.references ?? [])
      : [];
  },
  get editingFormula() {
    return (
      formulaTargetSheetId.value === props.sheetId &&
      (formulaAssistRef.value?.editingFormula ?? false)
    );
  },
  canPickReference: () =>
    formulaTargetSheetId.value === props.sheetId &&
    (formulaAssistRef.value?.canPickReference() ?? false),
  pickReference: (range: CellRange, phase: "start" | "update" | "end") =>
    formulaTargetSheetId.value === props.sheetId &&
    (formulaAssistRef.value?.pickReference(range, phase) ?? false),
  get referenceActive() {
    return (
      formulaFocused.value &&
      formulaTargetSheetId.value === props.sheetId &&
      (formulaAssistRef.value?.referenceActive ?? false)
    );
  },
  get referenceRange() {
    return formulaAssistRef.value?.referenceRange ?? null;
  },
});
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
        v-bind="formulaAssistRef?.inputAria"
        class="workbook-formula-bar__formula-input"
        :class="{ 'has-formula-colors': showFormulaColors }"
        :value="formulaDraft"
        :readonly="readOnly"
        :aria-readonly="readOnly ? true : undefined"
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
        @compositionstart="onFormulaCompositionStart"
        @compositionend="onFormulaCompositionEnd"
      />
      <FormulaTextOverlay
        :input="formulaInput"
        :value="formulaDraft"
        :references="formulaAssistRef?.references ?? []"
        :active="showFormulaColors"
      />
      <FormulaInputAssist
        ref="formulaAssistRef"
        :value="formulaDraft"
        :input="formulaInput"
        :active="formulaFocused && !readOnly"
        :composing="isComposing"
        @text-edit="applyFormulaTextEdit"
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

    &.has-formula-colors {
      -webkit-text-fill-color: transparent;
      caret-color: var(--idea-text-primary);
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
    position: relative;
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
