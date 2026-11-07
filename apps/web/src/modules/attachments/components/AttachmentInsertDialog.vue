<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { RadioGroup, Radio } from "tdesign-vue-next/es/radio";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { FileText, Paperclip } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  display: "icon" | "document";
  fileName?: string;
  busy: boolean;
  error: boolean;
  fileDisabled?: boolean;
  cloudDisabled?: boolean;
}>();
const emit = defineEmits<{
  chooseFile: [];
  chooseCloud: [];
  confirm: [display: "icon" | "document"];
  close: [];
}>();
const { t, locale } = useAppI18n();
const asIcon = ref(props.display === "icon");
const documentEntry = props.display === "document";
const method = ref<"file" | "cloud">(documentEntry && props.fileDisabled ? "cloud" : "file");
const title = computed(() =>
  t(documentEntry ? "attachment.documentMethodTitle" : "attachment.insertObject"),
);
const confirmDisabled = computed(
  () =>
    props.busy ||
    (method.value === "cloud" ? !!props.cloudDisabled : !props.fileName || !!props.fileDisabled),
);
watch(
  () => [props.fileDisabled, props.cloudDisabled],
  () => {
    if (!documentEntry) return;
    if (props.fileDisabled && !props.cloudDisabled) method.value = "cloud";
    if (props.cloudDisabled && !props.fileDisabled) method.value = "file";
  },
);
function confirm() {
  if (confirmDisabled.value) return;
  if (method.value === "cloud") emit("chooseCloud");
  else emit("confirm", asIcon.value ? "icon" : "document");
}
</script>

<template>
  <Dialog
    :visible="true"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :header="title"
    width="min(520px, calc(100vw - 32px))"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: confirmDisabled, loading: busy }"
    :cancel-btn="t('picture.cancel')"
    @confirm="confirm"
    @close="emit('close')"
  >
    <div class="attachment-insert">
      <Form
        label-align="right"
        :label-width="locale === 'zh-CN' ? 88 : 112"
        :prevent-submit-default="true"
      >
        <FormItem v-if="documentEntry" :label="t('attachment.insertMethod')">
          <RadioGroup v-model="method" :disabled="busy" :aria-label="t('attachment.insertMethod')">
            <Radio value="cloud" data-attachment-mode="cloud" :disabled="cloudDisabled">{{
              t("hyperlinks.cloud")
            }}</Radio>
            <Radio value="file" data-attachment-mode="file" :disabled="fileDisabled">{{
              t("attachment.fileAttachment")
            }}</Radio>
          </RadioGroup>
        </FormItem>
        <FormItem v-if="method === 'file'" :label="t('attachment.file')"
          ><div class="attachment-insert__file">
            <span>{{ fileName || t("attachment.noFile") }}</span>
            <Button theme="default" variant="base" :disabled="busy" @click="emit('chooseFile')">{{
              t("attachment.browse")
            }}</Button>
          </div></FormItem
        >
        <FormItem v-if="method === 'file'"
          ><Checkbox v-model="asIcon" :disabled="busy">{{
            t("attachment.displayAsIcon")
          }}</Checkbox></FormItem
        >
      </Form>
      <div
        v-if="method === 'file'"
        class="attachment-insert__preview"
        :aria-label="t('attachment.preview')"
      >
        <Paperclip v-if="asIcon" :size="32" aria-hidden="true" />
        <FileText v-else :size="48" aria-hidden="true" />
        <span>{{ fileName || t(asIcon ? "attachment.title" : "attachment.document") }}</span>
      </div>
      <p>{{ t(method === "cloud" ? "attachment.shareLinkHint" : "attachment.insertHint") }}</p>
      <p v-if="error && method === 'file'" class="attachment-insert__error" role="alert">
        {{ t("attachment.failed") }}
      </p>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.attachment-insert {
  display: grid;
  gap: 16px;
  &__file {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 12px;
  }
  &__file > span {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  &__preview {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 24px;
    border: 1px solid var(--sheetcraft-border-subtle);
    color: var(--sheetcraft-text-secondary);
    overflow-wrap: anywhere;
  }
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  p.attachment-insert__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
