<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ChevronDown, Eye, Pencil, Search } from "lucide-vue-next";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import { isCellEditSessionTarget } from "../../../shared/cell-editing/cell-edit-focus";
import type { CellAddress, CellRange } from "@sheetcraft/core/workbook";
import { getCellAddressLabel } from "@sheetcraft/core/coordinates";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import FormulaTextOverlay from "../../../shared/formula-editing/FormulaTextOverlay.vue";
import { getFormulaReferenceTokens } from "../../../shared/formula-editing/formula-reference-tokens";
import {
  isExplicitWarningConfirmationKey,
  useCellEditSession,
  type CellEditSession,
  type CellEditCommit,
} from "../../../shared/cell-editing/useCellEditSession";
import WorkbookFormulaBarAddressInput from "./WorkbookFormulaBarAddressInput.vue";

const props = defineProps<{
  address: CellAddress;
  addressLabel: string;
  inputValue: string;
  searchOpen?: boolean;
  previewing?: boolean;
  previewValue?: string;
  formulaEditorDisabled?: boolean;
  sheetId?: string;
  sheetName?: string;
  editTargetSheetName?: string;
  editSession?: CellEditSession;
  handleReferenceKeydown?: (event: KeyboardEvent) => boolean;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  navigate: [address: string];
  commitCell: [payload: CellEditCommit];
  traverse: [
    payload: {
      address: CellAddress;
      direction: "up" | "down" | "left" | "right";
      sheetId?: string;
    },
  ];
  openSearch: [];
  openFormulaEditor: [];
  openInsertFunction: [];
  updatePreviewing: [previewing: boolean];
  cancelEdit: [sheetId: string | undefined];
}>();

const { t } = useAppI18n();
const formulaInput = ref<HTMLTextAreaElement>();
const formulaBarRoot = ref<HTMLDivElement>();
const expanded = ref(false);

function openInsertFunction(): void {
  if (!props.readOnly && !props.formulaEditorDisabled && !isComposing.value) {
    emit("openInsertFunction");
  }
}

function openFormulaEditor(): void {
  if (!props.readOnly && !props.formulaEditorDisabled && !isComposing.value) {
    emit("openFormulaEditor");
  }
}

function setFormulaInput(element: HTMLInputElement | HTMLTextAreaElement | null): void {
  formulaInput.value = element instanceof HTMLTextAreaElement ? element : undefined;
}
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
  () =>
    !props.previewing &&
    showsSessionDraft.value &&
    !isComposing.value &&
    formulaDraft.value.startsWith("="),
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
  if (props.readOnly || props.previewing) return;
  formulaFocused.value = true;
  finishAfterComposition = false;
  if (!formulaOwnsSession.value && !editingThisCell.value && !editingFormulaSession.value) {
    editSession.begin(context(), { surface: "formula-bar", mode: "append" });
  }
  if (editingThisCell.value || editingFormulaSession.value)
    editSession.activateSurface("formula-bar");
}

function onFormulaInput(event: Event): void {
  if (props.readOnly || props.previewing) {
    if (formulaInput.value)
      formulaInput.value.value = props.previewing ? (props.previewValue ?? "") : props.inputValue;
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
  if (event instanceof InputEvent && event.inputType === "insertFromPaste")
    editSession.markPasted();
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
  if (!input || !formulaOwnsSession.value || props.previewing) return;
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
  if (props.readOnly || props.previewing) return;
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
    if (
      !owner ||
      !editSession.finish({
        complete: true,
        confirmPendingWarning: isExplicitWarningConfirmationKey(event),
      })
    )
      return;
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
  if (props.readOnly || props.previewing) return;
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
  if (props.previewing) {
    emit("updatePreviewing", false);
    void nextTick(() => focusInput(options));
    return;
  }
  focusInput(options);
}

function focusInput(options: { preserveSelection?: boolean }): void {
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
  focusSearch: () =>
    formulaBarRoot.value?.querySelector<SVGSVGElement>("[data-search-trigger]")?.focus(),
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
  pickReference: (
    range: CellRange,
    phase: "start" | "update" | "end",
    rangeKind?: "row-axis" | "column-axis" | "cells",
  ) => formulaAssistRef.value?.pickReference(range, phase, rangeKind) ?? false,
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
    ref="formulaBarRoot"
    class="workbook-formula-bar"
    role="group"
    :aria-label="t('formulaBar.label')"
    data-formula-bar
  >
    <WorkbookFormulaBarAddressInput
      :address-label="addressLabel"
      @navigate="emit('navigate', $event)"
    />

    <div class="workbook-formula-bar__editor" :class="{ 'is-expanded': expanded }">
      <div class="workbook-formula-bar__leading-actions" :data-cell-edit-session="editSession.id">
        <Eye
          class="workbook-formula-bar__action"
          :size="15"
          role="button"
          :tabindex="isComposing ? -1 : 0"
          :aria-label="t(previewing ? 'formulaBar.showFormula' : 'formulaBar.previewResult')"
          :title="t(previewing ? 'formulaBar.showFormula' : 'formulaBar.previewResult')"
          :aria-pressed="previewing ?? false"
          :aria-disabled="isComposing"
          data-formula-preview-trigger
          @mousedown.prevent
          @click="!isComposing && emit('updatePreviewing', !previewing)"
          @keydown.enter.prevent="!isComposing && emit('updatePreviewing', !previewing)"
          @keydown.space.prevent="!isComposing && emit('updatePreviewing', !previewing)"
        />
        <span
          class="workbook-formula-bar__action workbook-formula-bar__fx"
          role="button"
          :tabindex="readOnly || formulaEditorDisabled || isComposing ? -1 : 0"
          :aria-label="t('formulaTools.insertFunction')"
          :title="t('formulaTools.insertFunction')"
          :aria-disabled="readOnly || formulaEditorDisabled || isComposing"
          aria-haspopup="dialog"
          data-formula-insert-trigger
          @click="openInsertFunction"
          @keydown.enter.prevent="openInsertFunction"
          @keydown.space.prevent="openInsertFunction"
          >fx</span
        >
      </div>
      <div class="workbook-formula-bar__formula">
        <span class="ui-visually-hidden">
          {{
            t("formulaBar.editor", {
              address: formulaFocused ? formulaTargetLabel : addressLabel,
            })
          }}
        </span>
        <Textarea
          v-native-control="{
            onElement: setFormulaInput,
            attributes: {
              ...formulaAssistRef?.inputAria,
              'aria-label': t(previewing ? 'formulaBar.previewValue' : 'formulaBar.editor', {
                address: formulaFocused ? formulaTargetLabel : addressLabel,
              }),
              'aria-readonly': readOnly || previewing ? true : undefined,
              'aria-keyshortcuts': 'Alt+Enter Control+F2 F2 F4',
              'data-formula-input': '',
              'data-cell-edit-session': editSession.id,
              'data-cell-edit-surface': 'formula-bar',
              rows: expanded ? 5 : 1,
              wrap: expanded ? 'soft' : 'off',
              autocomplete: 'off',
              spellcheck: false,
            },
          }"
          class="sheetcraft-formula-textarea"
          :class="{ 'has-formula-colors': showFormulaColors, 'is-expanded': expanded }"
          :value="previewing ? (previewValue ?? '') : formulaDraft"
          :readonly="readOnly || previewing"
          :placeholder="t('formulaBar.placeholder')"
          @input="onFormulaInput"
          @paste.capture="editSession.markPasted()"
          @focus="onFormulaFocus"
          @blur="(_value, { e }) => onFormulaBlur(e)"
          @keydown="(_value, { e }) => onFormulaKeydown(e)"
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
            !previewing &&
            formulaFocused &&
            formulaOwnsSession &&
            editSession.state.surface === 'formula-bar'
          "
          :composing="isComposing"
          :reference-sheet-name="formulaTargetSheetId !== sheetId ? sheetName : undefined"
          @text-edit="applyFormulaTextEdit"
        />
      </div>
      <ChevronDown
        class="workbook-formula-bar__action workbook-formula-bar__expand-trigger"
        :class="{ 'is-expanded': expanded }"
        :size="15"
        role="button"
        tabindex="0"
        :aria-label="t(expanded ? 'formulaBar.collapse' : 'formulaBar.expand')"
        :title="t(expanded ? 'formulaBar.collapse' : 'formulaBar.expand')"
        :aria-expanded="expanded"
        :data-cell-edit-session="editSession.id"
        data-formula-expand-trigger
        @mousedown.prevent
        @click="expanded = !expanded"
        @keydown.enter.prevent="expanded = !expanded"
        @keydown.space.prevent="expanded = !expanded"
      />
      <Pencil
        class="workbook-formula-bar__action workbook-formula-bar__editor-trigger"
        :size="15"
        role="button"
        :tabindex="readOnly || formulaEditorDisabled || isComposing ? -1 : 0"
        :aria-label="t('formulaBar.openEditor')"
        :title="t('formulaBar.openEditor')"
        :aria-disabled="readOnly || formulaEditorDisabled || isComposing"
        :data-cell-edit-session="editSession.id"
        aria-haspopup="dialog"
        data-formula-editor-trigger
        @click="openFormulaEditor"
        @keydown.enter.prevent="openFormulaEditor"
        @keydown.space.prevent="openFormulaEditor"
      />
    </div>
    <span class="workbook-formula-bar__search-divider" aria-hidden="true" />
    <Search
      class="workbook-formula-bar__action workbook-formula-bar__search-trigger"
      :size="15"
      role="button"
      tabindex="0"
      :aria-label="t('navigation.findInSheet')"
      :title="t('navigation.findInSheet')"
      aria-haspopup="dialog"
      :aria-expanded="searchOpen ?? false"
      data-search-trigger
      @click="emit('openSearch')"
      @keydown.enter.prevent="emit('openSearch')"
      @keydown.space.prevent="emit('openSearch')"
    />
  </div>
</template>

<style scoped lang="scss">
.workbook-formula-bar {
  --formula-bar-action-size: var(--td-comp-size-m);
  --formula-bar-action-gap: var(--sheetcraft-space-2);

  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 1px var(--formula-bar-action-size);
  gap: var(--formula-bar-action-gap);
  align-items: center;
  min-width: 0;
  padding: var(--sheetcraft-space-2) var(--sheetcraft-space-4);
  background: var(--sheetcraft-surface-secondary);
  border-bottom: 1px solid var(--sheetcraft-border-control);

  &__editor {
    display: grid;
    grid-template-columns:
      calc(2 * var(--formula-bar-action-size) + var(--formula-bar-action-gap))
      minmax(0, 1fr) repeat(2, var(--formula-bar-action-size));
    gap: var(--formula-bar-action-gap);
    align-items: center;
    min-width: 0;

    &.is-expanded {
      .workbook-formula-bar__formula {
        z-index: 30;
      }
    }
  }

  &__formula {
    position: relative;
    min-width: 0;
    height: var(--td-comp-size-m);
  }

  &__leading-actions {
    display: grid;
    grid-template-columns: repeat(2, var(--formula-bar-action-size));
    gap: var(--formula-bar-action-gap);
    align-items: center;
    height: var(--formula-bar-action-size);
    color: var(--sheetcraft-text-secondary);
  }

  &__action {
    box-sizing: border-box;
    width: var(--formula-bar-action-size);
    height: var(--formula-bar-action-size);
    padding: calc((var(--formula-bar-action-size) - 15px) / 2);
    flex: none;
    cursor: pointer;
    color: var(--sheetcraft-text-secondary);
    outline: none;

    &:hover,
    &[aria-pressed="true"] {
      color: var(--sheetcraft-text-primary);
    }

    &[aria-disabled="true"] {
      cursor: default;
      opacity: 0.4;
    }
  }

  &__fx {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: Georgia, serif;
    font-size: 14px;
    font-style: italic;
  }

  &__expand-trigger {
    &.is-expanded {
      transform: rotate(180deg);
    }
  }

  &__search-divider {
    align-self: center;
    height: 16px;
    background: var(--sheetcraft-border-control);
  }

  @media (max-width: 520px) {
    grid-template-columns: 72px minmax(0, 1fr) 1px var(--formula-bar-action-size);
    padding-inline: var(--sheetcraft-space-2);
  }
}
</style>
