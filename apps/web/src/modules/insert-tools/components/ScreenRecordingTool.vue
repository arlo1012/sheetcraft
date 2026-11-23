<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Button } from "tdesign-vue-next/es/button";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import { Form, FormItem } from "tdesign-vue-next/es/form";
import { Circle, Pause, Play, Square } from "lucide-vue-next";
import { MAX_ATTACHMENT_BYTES } from "@sheetcraft/core/sheet-attachments";
import { useAppI18n } from "../../../shared/i18n";
import { downloadBlob } from "../../../shared/files/download";
import { useScreenRecorder } from "../useScreenRecorder";
import ScreenCaptureDialog from "./ScreenCaptureDialog.vue";
const props = defineProps<{ canInsert: boolean }>();
const emit = defineEmits<{ close: []; insert: [file: File]; modal: [visible: boolean] }>();
const { t, locale } = useAppI18n();
const {
  stage,
  regionFrame,
  result,
  previewUrl,
  elapsed,
  error,
  canRecord,
  docked,
  start,
  begin,
  stop,
  togglePause,
  preview,
  reset,
} = useScreenRecorder();
const area = ref("full");
const systemAudio = ref(false),
  microphone = ref(false);
const fileInput = ref<HTMLInputElement>();
const time = computed(() =>
  [Math.floor(elapsed.value / 60), elapsed.value % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":"),
);
watch(docked, (value) => emit("modal", !value), { immediate: true });
function openFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!["video/webm", "video/mp4"].includes(file.type)) {
    error.value = "failed";
    return;
  }
  preview(file);
}
</script>
<template>
  <ScreenCaptureDialog
    v-if="stage === 'region' && regionFrame"
    :file="regionFrame"
    :busy="false"
    recording-region
    @region="begin"
    @close="reset"
  />
  <Teleport v-else-if="docked" to="body">
    <section class="record-dock" role="toolbar" :aria-label="t('drawing.record')">
      <Circle
        :size="14"
        class="record-dock__dot"
        :class="{ 'is-paused': stage === 'paused' }"
        fill="currentColor"
      />
      <span>{{ time }}</span>
      <Button :disabled="stage === 'finishing'" variant="text" @click="togglePause">
        <template #icon
          ><Play v-if="stage === 'paused'" :size="16" /><Pause v-else :size="16"
        /></template>
        {{ t(stage === "paused" ? "drawing.recordResume" : "drawing.recordPause") }}
      </Button>
      <Button :disabled="stage === 'finishing'" theme="danger" variant="text" @click="stop">
        <template #icon><Square :size="14" /></template>{{ t("drawing.recordStop") }}
      </Button>
    </section>
  </Teleport>
  <Dialog
    v-else
    visible
    role="dialog"
    aria-modal="true"
    :header="t('drawing.record')"
    :aria-label="t('drawing.record')"
    placement="center"
    width="min(580px, calc(100vw - 32px))"
    :footer="false"
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <div v-if="stage === 'preview' && result" class="record-tool">
      <video
        class="record-tool__preview"
        :src="previewUrl"
        controls
        playsinline
        :aria-label="result.name"
      />
      <span>{{ result.name }}</span>
      <p v-if="result.size > MAX_ATTACHMENT_BYTES">
        {{ t("drawing.recordTooLarge", { size: MAX_ATTACHMENT_BYTES / 1048576 }) }}
      </p>
      <div class="record-tool__actions">
        <Button variant="text" @click="reset">{{ t("drawing.recordNew") }}</Button>
        <Button
          variant="outline"
          :disabled="!props.canInsert || result.size > MAX_ATTACHMENT_BYTES"
          @click="emit('insert', result)"
          >{{ t("drawing.recordInsert") }}</Button
        >
        <Button theme="primary" @click="downloadBlob(result, result.name)">{{
          t("drawing.recordDownload")
        }}</Button>
      </div>
    </div>
    <div v-else class="record-tool">
      <Form
        class="sheetcraft-form-grid"
        label-align="left"
        :label-width="locale === 'zh-CN' ? 76 : 112"
        :prevent-submit-default="true"
      >
        <FormItem :label="t('drawing.recordMode')">
          <Select
            v-model="area"
            :disabled="stage === 'sharing'"
            :options="[
              { value: 'full', label: t('drawing.recordFull') },
              { value: 'region', label: t('drawing.recordRegionMode') },
            ]"
          />
        </FormItem>
        <FormItem :label="t('drawing.recordSound')">
          <div class="record-tool__sound">
            <Checkbox v-model="systemAudio" :disabled="stage === 'sharing'">{{
              t("drawing.recordSystem")
            }}</Checkbox>
            <Checkbox v-model="microphone" :disabled="stage === 'sharing'">{{
              t("drawing.recordMicrophone")
            }}</Checkbox>
          </div>
        </FormItem>
      </Form>
      <p v-if="error" role="alert">
        {{ t(error === "denied" ? "drawing.recordDenied" : "drawing.recordFailed") }}
      </p>
      <p v-else-if="!canRecord">{{ t("drawing.recordUnsupported") }}</p>
      <div class="record-tool__actions">
        <Button variant="text" :disabled="stage === 'sharing'" @click="fileInput?.click()">{{
          t("drawing.recordOpen")
        }}</Button>
        <input
          ref="fileInput"
          type="file"
          hidden
          accept="video/webm,video/mp4"
          @change="openFile"
        />
        <Button
          theme="primary"
          :disabled="!canRecord || stage === 'sharing'"
          :loading="stage === 'sharing'"
          @click="start(area === 'region', systemAudio, microphone)"
          >{{ t("drawing.recordStart") }}</Button
        >
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.record-tool {
  display: grid;
  gap: 12px;
  p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__actions,
  &__sound {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  &__actions {
    justify-content: flex-end;
  }
  &__preview {
    width: 100%;
    max-height: 50dvh;
    background: #171717;
  }
}
.record-dock {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: var(--sheetcraft-layer-menu);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--sheetcraft-border-floating);
  border-radius: var(--sheetcraft-radius-floating-compact);
  background: var(--sheetcraft-surface-panel);
  box-shadow: var(--sheetcraft-shadow-floating);
  font-variant-numeric: tabular-nums;
  &__dot {
    color: var(--sheetcraft-status-error);
  }
  &__dot.is-paused {
    color: var(--sheetcraft-text-muted);
  }
}
</style>
