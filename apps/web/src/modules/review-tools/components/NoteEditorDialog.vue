<script setup lang="ts">
import { ref, useId, watch } from "vue";
import { Dialog as TDialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Textarea as TTextarea } from "tdesign-vue-next/es/textarea";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    address: string;
    text: string;
    author: string;
    error?: string;
    readOnly?: boolean;
  }>(),
  { error: "", readOnly: false },
);
const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [payload: { text: string; author: string }];
  close: [];
}>();
const { t } = useAppI18n();
const id = useId();
const draftText = ref("");
const draftAuthor = ref("");
const textAreaRef = ref<{ focus?: () => void } | null>(null);

function resetDraft(): void {
  draftText.value = props.text;
  draftAuthor.value = props.author;
}
function close(): void {
  emit("update:visible", false);
  emit("close");
}
function save(): void {
  if (props.readOnly) return;
  emit("save", { text: draftText.value, author: draftAuthor.value.trim() });
}
function focusTextArea(): void {
  if (!props.readOnly) textAreaRef.value?.focus?.();
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) resetDraft();
  },
  { immediate: true },
);
</script>

<template>
  <TDialog
    :visible="visible"
    :header="t('review.noteEditorTitle')"
    :confirm-btn="{ content: t('review.save'), disabled: readOnly }"
    :cancel-btn="t('review.cancel')"
    width="min(560px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @confirm="save"
    @opened="focusTextArea"
    @close="close"
  >
    <div class="note-editor-dialog">
      <div class="note-editor-dialog__address">
        <span>{{ t("review.address") }}</span>
        <strong>{{ address }}</strong>
      </div>
      <label :for="`${id}-author`">{{ t("review.author") }}</label>
      <TInput
        v-native-control="{
          attributes: { id: `${id}-author`, 'aria-label': t('review.author') },
        }"
        v-model="draftAuthor"
        :disabled="readOnly"
        autocomplete="name"
      />
      <label :for="`${id}-text`">{{ t("review.noteText") }}</label>
      <TTextarea
        ref="textAreaRef"
        v-native-control="{
          attributes: { id: `${id}-text`, 'aria-label': t('review.noteText') },
        }"
        v-model="draftText"
        :disabled="readOnly"
        autofocus
        :autosize="{ minRows: 6, maxRows: 14 }"
      />
      <p v-if="error" class="note-editor-dialog__error" role="alert">{{ error }}</p>
    </div>
  </TDialog>
</template>

<style scoped lang="scss">
.note-editor-dialog {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 12px;
  align-items: center;

  &__address {
    display: contents;
  }

  textarea {
    min-height: 132px;
  }

  &__error {
    grid-column: 2;
    margin: 0;
    color: var(--idea-status-error);
  }
}
</style>
