<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import PictureFormatField from "../../../sheet-images/components/format-pane/PictureFormatField.vue";
import type { ShapeFormatTextField } from "../../shape-format-pane-model";
import type { ShapeFormatController } from "./useShapeFormatPane";
const props = defineProps<{
  controller: ShapeFormatController;
  field: ShapeFormatTextField;
  multiline?: boolean;
}>();
const capability = computed(() => props.controller.fieldCapability(props.field));
const value = computed(() =>
  props.controller.isMixedField(props.field)
    ? ""
    : (props.controller.props.snapshot?.values[props.field] ?? ""),
);
const draft = ref(value.value),
  dirty = ref(false),
  error = ref<string>();
let skipBlur = false;
watch(
  () => props.controller.ownerKey.value,
  () => {
    draft.value = value.value;
    dirty.value = false;
    error.value = undefined;
    skipBlur = false;
  },
);
watch(value, (next) => {
  if (!dirty.value) draft.value = next;
});
const action = computed(() => props.controller.session.fieldAction(props.field));
function edit(next: unknown) {
  if (!capability.value.enabled || typeof next !== "string") return;
  draft.value = next;
  dirty.value = true;
  error.value = undefined;
  skipBlur = false;
}
function commit() {
  if (!capability.value.enabled || !dirty.value) return;
  if (action.value(draft.value)) {
    dirty.value = false;
    error.value = undefined;
  } else error.value = props.controller.s.value("applyRejected");
}
function blur() {
  if (skipBlur) {
    skipBlur = false;
    return;
  }
  commit();
}
function enter() {
  skipBlur = true;
  commit();
}
function keydown(_value: unknown, context: { e: KeyboardEvent }) {
  if (context.e.key !== "Escape") return;
  context.e.preventDefault();
  context.e.stopPropagation();
  draft.value = value.value;
  dirty.value = false;
  error.value = undefined;
}
</script>
<template>
  <PictureFormatField
    :label="controller.fieldLabel(field)"
    :reason="capability.enabled ? undefined : capability.reason"
    :error="error"
    :stacked="multiline"
    :data-shape-format-field="field"
  >
    <template #default="{ feedbackId }">
      <TTextarea
        v-if="multiline"
        :model-value="draft"
        :placeholder="
          controller.isMixedField(field) ? controller.s.value('mixedValues') : undefined
        "
        :disabled="!capability.enabled"
        :aria-label="controller.fieldLabel(field)"
        :aria-describedby="feedbackId"
        :aria-invalid="!!error"
        :autosize="{ minRows: 3, maxRows: 8 }"
        @change="edit"
        @blur="blur"
        @keydown="keydown"
      />
      <TInput
        v-else
        :model-value="draft"
        :placeholder="
          controller.isMixedField(field) ? controller.s.value('mixedValues') : undefined
        "
        :disabled="!capability.enabled"
        :aria-label="controller.fieldLabel(field)"
        :aria-describedby="feedbackId"
        :aria-invalid="!!error"
        size="small"
        @change="edit"
        @blur="blur"
        @enter="enter"
        @keydown="keydown"
      />
    </template>
  </PictureFormatField>
</template>
