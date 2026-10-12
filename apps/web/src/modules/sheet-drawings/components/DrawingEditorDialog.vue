<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import {
  normalizeSheetDrawing,
  type SheetGraphicDrawing,
  type DrawingShape,
} from "@sheetcraft/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import DrawingContent from "./DrawingContent.vue";
import ShapeGallery from "./ShapeGallery.vue";
import { SHAPE_GALLERY, type ShapeGalleryChoice } from "../shape-gallery";
import { isShapeLinePreset, type ShapeLineEnds } from "@sheetcraft/core/shape-line-ends";
import ShapeLineEndsControls from "./ShapeLineEndsControls.vue";
import { getStandardShapeGeometry } from "../shape-geometry";
const props = defineProps<{
  drawing: SheetGraphicDrawing;
  disabled: boolean;
  requestTextBox?: (direction: "horizontal" | "vertical") => boolean;
}>();
const emit = defineEmits<{ confirm: [drawing: SheetGraphicDrawing]; close: [] }>();
const { t, locale } = useAppI18n();
const draft = ref<SheetGraphicDrawing>(normalizeSheetDrawing(props.drawing) as SheetGraphicDrawing);
const galleryError = ref(false);
const selectedChoice = computed(() =>
  SHAPE_GALLERY.flatMap((group) => group.items).find((choice) => {
    if (choice.kind === "preset") return choice.preset === draft.value.shapeGeometry?.preset;
    if (choice.kind !== "line" || choice.preset !== draft.value.shapeGeometry?.preset) return false;
    return (
      (draft.value.shapeLineEnds?.begin?.kind ?? "none") === choice.beginArrow &&
      (draft.value.shapeLineEnds?.end?.kind ?? "none") === choice.endArrow
    );
  }),
);
const validGeometry = computed(
  () =>
    draft.value.kind !== "shape" ||
    !draft.value.shapeGeometry ||
    !!getStandardShapeGeometry(draft.value.shapeGeometry, draft.value.width, draft.value.height),
);
function chooseShape(choice: ShapeGalleryChoice): void {
  if (props.disabled || choice.kind === "drawingTool") return;
  galleryError.value = false;
  if (choice.kind === "textBox") {
    galleryError.value = props.requestTextBox?.(choice.direction) !== true;
    return;
  }
  const next = { ...draft.value };
  next.shapeGeometry =
    choice.preset === next.shapeGeometry?.preset ? next.shapeGeometry : { preset: choice.preset };
  delete next.shapeLineEnds;
  if (choice.kind === "line") {
    if (choice.beginArrow !== "none" || choice.endArrow !== "none")
      next.shapeLineEnds = {
        ...(choice.beginArrow !== "none" ? { begin: { kind: choice.beginArrow } } : {}),
        ...(choice.endArrow !== "none" ? { end: { kind: choice.endArrow } } : {}),
      };
  }
  draft.value = next;
}
const lineGeometry = computed(
  () => !!draft.value.shapeGeometry && isShapeLinePreset(draft.value.shapeGeometry.preset),
);
const lineEndsHandler = computed(() => {
  const sourceGeometry = draft.value.shapeGeometry;
  return (ends: ShapeLineEnds | undefined): boolean => {
    if (props.disabled || !lineGeometry.value || draft.value.shapeGeometry !== sourceGeometry)
      return false;
    const next = { ...draft.value };
    if (ends) next.shapeLineEnds = ends;
    else delete next.shapeLineEnds;
    draft.value = next;
    return true;
  };
});
const previewScale = computed(() => Math.min(1, 400 / draft.value.width, 160 / draft.value.height));
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
    :width="drawing.kind === 'shape' ? '860px' : '660px'"
    :style="{ maxWidth: 'calc(100vw - 32px)' }"
    :close-on-overlay-click="false"
    :confirm-btn="{ content: t('picture.confirm'), disabled: disabled || !validGeometry }"
    :cancel-btn="t('picture.cancel')"
    @confirm="!disabled && validGeometry && emit('confirm', draft)"
    @close="emit('close')"
  >
    <div class="drawing-editor" :class="{ 'has-shape-gallery': drawing.kind === 'shape' }">
      <div v-if="drawing.kind === 'shape'" class="drawing-editor__gallery">
        <ShapeGallery
          :selected="selectedChoice"
          :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
          :disabled="disabled"
          @choose="chooseShape"
        />
        <p v-if="!draft.shapeGeometry" class="drawing-editor__hint">
          {{ t("drawing.legacyGeometry") }}
        </p>
        <p v-if="galleryError" class="drawing-editor__hint" role="alert">
          {{ t("drawing.changeRejected") }}
        </p>
      </div>
      <div class="drawing-editor__fields">
        <label>{{ t("drawing.name") }}<Input v-model="draft.name" :maxlength="200" /></label>
        <div
          v-if="drawing.kind === 'icon'"
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
        <label v-if="!lineGeometry"
          >{{ t(drawing.kind === "equation" ? "drawing.equationSource" : "drawing.text")
          }}<Textarea
            v-model="draft.text"
            :maxlength="100000"
            :autosize="{ minRows: 2, maxRows: 5 }"
        /></label>
        <p v-if="drawing.kind === 'equation'" class="drawing-editor__hint">
          {{ t("drawing.equationHint") }}
        </p>
        <div
          v-if="drawing.kind !== 'wordArt' && drawing.kind !== 'equation'"
          class="drawing-editor__row"
        >
          <label v-if="!lineGeometry"
            >{{ t("drawing.fill")
            }}<input
              type="color"
              :value="draft.fill === 'transparent' ? '#ffffff' : draft.fill"
              @input="draft.fill = ($event.target as HTMLInputElement).value"
          /></label>
          <Checkbox
            v-if="!lineGeometry"
            :checked="draft.fill === 'transparent'"
            @change="draft.fill = $event ? 'transparent' : '#ffffff'"
            >{{ t("drawing.noFill") }}</Checkbox
          >
          <label>{{ t("drawing.stroke") }}<input v-model="draft.stroke" type="color" /></label>
          <label
            >{{ t("drawing.strokeWidth")
            }}<InputNumber
              class="drawing-editor__number"
              v-model="draft.strokeWidth"
              :min="0"
              :max="32"
              size="small"
          /></label>
        </div>
        <ShapeLineEndsControls
          v-if="lineGeometry"
          :ends="draft.shapeLineEnds"
          :disabled="disabled"
          :locale="locale === 'zh-CN' ? 'zh-CN' : 'en-US'"
          :handler="lineEndsHandler"
        />
        <div v-if="!lineGeometry" class="drawing-editor__row">
          <label>{{ t("drawing.color") }}<input v-model="draft.color" type="color" /></label>
          <label
            >{{ t("drawing.fontSize")
            }}<InputNumber
              class="drawing-editor__number"
              v-model="draft.fontSize"
              :min="1"
              :max="512"
              size="small"
          /></label>
          <Checkbox v-if="drawing.kind !== 'equation'" v-model="draft.bold">{{
            t("drawing.bold")
          }}</Checkbox
          ><Checkbox v-if="drawing.kind !== 'equation'" v-model="draft.italic">{{
            t("drawing.italic")
          }}</Checkbox>
        </div>
        <div class="drawing-editor__row">
          <label
            >{{ t("drawing.width")
            }}<InputNumber
              class="drawing-editor__number"
              v-model="draft.width"
              :min="lineGeometry ? 1 : 16"
              :max="16384"
              size="small"
          /></label>
          <label
            >{{ t("drawing.height")
            }}<InputNumber
              class="drawing-editor__number"
              v-model="draft.height"
              :min="lineGeometry ? 1 : 16"
              :max="16384"
              size="small"
          /></label>
          <label
            >{{ t("drawing.rotation")
            }}<InputNumber
              class="drawing-editor__number"
              v-model="draft.rotation"
              :min="-360"
              :max="360"
              size="small"
          /></label>
        </div>
        <div class="drawing-editor__preview" :aria-label="t('drawing.preview')">
          <div
            :style="{
              width: `${draft.width * previewScale}px`,
              height: `${draft.height * previewScale}px`,
            }"
          >
            <div
              :style="{
                width: `${draft.width}px`,
                height: `${draft.height}px`,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }"
            >
              <DrawingContent :drawing="draft" />
            </div>
          </div>
        </div>
        <p v-if="!validGeometry" class="drawing-editor__hint" role="alert">
          {{ t("drawing.geometryUnavailable") }}
        </p>
      </div>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
.drawing-editor {
  display: grid;
  gap: 16px;
  &.has-shape-gallery {
    grid-template-columns: minmax(220px, 0.9fr) minmax(300px, 1fr);
  }
  &__fields {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  &__gallery {
    min-width: 0;
  }
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
    .drawing-editor__number {
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
      border: 1px solid var(--sheetcraft-border-default);
      cursor: pointer;
      &[aria-pressed="true"] {
        border-color: var(--sheetcraft-action-primary);
        background: var(--sheetcraft-surface-hover);
      }
    }
  }
  &__preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    background: var(--sheetcraft-surface-default);
    border: 1px solid var(--sheetcraft-border-default);
    overflow: hidden;
  }
  @media (max-width: 760px) {
    &.has-shape-gallery {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  &__hint {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
  }
}
</style>
