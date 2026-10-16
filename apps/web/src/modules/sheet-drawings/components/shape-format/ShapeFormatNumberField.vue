<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from "vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericDraftChange,
  NumericFieldSpec,
} from "../../../../shared/numeric-field/types";
import type { PictureFormatLengthUnit } from "../../../sheet-images/picture-format-pane-model";
import {
  isShapeFormatLengthField,
  shapeFormatFromDisplay,
  shapeFormatToDisplay,
  type ShapeFormatNumberField,
} from "../../shape-format-pane-model";
import { useShapeTextFieldDraft } from "../../shape-text-field-drafts";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = withDefaults(
  defineProps<{
    controller: ShapeFormatController;
    field: ShapeFormatNumberField;
    unit?: PictureFormatLengthUnit;
  }>(),
  { unit: "pt" },
);
const draftId = useId();
const control = ref<InstanceType<typeof NumericField>>();
const ownerKey = computed(() => {
  const identity = props.controller.numericIdentity.value;
  return `${identity.ownerKey}:${props.field}:${identity.cancellation}`;
});
watch(
  () => ownerKey.value,
  () => props.controller.setNumericDraft(draftId, false),
  { flush: "sync" },
);
onUnmounted(() => props.controller.setNumericDraft(draftId, false));
const capability = computed(() => props.controller.fieldCapability(props.field));
const mixed = computed(() => props.controller.isMixedField(props.field));
const value = computed(() => {
  const number = props.controller.props.snapshot?.values[props.field];
  return mixed.value
    ? { kind: "mixed" as const }
    : typeof number === "number"
      ? { kind: "value" as const, value: number }
      : { kind: "empty" as const };
});
const spec = computed<NumericFieldSpec>(() => {
  const length = isShapeFormatLengthField(props.field),
    unit = props.unit;
  return {
    displayUnit: length ? unit : props.field.endsWith("Percent") ? "%" : "°",
    toDisplay: length ? (value) => shapeFormatToDisplay(value, unit) : undefined,
    fromDisplay: length ? (value) => shapeFormatFromDisplay(value, unit) : undefined,
    // Retain the former field's explicit one-display-unit step, not a guessed WPS default.
    displayStep:
      props.field === "sizeHeightPt" && props.controller.props.snapshot?.drawing.kind === "textBox"
        ? { in: 0.1, pt: 1, cm: 0.1 }[unit]
        : 1,
    displayPrecision: length && unit === "in" ? 2 : undefined,
    canonicalBounds: { min: capability.value.min, max: capability.value.max },
    parsePolicy: { scientific: true },
  };
});
const commit = computed(() => {
  const owner = ownerKey.value,
    controller = props.controller,
    field = props.field;
  const identity = controller.numericIdentity.value;
  return (candidate: NumericCandidate): NumericCommitResult => {
    if (
      owner !== ownerKey.value ||
      controller !== props.controller ||
      identity.ownerKey !== controller.numericIdentity.value.ownerKey ||
      identity.lease !== controller.numericIdentity.value.lease ||
      identity.cancellation !== controller.numericIdentity.value.cancellation ||
      candidate.kind !== "value"
    )
      return { accepted: false, error: controller.s.value("staleOwner") };
    // Capture the newest acknowledged revision only when this edit is submitted.
    // A dirty external revision changes the typed lease and is rejected above.
    const accepted = controller.session.fieldAction(field)(candidate.value) === true;
    if (owner === ownerKey.value) controller.setNumericDraft(draftId, !accepted);
    return accepted
      ? { accepted: true }
      : { accepted: false, error: controller.s.value("applyRejected") };
  };
});
function draftChange(draft: NumericDraftChange) {
  if (draft.ownerKey === ownerKey.value)
    props.controller.setNumericDraft(draftId, draft.dirty || draft.composing);
}
useShapeTextFieldDraft({
  owner: () => props.controller.props.snapshot?.owner.sessionId,
  flush: () => control.value?.commit("blur") ?? true,
  focus: () => control.value?.focus(),
  blocking: () => control.value?.hasPending() ?? false,
});
defineExpose({
  commit: () => control.value?.commit("external") ?? true,
  focus: () => control.value?.focus(),
  hasPending: () => control.value?.hasPending() ?? false,
});
</script>
<template>
  <NumericField
    ref="control"
    :data-shape-format-field="field"
    :owner-key="ownerKey"
    :context-attributes="{ 'data-shape-format-owner': ownerKey, 'data-shape-format-field': field }"
    :value="value"
    :spec="spec"
    :label="controller.fieldLabel(field)"
    :mixed-text="controller.s.value('mixedValues')"
    :empty-text="controller.s.value('missingValue')"
    :disabled="!capability.enabled || value.kind === 'empty'"
    :reason="!capability.enabled ? capability.reason : undefined"
    :invalid-message="controller.s.value('outOfRange')"
    :rejected-message="controller.s.value('applyRejected')"
    :stale-message="controller.s.value('staleOwner')"
    :on-commit="commit"
    presentation="inline-stepper"
    show-label
    @draft-change="draftChange"
  />
</template>
