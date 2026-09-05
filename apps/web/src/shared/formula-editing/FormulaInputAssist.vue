<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useFloatingPanel } from "../floating/useFloatingPanel";
import { useAppI18n, type MessageKey } from "../i18n";
import type { CellRange } from "@idea10/core/workbook";
import {
  applyFunctionCompletion,
  cycleFormulaReferenceAbsoluteMarkers,
  getFormulaCompletionContext,
  getFormulaArgumentContext,
  getFormulaReferenceEditContext,
  getSupportedFormulaFunction,
  getSupportedFormulaCandidates,
  replaceFormulaReference,
  type FormulaFunctionCandidate,
  type FormulaReferenceEditContext,
} from "./formula-input-lexical";
import type { FormulaReferenceEditor, FormulaReferencePickPhase } from "./formula-editor-contract";
import { getFormulaReferenceTokens } from "./formula-reference-tokens";

const props = defineProps<{
  value: string;
  input: HTMLTextAreaElement | null | undefined;
  active: boolean;
  composing: boolean;
}>();

const emit = defineEmits<{
  textEdit: [payload: { value: string; caret: number }];
}>();

const { t } = useAppI18n();
const FUNCTION_COPY: Record<string, { description: MessageKey; signature: MessageKey }> = {
  SUM: { description: "formulaAssist.sumDescription", signature: "formulaAssist.sumSignature" },
  IF: { description: "formulaAssist.ifDescription", signature: "formulaAssist.ifSignature" },
  IFERROR: {
    description: "formulaAssist.iferrorDescription",
    signature: "formulaAssist.iferrorSignature",
  },
  AVERAGE: {
    description: "formulaAssist.averageDescription",
    signature: "formulaAssist.averageSignature",
  },
  COUNT: {
    description: "formulaAssist.countDescription",
    signature: "formulaAssist.countSignature",
  },
  MIN: { description: "formulaAssist.minDescription", signature: "formulaAssist.minSignature" },
  MAX: { description: "formulaAssist.maxDescription", signature: "formulaAssist.maxSignature" },
  ROUND: {
    description: "formulaAssist.roundDescription",
    signature: "formulaAssist.roundSignature",
  },
};
const ARGUMENT_COPY: Record<string, MessageKey> = {
  logical_test: "formulaAssist.argLogicalTest",
  value_if_true: "formulaAssist.argValueIfTrue",
  value_if_false: "formulaAssist.argValueIfFalse",
  value: "formulaAssist.argValue",
  value_if_error: "formulaAssist.argValueIfError",
  number: "formulaAssist.argNumber",
  number1: "formulaAssist.argNumber1",
  number2: "formulaAssist.argNumber2",
  value1: "formulaAssist.argValue1",
  value2: "formulaAssist.argValue2",
  num_digits: "formulaAssist.argNumDigits",
};
const listboxRef = ref<HTMLElement | null>(null);
const listId = `formula-suggestions-${Math.random().toString(36).slice(2)}`;
const activeIndex = ref(0);
const selectionVersion = ref(0);
const dismissedKey = ref<string | null>(null);
const referenceRangeState = ref<CellRange | null>(null);
const referenceActiveState = ref(false);
let referenceContext: FormulaReferenceEditContext | null = null;
let expectedReferenceValue: string | null = null;
let observedInput: HTMLTextAreaElement | null = null;

const inputReference = computed(() => props.input ?? null);
const editingFormula = computed(() => props.active && props.value.startsWith("="));
const references = computed(() =>
  editingFormula.value && !props.composing ? getFormulaReferenceTokens(props.value) : [],
);
const completionContext = computed(() => {
  void selectionVersion.value;
  return props.active && !props.composing && props.input
    ? getFormulaCompletionContext(props.value, props.input.selectionStart, props.input.selectionEnd)
    : null;
});
const candidates = computed(() => getSupportedFormulaCandidates(completionContext.value));
const completionKey = computed(() => {
  const context = completionContext.value;
  return context ? `${props.value}:${context.replaceStart}:${context.replaceEnd}` : null;
});
const isOpen = computed(
  () =>
    candidates.value.length > 0 &&
    completionKey.value !== null &&
    dismissedKey.value !== completionKey.value,
);
const activeCandidate = computed(() => candidates.value[activeIndex.value] ?? null);
const helpCandidate = computed(() => {
  const argument = completionContext.value?.argument;
  return argument ? getSupportedFormulaFunction(argument.functionName) : activeCandidate.value;
});
const activeId = computed(() =>
  activeCandidate.value ? `${listId}-${activeCandidate.value.id}` : undefined,
);
const inputAria = computed<Record<string, string | boolean | undefined>>(() => ({
  role: "combobox",
  "aria-autocomplete": "list",
  "aria-expanded": isOpen.value,
  "aria-controls": isOpen.value ? listId : undefined,
  "aria-activedescendant": isOpen.value ? activeId.value : undefined,
  "aria-describedby": argumentHint.value ? `${listId}-help` : undefined,
}));
const argumentHint = computed(() => {
  if (!props.active || props.composing || !props.value.startsWith("=")) return "";
  void selectionVersion.value;
  const argument = props.input
    ? getFormulaArgumentContext(props.value, props.input.selectionStart ?? props.value.length)
    : null;
  if (!argument) return "";
  const candidate = getSupportedFormulaFunction(argument.functionName);
  const metadata =
    candidate?.arguments[Math.min(argument.index, (candidate.arguments.length || 1) - 1)] ??
    (candidate ? { name: candidate.name === "SUM" ? "number" : "value" } : undefined);
  if (!candidate || !metadata) return "";
  return t("formulaAssist.argument", {
    function: candidate.name,
    index: argument.index + 1,
    name: t(ARGUMENT_COPY[metadata.name] ?? "formulaAssist.argValue"),
  });
});
const visible = computed(() => isOpen.value || Boolean(argumentHint.value));
const { floatingStyles } = useFloatingPanel(inputReference, listboxRef, visible, { offset: 4 });

watch(completionKey, () => {
  activeIndex.value = 0;
  if (completionKey.value !== dismissedKey.value) dismissedKey.value = null;
});
watch(
  () => props.value,
  (value) => {
    if (expectedReferenceValue === value) {
      expectedReferenceValue = null;
      return;
    }
    expectedReferenceValue = null;
    clearReferenceCapture();
  },
  { flush: "post" },
);
watch(
  () => props.input,
  (input, previous) => {
    detachInputListeners(previous ?? observedInput);
    observedInput = input ?? null;
    attachInputListeners(observedInput);
  },
  { immediate: true },
);
watch(
  () => props.composing,
  (composing) => {
    if (composing) dismissedKey.value = completionKey.value;
  },
);
watch(
  () => props.active,
  (active) => {
    if (!active) clearReferenceCapture();
  },
);

function syncSelection(): void {
  selectionVersion.value += 1;
  if (!referenceContext || !props.input) return;
  const caret = props.input.selectionStart ?? 0;
  if (caret !== referenceContext.replaceEnd) clearReferenceCapture();
}

function attachInputListeners(input: HTMLTextAreaElement | null): void {
  input?.addEventListener("select", syncSelection);
  input?.addEventListener("keyup", syncSelection);
  input?.addEventListener("click", syncSelection);
}

function detachInputListeners(input: HTMLTextAreaElement | null): void {
  input?.removeEventListener("select", syncSelection);
  input?.removeEventListener("keyup", syncSelection);
  input?.removeEventListener("click", syncSelection);
}

function emitTextEdit(value: string, caret: number, keepReference = false): void {
  expectedReferenceValue = keepReference ? value : null;
  emit("textEdit", { value, caret });
  void nextTick(() => {
    const input = props.input;
    if (input && document.activeElement === input) input.setSelectionRange(caret, caret);
  });
}

function chooseCandidate(
  candidate = activeCandidate.value,
  context = completionContext.value,
): boolean {
  if (!context || !candidate || props.composing) return false;
  const edit = applyFunctionCompletion(props.value, context, candidate.id);
  dismissedKey.value = completionKey.value;
  emitTextEdit(edit.value, edit.caret);
  return true;
}

function handleKeydown(event: KeyboardEvent): boolean {
  if (props.composing || event.isComposing) return false;
  if (event.key === "F4" && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const context =
      referenceContext ??
      getFormulaReferenceEditContext(
        props.value,
        props.input?.selectionStart ?? null,
        props.input?.selectionEnd ?? null,
      );
    const edit = context && cycleFormulaReferenceAbsoluteMarkers(props.value, context);
    if (!edit) return false;
    referenceContext = edit.context;
    referenceActiveState.value = true;
    emitTextEdit(edit.value, edit.caret, true);
    return handleEvent(event);
  }
  if (!isOpen.value || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const length = candidates.value.length;
    activeIndex.value = (activeIndex.value + (event.key === "ArrowDown" ? 1 : length - 1)) % length;
    return handleEvent(event);
  }
  if (event.key === "Enter" || event.key === "Tab") {
    return chooseCandidate() ? handleEvent(event) : false;
  }
  if (event.key === "Escape") {
    dismissedKey.value = completionKey.value;
    return handleEvent(event);
  }
  return false;
}

function handleEvent(event: KeyboardEvent): true {
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function canPickReference(): boolean {
  void selectionVersion.value;
  if (!props.active || props.composing || !props.input) return false;
  return (
    referenceActiveState.value ||
    Boolean(
      getFormulaReferenceEditContext(
        props.value,
        props.input.selectionStart,
        props.input.selectionEnd,
      ),
    )
  );
}

function pickReference(range: CellRange, phase: FormulaReferencePickPhase): boolean {
  if (phase === "start") {
    if (!canPickReference()) return false;
    referenceContext =
      referenceContext ??
      getFormulaReferenceEditContext(
        props.value,
        props.input?.selectionStart ?? null,
        props.input?.selectionEnd ?? null,
      );
    if (!referenceContext) return false;
  }
  if (!referenceContext) return false;
  const source = expectedReferenceValue ?? props.value;
  const edit = replaceFormulaReference(source, referenceContext, range);
  referenceContext = edit.context;
  referenceRangeState.value = { start: { ...range.start }, end: { ...range.end } };
  referenceActiveState.value = true;
  emitTextEdit(edit.value, edit.caret, true);
  return true;
}

function clearReferenceCapture(): void {
  referenceContext = null;
  referenceRangeState.value = null;
  referenceActiveState.value = false;
}

function onOptionPointerDown(event: PointerEvent, candidate: FormulaFunctionCandidate): void {
  event.preventDefault();
  chooseCandidate(candidate);
  props.input?.focus({ preventScroll: true });
}

onBeforeUnmount(() => detachInputListeners(observedInput));

defineExpose<
  FormulaReferenceEditor & {
    handleKeydown: (event: KeyboardEvent) => boolean;
    inputAria: Readonly<Record<string, string | boolean | undefined>>;
    listId: string;
    activeId: string | undefined;
  }
>({
  handleKeydown,
  canPickReference,
  pickReference,
  get references() {
    return references.value;
  },
  get editingFormula() {
    return editingFormula.value;
  },
  get referenceRange() {
    return referenceRangeState.value;
  },
  get referenceActive() {
    return referenceActiveState.value;
  },
  get inputAria() {
    return inputAria.value;
  },
  listId,
  get activeId() {
    return activeId.value;
  },
});
</script>

<template>
  <Teleport to="body">
    <section
      v-if="visible"
      :id="listId"
      ref="listboxRef"
      class="formula-input-assist"
      :class="{ 'is-help-only': !isOpen }"
      :style="floatingStyles"
      :role="isOpen ? 'listbox' : undefined"
      :aria-label="isOpen ? t('formulaAssist.listLabel') : undefined"
      @pointerdown.prevent
    >
      <button
        v-for="(candidate, index) in isOpen ? candidates : []"
        :id="`${listId}-${candidate.id}`"
        :key="candidate.id"
        class="formula-input-assist__option"
        :class="{ 'is-active': index === activeIndex }"
        type="button"
        role="option"
        :aria-selected="index === activeIndex"
        :data-formula-suggestion="candidate.id"
        @pointerdown="onOptionPointerDown($event, candidate)"
      >
        <strong>{{ candidate.id }}</strong>
        <span>{{ t(FUNCTION_COPY[candidate.name]!.description) }}</span>
      </button>
      <p :id="`${listId}-help`" class="formula-input-assist__help" data-formula-help>
        <code v-if="helpCandidate">{{ t(FUNCTION_COPY[helpCandidate.name]!.signature) }}</code>
        <span v-if="argumentHint">{{ argumentHint }}</span>
      </p>
    </section>
  </Teleport>
</template>

<style scoped lang="scss">
.formula-input-assist {
  z-index: 30;
  min-width: 210px;
  overflow: hidden;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-default);
  box-shadow: var(--idea-shadow-menu);

  // Argument help may overlap the grid but must not intercept reference picks.
  &.is-help-only {
    pointer-events: none;
  }

  &__option {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: var(--idea-space-2);
    width: 100%;
    padding: 7px 10px;
    color: var(--idea-text-primary);
    text-align: left;
    background: transparent;
    border: 0;

    &.is-active {
      background: var(--idea-surface-hover);
    }

    span {
      overflow: hidden;
      color: var(--idea-text-secondary);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__help {
    display: grid;
    gap: 3px;
    margin: 0;
    padding: 5px 10px;
    color: var(--idea-text-secondary);
    font-size: 12px;
    border-top: 1px solid var(--idea-border-subtle);

    code {
      font-size: inherit;
    }
  }
}
</style>
