<script setup lang="ts">
import { ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SheetGraphicDrawing, DrawingShape } from "@idea10/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import DrawingContent from "./DrawingContent.vue";
const props = defineProps<{ drawing: SheetGraphicDrawing; disabled: boolean }>();
const emit = defineEmits<{ confirm: [drawing: SheetGraphicDrawing]; close: [] }>();
const { t } = useAppI18n();
const draft = ref<SheetGraphicDrawing>({ ...props.drawing, anchor: { ...props.drawing.anchor } });
const shapes: DrawingShape[] = [
  "rectangle",
  "roundedRectangle",
  "ellipse",
  "triangle",
  "diamond",
  "arrow",
  "line",
  "star",
  "heart",
];
</script>
<template>
  <Dialog
    :visible="true"
    :header="t(`drawing.${drawing.kind}`)"
    width="660px"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled }"
    :cancel-btn="t('picture.cancel')"
    @confirm="!disabled && emit('confirm', draft)"
    @close="emit('close')"
  >
    <div class="drawing-editor">
      <label>{{ t("drawing.name") }}<Input v-model="draft.name" :maxlength="200" /></label>
      <div
        v-if="drawing.kind === 'shape' || drawing.kind === 'icon'"
        class="drawing-editor__shapes"
        role="group"
        :aria-label="t('drawing.shape')"
      >
        <button
          v-for="shape in shapes"
          :key="shape"
          type="button"
          :aria-label="t(`drawing.${shape}`)"
          :aria-pressed="draft.shape === shape"
          @click="draft.shape = shape"
        >
          <DrawingContent :drawing="{ ...draft, shape, text: '', rotation: 0 }" />
        </button>
      </div>
      <label
        >{{ t(drawing.kind === "equation" ? "drawing.equationSource" : "drawing.text")
        }}<Textarea v-model="draft.text" :maxlength="100000" :autosize="{ minRows: 2, maxRows: 5 }"
      /></label>
      <p v-if="drawing.kind === 'equation'" class="drawing-editor__hint">
        {{ t("drawing.equationHint") }}
      </p>
      <div class="drawing-editor__row">
        <label
          >{{ t("drawing.fill")
          }}<input
            type="color"
            :value="draft.fill === 'transparent' ? '#ffffff' : draft.fill"
            @input="draft.fill = ($event.target as HTMLInputElement).value"
        /></label>
        <Checkbox
          :checked="draft.fill === 'transparent'"
          @change="draft.fill = $event ? 'transparent' : '#ffffff'"
          >{{ t("drawing.noFill") }}</Checkbox
        >
        <label>{{ t("drawing.stroke") }}<input v-model="draft.stroke" type="color" /></label>
        <label
          >{{ t("drawing.strokeWidth")
          }}<InputNumber v-model="draft.strokeWidth" :min="0" :max="32" size="small"
        /></label>
      </div>
      <div class="drawing-editor__row">
        <label>{{ t("drawing.color") }}<input v-model="draft.color" type="color" /></label>
        <label
          >{{ t("drawing.fontSize")
          }}<InputNumber v-model="draft.fontSize" :min="1" :max="512" size="small"
        /></label>
        <Checkbox v-model="draft.bold">{{ t("drawing.bold") }}</Checkbox
        ><Checkbox v-model="draft.italic">{{ t("drawing.italic") }}</Checkbox>
      </div>
      <div class="drawing-editor__row">
        <label
          >{{ t("drawing.width")
          }}<InputNumber v-model="draft.width" :min="16" :max="16384" size="small"
        /></label>
        <label
          >{{ t("drawing.height")
          }}<InputNumber v-model="draft.height" :min="16" :max="16384" size="small"
        /></label>
        <label
          >{{ t("drawing.rotation")
          }}<InputNumber v-model="draft.rotation" :min="-360" :max="360" size="small"
        /></label>
      </div>
      <div class="drawing-editor__preview" :aria-label="t('drawing.preview')">
        <div
          :style="{
            width: `${Math.min(draft.width, 400)}px`,
            height: `${Math.min(draft.height, 160)}px`,
          }"
        >
          <DrawingContent :drawing="draft" />
        </div>
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.drawing-editor {
  display: grid;
  gap: 12px;
  label {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  &__row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    :deep(.t-input-number) {
      width: 90px;
    }
    input[type="color"] {
      width: 32px;
      height: 28px;
      padding: 0;
      border: 0;
    }
  }
  &__shapes {
    display: flex;
    gap: 8px;
    button {
      width: 48px;
      height: 42px;
      padding: 6px;
      background: transparent;
      border: 1px solid var(--idea-border-default);
      cursor: pointer;
      &[aria-pressed="true"] {
        border-color: var(--idea-action-primary);
        background: var(--idea-surface-hover);
      }
    }
  }
  &__preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    background: var(--idea-surface-default);
    border: 1px solid var(--idea-border-default);
    overflow: hidden;
  }
  &__hint {
    margin: 0;
    color: var(--idea-text-secondary);
    font-size: 12px;
  }
}
</style>
