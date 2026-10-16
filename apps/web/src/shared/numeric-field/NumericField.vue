<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import type { ChangeContext, InputNumberValue } from "tdesign-vue-next/es/input-number/type";
import { vNativeControl } from "../tdesign/native-control";
import FieldFeedback from "../field-feedback/FieldFeedback.vue";
import { useNumericDraft } from "./useNumericDraft";
import type { NumericDraftChange, NumericDraftInputs } from "./types";

const props = withDefaults(
  defineProps<
    NumericDraftInputs & {
      label: string;
      id?: string;
      describedBy?: string;
      mixedText?: string;
      autoText?: string;
      emptyText?: string;
      presentation?: "column" | "inline-stepper" | "plain";
      showLabel?: boolean;
      /** Presentation only; the native accessible value always retains its display unit. */
      showUnit?: boolean;
      feedbackPresentation?: "inline" | "floating";
      reason?: string;
      /** Hide only a repeated reason visually; retain its native accessible description. */
      hideReason?: boolean;
      externalError?: string;
      contextAttributes?: Record<string, string | number | boolean | null | undefined>;
      focusBoundary?: () => readonly Element[];
    }
  >(),
  {
    presentation: "column",
    showUnit: true,
    feedbackPresentation: "inline",
    mixedText: "Mixed values",
    autoText: "Automatic",
    emptyText: "No value",
  },
);
const emit = defineEmits<{
  draftChange: [value: NumericDraftChange];
  cancel: [event: KeyboardEvent];
  focusChange: [focused: boolean];
}>();
const state = useNumericDraft(props, (value) => emit("draftChange", value));
const { text, dirty, composing, error, accepted, parsed, activeSpec } = state;
const root = ref<HTMLElement>();
let live = true;
const uniqueId = useId();
const inputId = computed(() => props.id ?? `numeric-${uniqueId}`);
const feedbackId = `numeric-feedback-${uniqueId}`;
const feedback = computed(() => error.value ?? props.externalError ?? props.reason);
const invalid = computed(() => !!(error.value ?? props.externalError));
const reasonDescriptionOnly = computed(() => props.hideReason && !invalid.value);
const unit = computed(() => activeSpec.value.displayUnit);
const hasStepper = computed(() => props.presentation !== "plain" && !!activeSpec.value.displayStep);
const displayedNumber = computed(() => {
  const current = dirty.value ? parsed.value : accepted.value;
  if (current?.kind !== "value") return undefined;
  return activeSpec.value.toDisplay ? activeSpec.value.toDisplay(current.value) : current.value;
});
const valueText = computed(() => {
  if (!dirty.value && accepted.value.kind === "mixed") return props.mixedText;
  if (!dirty.value && accepted.value.kind === "auto") return props.autoText;
  if (!dirty.value && accepted.value.kind === "empty") return props.emptyText;
  return [text.value, unit.value].filter(Boolean).join(" ");
});
const placeholder = computed(() =>
  accepted.value.kind === "mixed"
    ? props.mixedText
    : accepted.value.kind === "auto"
      ? props.autoText
      : props.emptyText || undefined,
);
const nativeAttributes = computed(() => {
  const bounds = activeSpec.value.canonicalBounds;
  const convert = activeSpec.value.toDisplay ?? ((value: number) => value);
  const increasing = convert(1) >= convert(0);
  const minimum = increasing ? bounds?.min : bounds?.max;
  const maximum = increasing ? bounds?.max : bounds?.min;
  const described = [props.describedBy, feedback.value ? feedbackId : undefined]
    .filter(Boolean)
    .join(" ");
  const contextual = Object.fromEntries(
    Object.entries(props.contextAttributes ?? {}).filter(
      ([key]) =>
        key.startsWith("data-") ||
        key.startsWith("aria-") ||
        ["name", "autocomplete", "tabindex"].includes(key),
    ),
  );
  return {
    ...contextual,
    id: inputId.value,
    readonly: props.readOnly ? "" : undefined,
    disabled: props.disabled ? "" : undefined,
    unselectable: "off",
    inputmode: activeSpec.value.integer ? "numeric" : "decimal",
    role: hasStepper.value ? "spinbutton" : "textbox",
    value: text.value,
    "aria-label": props.label,
    "aria-describedby": described || undefined,
    "aria-invalid": invalid.value ? "true" : undefined,
    "aria-readonly": props.readOnly ? "true" : undefined,
    "aria-disabled": props.disabled ? "true" : undefined,
    "aria-valuenow": hasStepper.value ? displayedNumber.value : undefined,
    "aria-valuetext": valueText.value,
    "aria-valuemin": hasStepper.value && minimum !== undefined ? convert(minimum) : undefined,
    "aria-valuemax": hasStepper.value && maximum !== undefined ? convert(maximum) : undefined,
  };
});
function inside(target: EventTarget | null): boolean {
  return (
    target instanceof Node &&
    (!!root.value?.contains(target) ||
      (props.focusBoundary?.() ?? []).some((element) => element.contains(target)))
  );
}
let keyGesture = false;
function stopRepeating(commit = true) {
  const active = keyGesture;
  keyGesture = false;
  if (active && commit) state.endGesture();
}
// Public InputNumber changes are local edits only. The domain transaction remains
// the sole document writer and retains canonical conversion and lease guards.
function numberChange(_value: InputNumberValue, context: ChangeContext) {
  if (context.type !== "add" && context.type !== "reduce") return;
  const direction = context.type === "add" ? 1 : -1;
  if (!state.canStep(direction)) return;
  state.beginGesture();
  state.step(direction);
  state.endGesture();
}
function keydown(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLInputElement)) return;
  inputKeydown(undefined, { e: event });
}
function inputKeydown(_value: unknown, { e: event }: { e: KeyboardEvent }) {
  if (event.isComposing || event.keyCode === 229 || composing.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    stopRepeating(false);
    state.cancel();
    emit("cancel", event);
  } else if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    stopRepeating();
    state.commit("enter");
  } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && hasStepper.value) {
    event.preventDefault();
    event.stopPropagation();
    if (!keyGesture) {
      keyGesture = true;
      state.beginGesture();
    }
    state.step(event.key === "ArrowUp" ? 1 : -1);
  }
}
// VNode callbacks carry the lease that created them. A retained callback cannot
// borrow a newly selected owner's input or a replacement command handler.
const events = computed(() => {
  const owner = props.ownerKey,
    handler = props.onCommit;
  const current = () => live && owner === props.ownerKey && handler === props.onCommit;
  return {
    numberChange: (value: InputNumberValue, context: ChangeContext) => {
      if (current()) numberChange(value, context);
    },
    edit: (value: unknown) => {
      if (current()) state.edit(value);
    },
    keydown: (value: unknown, context: { e: KeyboardEvent }) => {
      if (current()) inputKeydown(value, context);
    },
    enter: (_value?: unknown, context?: { e: KeyboardEvent }) => {
      if (current() && !context?.e.isComposing && !composing.value) state.commit("enter");
    },
    blur: (_value: unknown, { e }: { e: FocusEvent }) => {
      if (current()) focusout(e);
    },
  };
});
// TDesign snapshots inputProps at setup; keep one public reactive object with live getters.
const numberInputProps = reactive({
  get value() {
    return text.value;
  },
  size: "small" as const,
  unselectable: "off",
  get onChange() {
    return events.value.edit;
  },
  get onBlur() {
    return events.value.blur;
  },
  get onEnter() {
    return events.value.enter;
  },
});
function keyup(event: KeyboardEvent) {
  if (event.key === "ArrowUp" || event.key === "ArrowDown") stopRepeating();
}
function focusin() {
  if (state.focused.value) return;
  state.focused.value = true;
  emit("focusChange", true);
}
function focusout(event: FocusEvent) {
  if (inside(event.relatedTarget)) return;
  void nextTick(() => {
    if (inside(document.activeElement)) return;
    stopRepeating();
    state.commit("blur");
    state.focused.value = false;
    emit("focusChange", false);
  });
}
function documentFocusin(event: FocusEvent) {
  if (!state.focused.value || inside(event.target)) return;
  stopRepeating();
  state.commit("blur");
  state.focused.value = false;
  emit("focusChange", false);
}
const editorEpoch = ref(0);
let compositionOwner: string | undefined;
function compositionStart() {
  compositionOwner = props.ownerKey;
  state.setComposing(true);
}
function composingBlur(event: FocusEvent) {
  if (!composing.value || !(event.target instanceof HTMLInputElement)) return;
  // InputNumber normalizes its own stale numeric value on blur, even during IME.
  // Preserve the actual composition text; focusout still performs owner cleanup,
  // and compositionEnd commits through the existing lease if focus has left.
  state.edit(event.target.value);
  event.stopPropagation();
}
function compositionEnd(event: CompositionEvent) {
  compositionOwner = undefined;
  state.setComposing(
    false,
    event.target instanceof HTMLInputElement ? event.target.value : undefined,
  );
  if (!inside(document.activeElement)) void nextTick(() => state.commit("blur"));
}
function windowBlur() {
  stopRepeating();
}
watch(
  () => props.ownerKey,
  () => {
    stopRepeating(false);
    if (compositionOwner !== undefined && compositionOwner !== props.ownerKey) {
      // Retire the library's internal IME session as well as the domain lease.
      // Ordinary same-owner updates retain the native editor and selection.
      compositionOwner = undefined;
      editorEpoch.value++;
    }
  },
  { flush: "sync" },
);
watch(
  () => props.disabled || props.readOnly,
  (value) => {
    if (value) stopRepeating(false);
  },
);
onMounted(() => {
  document.addEventListener("focusin", documentFocusin);
  window.addEventListener("pointerup", windowBlur);
  window.addEventListener("pointercancel", windowBlur);
  window.addEventListener("blur", windowBlur);
  window.addEventListener("keyup", keyup);
});
onBeforeUnmount(() => {
  live = false;
  document.removeEventListener("focusin", documentFocusin);
  stopRepeating(false);
  window.removeEventListener("pointerup", windowBlur);
  window.removeEventListener("pointercancel", windowBlur);
  window.removeEventListener("blur", windowBlur);
  window.removeEventListener("keyup", keyup);
});
defineExpose({
  commit: state.commit,
  cancel: state.cancel,
  focus: () => root.value?.querySelector<HTMLInputElement>("input")?.focus(),
  hasPending: () => dirty.value || composing.value,
  edit: state.edit,
  endGesture: state.endGesture,
});
</script>
<template>
  <div
    ref="root"
    class="numeric-field"
    :class="{ 'numeric-field--labelled': showLabel }"
    role="group"
    :aria-label="label"
    @focusin="focusin"
    @focusout="focusout"
    @blur.capture="composingBlur"
    @keydown.capture="keydown"
    @compositionstart.capture="compositionStart"
    @compositionend.capture="compositionEnd"
  >
    <span v-if="showLabel" class="numeric-field__label" :title="label">{{ label }}</span>
    <TInput
      v-if="!hasStepper"
      :key="`plain-${editorEpoch}`"
      v-native-control="{ attributes: nativeAttributes }"
      :model-value="text"
      size="small"
      :disabled="disabled"
      :readonly="readOnly"
      :placeholder="placeholder"
      :status="invalid ? 'error' : undefined"
      align="right"
      @change="events.edit"
      @keydown="events.keydown"
      @enter="events.enter"
      @blur="events.blur"
    >
      <template #suffix>
        <span v-if="unit && showUnit" class="numeric-field__unit" aria-hidden="true">{{
          unit
        }}</span>
      </template>
    </TInput>
    <TInputNumber
      v-else
      :key="`stepper-${editorEpoch}`"
      v-native-control="{
        attributes: nativeAttributes,
        numberSteps: {
          decrease: { label: `${label} −`, disabled: !state.canStep(-1) },
          increase: { label: `${label} +`, disabled: !state.canStep(1) },
        },
      }"
      class="sheetcraft-input-number--persistent-controls"
      theme="column"
      size="small"
      :model-value="displayedNumber"
      :step="activeSpec.displayStep"
      :min="nativeAttributes['aria-valuemin']"
      :max="nativeAttributes['aria-valuemax']"
      :disabled="disabled"
      :readonly="readOnly"
      :placeholder="placeholder"
      :status="invalid ? 'error' : undefined"
      :input-props="numberInputProps"
      allow-input-over-limit
      align="right"
      @change="events.numberChange"
    >
      <template #suffix>
        <span v-if="unit && showUnit" class="numeric-field__unit" aria-hidden="true">{{
          unit
        }}</span>
      </template>
    </TInputNumber>
    <FieldFeedback
      :id="feedbackId"
      :message="feedback"
      :invalid="invalid"
      :presentation="feedbackPresentation"
      :anchor="root"
      :active="state.focused.value"
      :description-only="reasonDescriptionOnly"
    />
  </div>
</template>
<style scoped lang="scss">
.numeric-field {
  min-width: 0;
  &--labelled {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(118px, 46%);
    align-items: center;
    gap: 4px 10px;
  }
  &__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__unit {
    color: var(--sheetcraft-text-secondary);
    white-space: nowrap;
  }
}
</style>
