<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import { isCellEditSessionTarget } from "../../../shared/cell-editing/cell-edit-focus";
import type { CellAddress, CellRange } from "@idea10/core/workbook";
import { getCellAddressLabel } from "@idea10/core/coordinates";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import FormulaTextOverlay from "../../../shared/formula-editing/FormulaTextOverlay.vue";
import { getFormulaReferenceTokens } from "../../../shared/formula-editing/formula-reference-tokens";
import {
  useCellEditSession,
  type CellEditSession,
} from "../../../shared/cell-editing/useCellEditSession";
import WorkbookFormulaBarAddressInput from "./WorkbookFormulaBarAddressInput.vue";
import WorkbookFormulaBarSearchControls from "./WorkbookFormulaBarSearchControls.vue";

const props = defineProps<{
  address: CellAddress;
  addressLabel: string;
  inputValue: string;
  searchQuery: string;
  sheetId?: string;
  sheetName?: string;
  editTargetSheetName?: string;
  editSession?: CellEditSession;
  handleReferenceKeydown?: (event: KeyboardEvent) => boolean;
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
  cancelEdit: [sheetId: string | undefined];
}>();

const { t } = useAppI18n();
const formulaInput = ref<HTMLTextAreaElement>();
const formulaAssistRef = ref<InstanceType<typeof FormulaInputAssist> | null>(null);
const formulaFocused = ref(false);
const editSession =
  props.editSession ?? useCellEditSession({ onCommit: (payload) => emit("commitCell", payload) });
const editingThisSheet = computed(
  () => editSession.state.active && editSession.state.owner?.sheetId === props.sheetId,
);
const editingFormulaSession = computed(
  () => editSession.state.active && editSession.state.draft.startsWith("="),
);
const showsSessionDraft = computed(() => editingThisSheet.value || editingFormulaSession.value);
const editingThisCell = computed(
  () =>
    editingThisSheet.value &&
    editSession.state.owner?.address.row === props.address.row &&
    editSession.state.owner?.address.column === props.address.column,
);
const formulaOwnsSession = computed(
  () =>
    formulaFocused.value && editSession.state.active && editSession.state.surface === "formula-bar",
);
const formulaDraft = computed(() =>
  showsSessionDraft.value ? editSession.state.draft : props.inputValue,
);
const formulaTarget = computed(() => editSession.state.owner?.address ?? props.address);
const formulaTargetSheetId = computed(() => editSession.state.owner?.sheetId);
const formulaTargetLabel = computed(() =>
  showsSessionDraft.value
    ? `${!editingThisSheet.value && props.editTargetSheetName ? `${props.editTargetSheetName}!` : ""}${getCellAddressLabel(formulaTarget.value)}`
    : props.addressLabel,
);
const isComposing = computed(() => showsSessionDraft.value && editSession.state.composing);
const showFormulaColors = computed(
  () => showsSessionDraft.value && !isComposing.value && formulaDraft.value.startsWith("="),
);
const coloredReferences = computed(() =>
  showFormulaColors.value ? getFormulaReferenceTokens(formulaDraft.value) : [],
);
let finishAfterComposition = false;
let compositionStartedHere = false;

watch(
  () => props.readOnly,
  (readOnly) => {
    if (!readOnly) return;
    editSession.cancel();
    formulaFocused.value = false;
    finishAfterComposition = false;
    compositionStartedHere = false;
  },
);

function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function context() {
  return {
    address: { ...props.address },
    input: props.inputValue,
    ...(props.sheetId === undefined ? {} : { sheetId: props.sheetId }),
  };
}

function onFormulaFocus(): void {
  if (props.readOnly) return;
  formulaFocused.value = true;
  finishAfterComposition = false;
  if (!formulaOwnsSession.value && !editingThisCell.value && !editingFormulaSession.value) {
    editSession.begin(context(), { surface: "formula-bar", mode: "append" });
  }
  if (editingThisCell.value || editingFormulaSession.value)
    editSession.activateSurface("formula-bar");
}

function onFormulaInput(event: Event): void {
  if (props.readOnly) {
    if (formulaInput.value) formulaInput.value.value = props.inputValue;
    return;
  }
  const value = readInputValue(event);
  const startsFormula = editSession.state.draft === "" && value.startsWith("=");
  if (
    !formulaOwnsSession.value &&
    !editSession.begin(context(), {
      surface: "formula-bar",
      mode: "replace",
      initialValue: value,
    })
  )
    return;
  editSession.activateSurface("formula-bar");
  editSession.setDraft(value);
  if (startsFormula) editSession.setMode("point");
  void nextTick(captureSelection);
}

function flushPendingEdit(): boolean {
  if (props.readOnly) return true;
  return editSession.flush();
}

function hasPendingEdit(): boolean {
  return !props.readOnly && editSession.hasPendingEdit();
}

function captureSelection(): void {
  const input = formulaInput.value;
  if (!input || !formulaOwnsSession.value) return;
  editSession.setSelection(
    input.selectionStart,
    input.selectionEnd,
    input.selectionDirection ?? "none",
  );
}

function insertFormulaLineBreak(): void {
  if (props.readOnly || !formulaOwnsSession.value) return;
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
  if (props.readOnly || !formulaOwnsSession.value) return;
  const input = formulaInput.value;
  editSession.setDraft(edit.value);
  if (!input) return;
  input.value = edit.value;
  input.setSelectionRange(edit.caret, edit.caret);
  editSession.setSelection(edit.caret, edit.caret);
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
  if (props.handleReferenceKeydown?.(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (!formulaOwnsSession.value) return;
  if (event.key === "Enter" && event.altKey && !event.isComposing && !isComposing.value) {
    event.preventDefault();
    insertFormulaLineBreak();
  } else if (
    (event.key === "Enter" || event.key === "Tab") &&
    !event.isComposing &&
    !isComposing.value
  ) {
    event.preventDefault();
    const owner = editSession.state.owner;
    if (!owner || !editSession.finish({ complete: true })) return;
    emit("traverse", {
      address: { ...owner.address },
      ...(owner.sheetId === undefined ? {} : { sheetId: owner.sheetId }),
      direction:
        event.key === "Tab" ? (event.shiftKey ? "left" : "right") : event.shiftKey ? "up" : "down",
    });
    formulaFocused.value = false;
    formulaInput.value?.blur();
  } else if (event.key === "Escape") {
    event.preventDefault();
    const ownerSheetId = editSession.state.owner?.sheetId;
    editSession.cancel();
    compositionStartedHere = false;
    finishAfterComposition = false;
    formulaFocused.value = false;
    formulaInput.value?.blur();
    emit("cancelEdit", ownerSheetId);
  }
}

function onFormulaBlur(event: FocusEvent): void {
  if (props.readOnly) {
    formulaFocused.value = false;
    return;
  }
  captureSelection();
  const ownedBeforeBlur = formulaOwnsSession.value;
  formulaFocused.value = false;
  const next = event.relatedTarget;
  if (isCellEditSessionTarget(next, editSession.id)) return;
  if (!ownedBeforeBlur) return;
  if (isComposing.value) {
    finishAfterComposition = true;
    return;
  }
  editSession.finish();
}

function onFormulaCompositionStart(): void {
  if (props.readOnly) return;
  if (
    !formulaOwnsSession.value &&
    !editSession.begin(context(), {
      surface: "formula-bar",
      mode: "replace",
      initialValue: "",
    })
  ) {
    compositionStartedHere = false;
    return;
  }
  compositionStartedHere = formulaOwnsSession.value;
  if (!compositionStartedHere) return;
  editSession.activateSurface("formula-bar");
  editSession.startComposition();
  finishAfterComposition = false;
}

function onFormulaCompositionEnd(event: CompositionEvent): void {
  if (props.readOnly) return;
  if (!compositionStartedHere) return;
  compositionStartedHere = false;
  editSession.endComposition(readInputValue(event));
  if (finishAfterComposition) {
    finishAfterComposition = false;
    editSession.finish();
  }
}

function focus(options: { preserveSelection?: boolean } = {}): void {
  const input = formulaInput.value;
  if (!input) return;
  input.focus({ preventScroll: true });
  const selection =
    options.preserveSelection && showsSessionDraft.value
      ? editSession.state.selection
      : {
          start: input.value.length,
          end: input.value.length,
          direction: "none" as const,
        };
  input.setSelectionRange(selection.start, selection.end, selection.direction);
}

defineExpose({
  flushPendingEdit,
  hasPendingEdit,
  focus,
  get references() {
    return (formulaAssistRef.value?.references ?? []).filter((reference) =>
      reference.sheetName
        ? reference.sheetName.toLowerCase() === props.sheetName?.toLowerCase()
        : formulaTargetSheetId.value === props.sheetId,
    );
  },
  get editingFormula() {
    return formulaAssistRef.value?.editingFormula ?? false;
  },
  canPickReference: () => formulaAssistRef.value?.canPickReference() ?? false,
  pickReference: (range: CellRange, phase: "start" | "update" | "end") =>
    formulaAssistRef.value?.pickReference(range, phase) ?? false,
  get referenceActive() {
    return formulaFocused.value && (formulaAssistRef.value?.referenceActive ?? false);
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
          t("formulaBar.editor", {
            address: formulaFocused ? formulaTargetLabel : addressLabel,
          })
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
          t('formulaBar.editor', {
            address: formulaFocused ? formulaTargetLabel : addressLabel,
          })
        "
        aria-keyshortcuts="Alt+Enter Control+F2 F2 F4"
        :placeholder="t('formulaBar.placeholder')"
        data-formula-input
        :data-cell-edit-session="editSession.id"
        data-cell-edit-surface="formula-bar"
        @input="onFormulaInput"
        @focus="onFormulaFocus"
        @blur="onFormulaBlur"
        @keydown="onFormulaKeydown"
        @select="captureSelection"
        @keyup="captureSelection"
        @click="captureSelection"
        @compositionstart="onFormulaCompositionStart"
        @compositionend="onFormulaCompositionEnd"
      />
      <FormulaTextOverlay
        :input="formulaInput"
        :value="formulaDraft"
        :references="coloredReferences"
        :active="showFormulaColors"
      />
      <FormulaInputAssist
        ref="formulaAssistRef"
        :value="formulaDraft"
        :input="formulaInput"
        :active="
          !readOnly &&
          formulaFocused &&
          formulaOwnsSession &&
          editSession.state.surface === 'formula-bar'
        "
        :composing="isComposing"
        :reference-sheet-name="formulaTargetSheetId !== sheetId ? sheetName : undefined"
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
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);
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
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
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
    line-height: var(--idea-line-height-body-medium);
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
