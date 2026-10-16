<script setup lang="ts">
import { computed, inject, shallowRef, watch } from "vue";
import NumericField from "../../../../shared/numeric-field/NumericField.vue";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericDraftChange,
  NumericFieldSpec,
} from "../../../../shared/numeric-field/types";
import {
  PICTURE_FORMAT_GEOMETRY_FIELDS,
  pictureFormatNumericValue,
  pictureFormatPointsToUnit,
  pictureFormatUnitToPoints,
  type PictureFormatLengthUnit,
  type PictureFormatNumberField,
} from "../../picture-format-pane-model";
import { pictureFormatCommonReasons } from "./picture-format-feedback";
import type {
  PictureFormatNumericEditor,
  PictureFormatPaneController,
} from "./usePictureFormatPane";
const props = defineProps<{
  controller: PictureFormatPaneController;
  field: PictureFormatNumberField;
  unit: PictureFormatLengthUnit;
}>();
const commonReasons = inject(pictureFormatCommonReasons, undefined);
const editor = shallowRef<PictureFormatNumericEditor>();
watch(
  () => [props.controller, props.controller.numericLease.value, props.field, props.unit] as const,
  () => {
    editor.value = props.controller.numericEditor(props.field, props.unit);
  },
  { immediate: true, flush: "sync" },
);
const binding = computed(() => props.controller.number(props.field, props.unit));
const ownerKey = computed(
  () =>
    `${props.controller.numericLease.value.ownerKey}:${props.controller.numericLease.value.generation}:${props.field}`,
);
const suffix = computed(() =>
  PICTURE_FORMAT_GEOMETRY_FIELDS.includes(props.field)
    ? props.controller.t(props.unit === "in" ? "unitIn" : props.unit === "cm" ? "unitCm" : "unitPt")
    : props.field.endsWith("Pt")
      ? props.controller.t("unitPt")
      : props.field.endsWith("Deg")
        ? props.controller.t("degreeUnit")
        : props.controller.t("percentUnit"),
);
const value = computed(() => {
  const value = props.controller.snapshot.value?.values[props.field];
  return typeof value === "number" ? { kind: "value" as const, value } : { kind: "empty" as const };
});
const spec = computed<NumericFieldSpec>(() => {
  const field = props.field,
    unit = props.unit,
    geometry = PICTURE_FORMAT_GEOMETRY_FIELDS.includes(field);
  const capability = editor.value?.capability();
  const shadow = props.controller.snapshot.value?.values.shadowPreset;
  const enabledShadow = shadow !== undefined && shadow !== "none" && shadow !== "inherit";
  return {
    displayUnit: suffix.value,
    displayPrecision: geometry && unit === "in" ? 2 : 4,
    toDisplay: geometry ? (value) => pictureFormatPointsToUnit(value, unit) : undefined,
    fromDisplay: geometry ? (value) => pictureFormatUnitToPoints(value, unit) : undefined,
    // Keep paired size/scale controls on the same existing step contract.
    // Other geometry fields have no step contract; do not invent one.
    displayStep:
      field === "sizeHeightPt" || field === "sizeWidthPt"
        ? { in: 0.1, pt: 1, cm: 0.1 }[unit]
        : field === "lineWidthPt"
          ? 0.25
          : field === "rotationDeg" ||
              field === "scaleHeightPercent" ||
              field === "scaleWidthPercent" ||
              field === "lineTransparencyPercent"
            ? 1
            : (field === "shadowBlurPt" || field === "shadowDistancePt") && enabledShadow
              ? 1
              : undefined,
    canonicalBounds: { min: capability?.min, max: capability?.max },
    parsePolicy: { decimalComma: true },
    validateCanonical: () => {
      // Preserve the original decimal string: String(1e-9) would manufacture an
      // exponent that this field's existing decimal-only parser correctly rejects.
      const text = props.controller.number(field, unit).text;
      const result = pictureFormatNumericValue(field, text, unit, capability);
      return "error" in result ? props.controller.t(result.error) : undefined;
    },
  };
});
const commit = computed(() => {
  const bridge = editor.value,
    owner = ownerKey.value;
  return (candidate: NumericCandidate): NumericCommitResult => {
    if (
      !bridge ||
      bridge !== editor.value ||
      owner !== ownerKey.value ||
      candidate.kind !== "value"
    )
      return { accepted: false, error: props.controller.t("applyRejected") };
    const before = props.controller.snapshot.value;
    const accepted = bridge.commit();
    if (!accepted)
      return {
        accepted: false,
        error:
          props.controller.number(props.field, props.unit).error ??
          props.controller.t("applyRejected"),
      };
    const after = props.controller.snapshot.value;
    const acknowledged = after !== before ? after?.values[props.field] : undefined;
    return {
      accepted: true,
      value: typeof acknowledged === "number" ? { kind: "value", value: acknowledged } : undefined,
    };
  };
});
function draftChange(draft: NumericDraftChange) {
  if (draft.ownerKey !== ownerKey.value) return;
  if (draft.dirty && !draft.stale) editor.value?.preview(draft.text);
  else if (!draft.dirty) editor.value?.cancel();
}
function focusChange(focused: boolean) {
  editor.value?.focus(focused);
}
</script>
<template>
  <NumericField
    :data-picture-format-field="field"
    :owner-key="ownerKey"
    :value="value"
    :spec="spec"
    :label="controller.t(field)"
    :empty-text="controller.t('notAvailable')"
    :disabled="binding.disabled"
    :reason="binding.reason"
    :hide-reason="!!binding.reason && !!commonReasons?.has(binding.reason)"
    :external-error="binding.error"
    :invalid-message="controller.t('invalidNumber')"
    :rejected-message="controller.t('applyRejected')"
    :stale-message="controller.t('staleOwner')"
    :on-commit="commit"
    presentation="inline-stepper"
    show-label
    @draft-change="draftChange"
    @cancel="editor?.cancel()"
    @focus-change="focusChange"
  />
</template>
