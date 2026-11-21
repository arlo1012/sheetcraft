<script setup lang="ts">
import { computed, ref, useId, type ComponentPublicInstance } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import type {
  PictureFormatChoiceField,
  PictureFormatOption,
} from "../../picture-format-pane-model";
import type { PictureFormatPaneController } from "./usePictureFormatPane";
import PictureFormatField from "./PictureFormatField.vue";
const props = defineProps<{
  controller: PictureFormatPaneController;
  field: PictureFormatChoiceField;
  options?: readonly PictureFormatOption[];
}>();
const root = ref<InstanceType<typeof PictureFormatField>>();
const choices = computed(() => [...(props.options ?? props.controller.options(props.field) ?? [])]);
const binding = computed(() => props.controller.choice(props.field, choices.value.length > 0));
const inputId = `picture-format-choice-${useId()}`;
const popup = useNativePopupOwnership({
  owner: () =>
    props.controller.snapshot.value && props.controller.numericLease.value.ownerKey
      ? `${props.controller.numericLease.value.ownerKey}:${props.field}`
      : undefined,
  disabled: () => binding.value.disabled,
  root: () => root.value?.$el,
  focus: {
    owner: () =>
      props.controller.snapshot.value
        ? (props.controller.numericLease.value.ownerKey ?? undefined)
        : undefined,
    input: () =>
      (root.value?.$el as HTMLElement | undefined)?.querySelector<HTMLInputElement>(
        `input[id="${inputId}"]`,
      ),
  },
});
function setPopupHost(element: Element | ComponentPublicInstance | null): void {
  popup.host.value = element instanceof HTMLElement ? element : undefined;
}
const nativeControl = computed(() => ({
  attributes: {
    id: inputId,
    name: `picture-format-${props.field}`,
    role: "combobox",
    "aria-label": props.controller.t(props.field),
    "aria-expanded": String(popup.visible.value),
    "data-format-pane-history-control": "readonly-combobox",
  },
}));
function select(value: unknown): void {
  popup.acceptChoice(() => {
    binding.value.select(value);
    return true;
  });
}
</script>
<template>
  <PictureFormatField
    ref="root"
    :label="controller.t(field)"
    :reason="binding.reason"
    :error="binding.error"
  >
    <template #default="{ feedbackId }">
      <Teleport to="body"
        ><div :ref="setPopupHost" :data-picture-format-choice-popup="field"
      /></Teleport>
      <TSelect
        v-native-control="nativeControl"
        :popup-visible="popup.visible.value"
        :popup-props="popup.popupProps"
        @popup-visible-change="popup.onVisibleChange.value"
        :model-value="binding.value"
        :options="choices"
        :disabled="binding.disabled"
        size="small"
        :aria-label="controller.t(field)"
        :aria-describedby="feedbackId"
        :aria-invalid="!!binding.error"
        :data-picture-format-field="field"
        @change="select"
      />
    </template>
  </PictureFormatField>
</template>
