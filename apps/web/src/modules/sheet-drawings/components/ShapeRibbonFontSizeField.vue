<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, useId } from "vue";
import FontFormatField from "../../../shared/cell-text/FontFormatField.vue";
import FieldFeedback from "../../../shared/field-feedback/FieldFeedback.vue";
import { useNumericDraft } from "../../../shared/numeric-field/useNumericDraft";
import type { FontFieldDraftBinding } from "../../../shared/cell-text/font-field-draft";
import type {
  NumericCandidate,
  NumericCommitResult,
  NumericDraftChange,
  NumericFieldSpec,
  NumericValue,
} from "../../../shared/numeric-field/types";
import { useShapeTextFieldDraft } from "../shape-text-field-drafts";
import type { ShapeFormatController } from "./shape-format/useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController; sessionId?: number }>();
const control = ref<InstanceType<typeof FontFormatField>>();
const root = ref<HTMLElement>();
const focused = ref(false);
const feedbackId = `shape-size-feedback-${useId()}`;
const draftId = useId();
const capability = computed(() => props.controller.fieldCapability("fontSizePt"));
const ownerKey = computed(() => {
  const identity = props.controller.numericIdentity.value;
  return `${identity.ownerKey}:ribbon-fontSizePt:${identity.cancellation}`;
});
const value = computed<NumericValue>(() => {
  if (props.controller.isMixedField("fontSizePt")) return { kind: "mixed" };
  const size = props.controller.props.snapshot?.values.fontSizePt;
  return typeof size === "number" ? { kind: "value", value: size } : { kind: "empty" };
});
const spec = computed<NumericFieldSpec>(() => ({
  displayUnit: "pt",
  canonicalBounds: { min: capability.value.min, max: capability.value.max },
  parsePolicy: { scientific: true },
}));
const commit = computed(() => {
  const controller = props.controller,
    identity = controller.numericIdentity.value,
    owner = ownerKey.value;
  return (candidate: NumericCandidate): NumericCommitResult => {
    const current = controller.numericIdentity.value;
    if (
      controller !== props.controller ||
      owner !== ownerKey.value ||
      identity.ownerKey !== current.ownerKey ||
      identity.lease !== current.lease ||
      identity.cancellation !== current.cancellation ||
      candidate.kind !== "value"
    )
      return { accepted: false, error: controller.s.value("staleOwner") };
    const accepted = controller.session.fieldAction("fontSizePt")(candidate.value);
    return accepted
      ? { accepted: true }
      : { accepted: false, error: controller.s.value("applyRejected") };
  };
});
function draftChange(draft: NumericDraftChange) {
  if (draft.ownerKey === ownerKey.value)
    props.controller.setNumericDraft(draftId, draft.dirty || draft.composing);
}
onBeforeUnmount(() => props.controller.setNumericDraft(draftId, false));
const inputs = reactive({
  get value() {
    return value.value;
  },
  get ownerKey() {
    return ownerKey.value;
  },
  get spec() {
    return spec.value;
  },
  get disabled() {
    return !capability.value.enabled || value.value.kind === "empty";
  },
  get invalidMessage() {
    return props.controller.s.value("outOfRange");
  },
  get rejectedMessage() {
    return props.controller.s.value("applyRejected");
  },
  get staleMessage() {
    return props.controller.s.value("staleOwner");
  },
  get onCommit() {
    return commit.value;
  },
});
const state = useNumericDraft(inputs, draftChange);
const binding = computed<FontFieldDraftBinding>(() => {
  const owner = ownerKey.value,
    handler = commit.value;
  const current = () => owner === ownerKey.value && handler === commit.value;
  return {
    get text() {
      return state.text.value;
    },
    get composing() {
      return state.composing.value;
    },
    edit: (text) => {
      if (current()) state.edit(text);
    },
    setComposing: (active, text) => {
      if (current()) state.setComposing(active, text);
    },
    submit: (source) => current() && !state.composing.value && state.commit(source),
    select: (selected) => {
      if (!current() || state.composing.value) return false;
      state.edit(String(selected));
      return state.commit("external");
    },
    cancel: () => {
      if (current()) state.cancel();
    },
  };
});
const options = computed(() => {
  const values = new Set([8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]);
  if (value.value.kind === "value") values.add(value.value.value);
  return [...values].sort((a, b) => a - b).map((value) => ({ label: String(value), value }));
});
useShapeTextFieldDraft({
  owner: () => props.controller.props.snapshot?.owner.sessionId,
  flush: () => !state.composing.value && state.commit("blur"),
  focus: () => control.value?.focus(),
  containsTarget: (target) => control.value?.containsTarget(target) ?? false,
  blocking: () => state.dirty.value || state.composing.value,
});
defineExpose({
  commit: () => !state.composing.value && state.commit("external"),
  focus: () => control.value?.focus(),
  hasPending: () => state.dirty.value || state.composing.value,
});
</script>
<template>
  <div ref="root">
    <FontFormatField
      ref="control"
      :model-value="value.kind === 'value' ? value.value : undefined"
      :draft="binding"
      :options="options"
      :label="controller.fieldLabel('fontSizePt')"
      :placeholder="value.kind === 'mixed' ? controller.s.value('mixedValues') : undefined"
      :disabled="inputs.disabled"
      :status="state.error.value ? 'error' : undefined"
      :described-by="state.error.value ? feedbackId : undefined"
      :native-attributes="{
        inputmode: 'decimal',
        'aria-description': 'pt',
        'data-shape-text-edit-session': sessionId,
        'data-shape-format-field': 'fontSizePt',
      }"
      @focus-change="focused = $event"
    />
    <FieldFeedback
      :id="feedbackId"
      :message="state.error.value"
      :invalid="!!state.error.value"
      presentation="floating"
      :anchor="root"
      :active="focused"
    />
  </div>
</template>
