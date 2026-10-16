<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Slider as TSlider } from "tdesign-vue-next/es/slider";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericDraftChange,
  NumericFieldSpec,
} from "../../../../shared/numeric-field/types";
const props = defineProps<{
  ownerKey: string;
  value: number;
  label: string;
  unit?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Display only: preserve full accepted/input values and model opacity precision. */
  displayPrecision?: number;
  invalidMessage: string;
  rejectedMessage: string;
  staleMessage?: string;
  onCommit: (value: number) => boolean;
}>();
const control = ref<InstanceType<typeof NumericField>>();
const spec = computed<NumericFieldSpec>(() => ({
  displayUnit: props.unit,
  displayStep: props.step ?? 1,
  displayPrecision: props.displayPrecision,
  canonicalBounds: { min: props.min, max: props.max },
  parsePolicy: { scientific: true },
}));
const slider = computed(
  () =>
    props.unit === "%" &&
    props.min !== undefined &&
    props.max !== undefined &&
    props.min >= -100 &&
    props.max <= 100,
);
const preview = ref(props.value);
watch(
  () => [props.value, props.ownerKey],
  () => {
    preview.value = props.value;
  },
);
const sliderValue = computed(() => (Number.isFinite(preview.value) ? preview.value : props.value));
function draftChange(value: NumericDraftChange) {
  if (value.ownerKey !== props.ownerKey) return;
  const numeric = Number(value.text);
  preview.value = value.text.trim() && Number.isFinite(numeric) ? numeric : props.value;
}
const commit = computed(() => {
  const handler = props.onCommit;
  const owner = props.ownerKey;
  return (candidate: NumericCandidate): NumericCommitResult => {
    if (owner !== props.ownerKey || handler !== props.onCommit || candidate.kind !== "value")
      return { accepted: false, error: props.rejectedMessage };
    return handler(candidate.value) === true
      ? { accepted: true }
      : { accepted: false, error: props.rejectedMessage };
  };
});
// Slider1.20 public change/changeEnd only carry values, not an input source.
// Its props/init normalization also emits change. Native gestures are the boundary
// that distinguishes real edits from those controlled echoes.
type SliderGesture = {
  owner: string;
  handler: typeof props.onCommit;
  kind: "pointer" | "keyboard";
  completion: "active" | "finishing" | "done";
};
let sliderGesture: SliderGesture | undefined;
let pointerFallback: ReturnType<typeof setTimeout> | undefined;
let pointerFallbackTail: ReturnType<typeof setTimeout> | undefined;
const sliderKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
function currentGesture(gesture: SliderGesture | undefined) {
  return (
    !!gesture &&
    gesture === sliderGesture &&
    gesture.completion !== "done" &&
    !props.disabled &&
    gesture.owner === props.ownerKey &&
    gesture.handler === props.onCommit
  );
}
function cancelSlide() {
  if (sliderGesture) sliderGesture.completion = "done";
  sliderGesture = undefined;
  clearTimeout(pointerFallback);
  clearTimeout(pointerFallbackTail);
  pointerFallback = pointerFallbackTail = undefined;
  window.removeEventListener("mouseup", finishPointerOutside);
  window.removeEventListener("pointerup", finishPointerOutside);
  window.removeEventListener("touchend", finishPointerOutside);
  window.removeEventListener("pointercancel", cancelInteraction);
  window.removeEventListener("touchcancel", cancelInteraction);
  window.removeEventListener("keyup", finishKeyboard);
  window.removeEventListener("blur", finishWindowBlur);
}
function cancelInteraction() {
  if (currentGesture(sliderGesture)) control.value?.cancel();
  cancelSlide();
}
function beginSliderGesture(kind: SliderGesture["kind"]) {
  cancelSlide();
  sliderGesture = { owner: props.ownerKey, handler: props.onCommit, kind, completion: "active" };
  window.addEventListener("blur", finishWindowBlur);
  if (kind === "keyboard") window.addEventListener("keyup", finishKeyboard);
  else {
    window.addEventListener("mouseup", finishPointerOutside);
    window.addEventListener("pointerup", finishPointerOutside);
    window.addEventListener("touchend", finishPointerOutside);
    window.addEventListener("pointercancel", cancelInteraction);
    window.addEventListener("touchcancel", cancelInteraction);
  }
}
function startPointer(event: MouseEvent | PointerEvent | TouchEvent) {
  if (props.disabled || ("button" in event && event.button !== 0)) return;
  if (sliderGesture?.kind === "pointer" && currentGesture(sliderGesture)) return;
  beginSliderGesture("pointer");
}
function startKeyboard(event: KeyboardEvent) {
  if (event.key === "Escape" && sliderGesture) {
    event.preventDefault();
    event.stopPropagation();
    cancelInteraction();
    return;
  }
  if (props.disabled || event.isComposing || !sliderKeys.has(event.code || event.key)) return;
  if (sliderGesture?.kind === "keyboard" && currentGesture(sliderGesture)) return;
  beginSliderGesture("keyboard");
}
function slide(value: number | number[]) {
  if (currentGesture(sliderGesture) && typeof value === "number" && value !== sliderValue.value)
    control.value?.edit(String(value));
}
async function finishSlide(value?: number | number[]) {
  const gesture = sliderGesture;
  if (!currentGesture(gesture) || gesture!.completion !== "active") return;
  gesture!.completion = "finishing";
  // Library value watchers finish before this exact gesture can submit once.
  await nextTick();
  if (!currentGesture(gesture) || gesture!.completion !== "finishing") return;
  if (typeof value === "number") control.value?.edit(String(value));
  if (control.value?.hasPending()) control.value.commit("step");
  if (gesture === sliderGesture) cancelSlide();
}
function finishKeyboard(event: KeyboardEvent) {
  if (sliderGesture?.kind === "keyboard" && sliderKeys.has(event.code || event.key))
    void finishSlide();
}
function finishFocusout(event: FocusEvent) {
  if (sliderGesture?.kind !== "keyboard") return;
  const root = event.currentTarget;
  if (
    root instanceof Node &&
    event.relatedTarget instanceof Node &&
    root.contains(event.relatedTarget)
  )
    return;
  void finishSlide();
}
function finishWindowBlur() {
  void finishSlide();
}
function finishPointerOutside() {
  const gesture = sliderGesture;
  if (!currentGesture(gesture) || gesture!.kind !== "pointer" || pointerFallback !== undefined)
    return;
  // Installed Slider defers its mouseup/changeEnd by one timer. Let that public
  // completion win, then check only this still-active gesture in the next task.
  pointerFallback = setTimeout(() => {
    pointerFallback = undefined;
    if (!currentGesture(gesture)) return;
    pointerFallbackTail = setTimeout(() => {
      pointerFallbackTail = undefined;
      void nextTick(() => {
        if (currentGesture(gesture)) void finishSlide();
      });
    }, 0);
  }, 0);
}
watch(() => [props.ownerKey, props.onCommit, props.disabled], cancelSlide, { flush: "sync" });
onBeforeUnmount(cancelSlide);
</script>
<template>
  <div class="picture-paint-number">
    <NumericField
      ref="control"
      :owner-key="ownerKey"
      :value="{ kind: 'value', value }"
      :spec="spec"
      :label="label"
      :disabled="disabled"
      :invalid-message="invalidMessage"
      :rejected-message="rejectedMessage"
      :stale-message="staleMessage"
      :on-commit="commit"
      presentation="inline-stepper"
      show-label
      @draft-change="draftChange"
    />
    <div v-if="slider" class="picture-paint-number__slider">
      <TSlider
        :model-value="sliderValue"
        :min="min"
        :max="max"
        :step="step ?? 1"
        :disabled="disabled"
        :aria-label="label"
        @pointerdown.capture="startPointer"
        @mousedown.capture="startPointer"
        @touchstart.capture="startPointer"
        @pointercancel.capture="cancelInteraction"
        @touchcancel.capture="cancelInteraction"
        @keydown.capture="startKeyboard"
        @keyup.capture="finishKeyboard"
        @focusout.capture="finishFocusout"
        @change="slide"
        @change-end="finishSlide"
      />
    </div>
  </div>
</template>
<style scoped lang="scss">
.picture-paint-number {
  display: grid;
  gap: 3px;
  min-width: 0;

  &__slider {
    min-width: 0;
    padding-inline: var(--sheetcraft-space-5);
  }
}
</style>
