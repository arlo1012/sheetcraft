<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { AutoComplete as TAutoComplete } from "tdesign-vue-next/es/auto-complete";
import { Form as TForm, FormItem as TFormItem } from "tdesign-vue-next/es/form";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Slider as TSlider } from "tdesign-vue-next/es/slider";
import type { SheetWatermark } from "@sheetcraft/core/page-decoration";
import { DEFAULT_SHEET_WATERMARK } from "@sheetcraft/core/page-decoration";
import {
  CELL_FONT_FAMILY_PRESETS,
  CELL_FONT_SIZE_PRESETS,
} from "../../../shared/cell-text/font-catalog";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { useAppI18n } from "../../../shared/i18n";
import { paintWatermarkInRect } from "../page-decoration-painter";

const previewAssetId = "watermark-preview";
const props = defineProps<{
  visible: boolean;
  watermark?: SheetWatermark;
  imageAssetUrls?: ReadonlyMap<string, string>;
  busy?: boolean;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  save: [watermark: SheetWatermark, scope: "sheet" | "workbook", imageFile?: File];
}>();
const { locale, t } = useAppI18n();
const draft = ref<SheetWatermark>({ ...DEFAULT_SHEET_WATERMARK });
const textEnabled = ref(true);
const imageEnabled = ref(false);
const scope = ref<"sheet" | "workbook">("workbook");
const imageInput = ref<HTMLInputElement>();
const imageFile = ref<File>();
const imageDragOver = ref(false);
const imageDraft = ref({ assetId: "", scale: null as number | null, washout: true, angle: 0 });
const previewCanvas = ref<HTMLCanvasElement>();
const localImageUrl = ref<string>();
const previewImage = ref<HTMLImageElement>();
const labelWidth = computed(() => (locale.value === "zh-CN" ? 72 : 104));
const fontOptions = computed(() =>
  CELL_FONT_FAMILY_PRESETS.map((value) => ({ label: value, value })),
);
const fontSizeOptions = CELL_FONT_SIZE_PRESETS.map((value) => ({ label: String(value), value }));
const opacityPercent = computed({
  get: () => 100 - Math.round(draft.value.opacity * 100),
  set: (value: number) => {
    draft.value.opacity = Math.max(0, Math.min(1, 1 - value / 100));
  },
});
const imageScale = computed<"auto" | number>({
  get: () => imageDraft.value.scale ?? "auto",
  set: (value) => {
    imageDraft.value.scale = value === "auto" ? null : value;
  },
});
const currentImageUrl = computed(
  () =>
    localImageUrl.value ??
    (draft.value.image ? props.imageAssetUrls?.get(draft.value.image.assetId) : undefined),
);
const canSave = computed(
  () =>
    (textEnabled.value && draft.value.text.trim().length > 0) ||
    (imageEnabled.value && !!draft.value.image),
);

function copyWatermark(watermark?: SheetWatermark): SheetWatermark {
  return {
    ...DEFAULT_SHEET_WATERMARK,
    ...watermark,
    ...(watermark?.image ? { image: { ...watermark.image } } : {}),
  };
}
function clearLocalImage(): void {
  if (localImageUrl.value) URL.revokeObjectURL(localImageUrl.value);
  localImageUrl.value = undefined;
  imageFile.value = undefined;
}
function loadPreviewImage(url: string | undefined): void {
  previewImage.value = undefined;
  if (!url) return;
  const image = new Image();
  image.onload = () => {
    if (currentImageUrl.value !== url) return;
    previewImage.value = image;
    drawPreview();
  };
  image.src = url;
}
function drawPreview(): void {
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.clearRect(0, 0, width, height);
  const watermark: SheetWatermark = {
    ...draft.value,
    text: textEnabled.value ? draft.value.text : "",
    ...(imageEnabled.value && draft.value.image
      ? { image: { ...draft.value.image, ...imageDraft.value } }
      : { image: undefined }),
  };
  paintWatermarkInRect(
    context,
    watermark,
    { x: 0, y: 0, width, height },
    {
      fontScale: width / 794,
      image: previewImage.value,
    },
  );
}
function chooseImage(): void {
  if (!imageEnabled.value || props.busy) return;
  imageInput.value?.click();
}
function imageChanged(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) selectImageFile(file);
}
function imageDraggedOver(event: DragEvent): void {
  imageDragOver.value = imageEnabled.value && !props.busy;
  if (event.dataTransfer) event.dataTransfer.dropEffect = imageDragOver.value ? "copy" : "none";
}
function imageDropped(event: DragEvent): void {
  imageDragOver.value = false;
  const file = Array.from(event.dataTransfer?.files ?? []).find((file) =>
    file.type.startsWith("image/"),
  );
  if (file) selectImageFile(file);
}
function selectImageFile(file: File): void {
  if (!imageEnabled.value || props.busy || !file.type.startsWith("image/")) return;
  clearLocalImage();
  imageFile.value = file;
  localImageUrl.value = URL.createObjectURL(file);
  imageDraft.value = { assetId: previewAssetId, scale: null, washout: true, angle: 0 };
  draft.value.image = { ...imageDraft.value };
  loadPreviewImage(localImageUrl.value);
}
function close(): void {
  emit("update:visible", false);
}
function save(): void {
  if (!canSave.value || props.busy) return;
  emit(
    "save",
    {
      ...draft.value,
      text: textEnabled.value ? draft.value.text.trim() : "",
      ...(imageEnabled.value && draft.value.image
        ? { image: { ...draft.value.image, ...imageDraft.value } }
        : { image: undefined }),
    },
    scope.value,
    imageEnabled.value ? imageFile.value : undefined,
  );
}

watch(
  () => [props.visible, props.watermark] as const,
  ([visible, watermark]) => {
    imageDragOver.value = false;
    if (!visible) return;
    clearLocalImage();
    draft.value = copyWatermark(watermark);
    imageDraft.value = draft.value.image
      ? { ...draft.value.image }
      : { assetId: "", scale: null, washout: true, angle: 0 };
    textEnabled.value = watermark ? !!draft.value.text : true;
    imageEnabled.value = !!draft.value.image;
    scope.value = "workbook";
    loadPreviewImage(currentImageUrl.value);
    void nextTick(drawPreview);
  },
  { immediate: true },
);
watch(currentImageUrl, (url) => loadPreviewImage(url));
watch([draft, imageDraft, textEnabled, imageEnabled], () => void nextTick(drawPreview), {
  deep: true,
});
watch(previewCanvas, (canvas) => {
  if (canvas) void nextTick(drawPreview);
});
onBeforeUnmount(clearLocalImage);
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('pageDecoration.customWatermark')"
    :confirm-btn="{
      content: t('pageDecoration.confirm'),
      disabled: !canSave || busy,
      loading: busy,
    }"
    :cancel-btn="t('pageDecoration.cancel')"
    width="900px"
    placement="center"
    @confirm="save"
    @close="close"
    @opened="drawPreview"
  >
    <div class="watermark-dialog">
      <section class="watermark-dialog__settings">
        <input ref="imageInput" type="file" accept="image/*" hidden @change="imageChanged" />
        <TCheckbox v-model="imageEnabled" :disabled="busy">{{
          t("pageDecoration.imageWatermark")
        }}</TCheckbox>
        <div class="watermark-dialog__image-controls" :class="{ 'is-disabled': !imageEnabled }">
          <button
            class="watermark-dialog__choose-image"
            :class="{ 'is-drag-over': imageDragOver }"
            type="button"
            :disabled="!imageEnabled || busy"
            @click="chooseImage"
            @dragover.prevent.stop="imageDraggedOver"
            @dragleave="imageDragOver = false"
            @drop.prevent.stop="imageDropped"
          >
            {{ draft.image ? t("pageDecoration.changeImage") : t("pageDecoration.chooseImage") }}
          </button>
          <TForm
            :data="imageDraft"
            label-align="right"
            :label-width="labelWidth"
            class="watermark-dialog__form"
          >
            <TFormItem :label="t('pageDecoration.scale')">
              <TSelect
                v-model="imageScale"
                :disabled="!imageEnabled || !draft.image || busy"
                :options="[
                  { label: t('pageDecoration.auto'), value: 'auto' },
                  { label: '50%', value: 50 },
                  { label: '100%', value: 100 },
                  { label: '150%', value: 150 },
                  { label: '200%', value: 200 },
                ]"
              />
            </TFormItem>
            <TFormItem :label="t('pageDecoration.layout')">
              <div class="watermark-dialog__inline-options">
                <TSelect
                  class="watermark-dialog__image-layout"
                  v-model="imageDraft.angle"
                  :disabled="!imageEnabled || !draft.image || busy"
                  :options="[
                    { label: t('pageDecoration.horizontal'), value: 0 },
                    { label: t('pageDecoration.diagonal'), value: -45 },
                  ]"
                />
                <TCheckbox
                  v-model="imageDraft.washout"
                  :disabled="!imageEnabled || !draft.image || busy"
                  >{{ t("pageDecoration.washout") }}</TCheckbox
                >
              </div>
            </TFormItem>
          </TForm>
        </div>

        <TCheckbox v-model="textEnabled" :disabled="busy">{{
          t("pageDecoration.textWatermark")
        }}</TCheckbox>
        <TForm
          :data="draft"
          label-align="right"
          :label-width="labelWidth"
          class="watermark-dialog__form"
          :class="{ 'is-disabled': !textEnabled }"
        >
          <TFormItem :label="t('pageDecoration.watermarkText')">
            <TAutoComplete
              v-model="draft.text"
              :disabled="!textEnabled || busy"
              :options="[
                {
                  label: t('pageDecoration.confidential'),
                  value: t('pageDecoration.confidential'),
                },
                { label: t('pageDecoration.topSecret'), value: t('pageDecoration.topSecret') },
                { label: t('pageDecoration.noCopy'), value: t('pageDecoration.noCopy') },
                { label: t('pageDecoration.internalUse'), value: t('pageDecoration.internalUse') },
              ]"
              :input-props="{ maxlength: 256 }"
            />
          </TFormItem>
          <TFormItem :label="t('pageDecoration.fontFamily')">
            <TAutoComplete
              v-model="draft.fontFamily"
              :disabled="!textEnabled || busy"
              :options="fontOptions"
              filterable
            />
          </TFormItem>
          <TFormItem :label="t('pageDecoration.fontSize')">
            <TSelect
              v-model="draft.fontSize"
              :disabled="!textEnabled || busy"
              :options="fontSizeOptions"
            />
          </TFormItem>
          <TFormItem :label="t('pageDecoration.color')">
            <ColorPaletteSelect
              :model-value="draft.color"
              :label="t('pageDecoration.color')"
              default-color="#c0c0c0"
              :disabled="!textEnabled || busy"
              @select="draft.color = $event ?? '#c0c0c0'"
            />
          </TFormItem>
          <TFormItem :label="t('pageDecoration.layout')">
            <TSelect
              v-model="draft.angle"
              :disabled="!textEnabled || busy"
              :options="[
                { label: t('pageDecoration.horizontal'), value: 0 },
                { label: t('pageDecoration.diagonal'), value: -45 },
              ]"
            />
          </TFormItem>
          <TFormItem :label="t('pageDecoration.opacity')">
            <div class="watermark-dialog__opacity">
              <TSlider
                v-model="opacityPercent"
                :disabled="!textEnabled || busy"
                :min="0"
                :max="100"
              />
              <TInputNumber
                v-model="opacityPercent"
                theme="column"
                class="sheetcraft-input-number--persistent-controls"
                :disabled="!textEnabled || busy"
                :min="0"
                :max="100"
                :decimal-places="0"
                suffix="%"
              />
            </div>
          </TFormItem>
        </TForm>
        <TForm :label-width="labelWidth" label-align="right" class="watermark-dialog__scope">
          <TFormItem :label="t('pageDecoration.applyTo')">
            <TSelect
              v-model="scope"
              :disabled="busy"
              :options="[
                { label: t('pageDecoration.currentSheet'), value: 'sheet' },
                { label: t('pageDecoration.workbook'), value: 'workbook' },
              ]"
            />
          </TFormItem>
        </TForm>
      </section>
      <section class="watermark-dialog__preview">
        <h3>{{ t("pageDecoration.preview") }}</h3>
        <div class="watermark-dialog__paper"><canvas ref="previewCanvas" /></div>
      </section>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.watermark-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(240px, 0.85fr);
  gap: 36px;
  min-height: 420px;
  &__settings {
    min-width: 0;
  }
  &__image-controls {
    margin: 10px 0 18px;
    padding: 12px 0 0;
    border-top: 1px dashed var(--sheetcraft-border-control);
  }
  &__choose-image {
    width: 100%;
    min-height: 42px;
    border: 1px dashed var(--sheetcraft-border-control);
    border-radius: 6px;
    background: transparent;
    color: var(--sheetcraft-text-secondary);
    cursor: pointer;
  }
  &__choose-image:disabled {
    cursor: default;
  }
  &__choose-image.is-drag-over {
    border-color: var(--sheetcraft-action-primary);
    background: var(--sheetcraft-action-primary-subtle);
    color: var(--sheetcraft-action-primary);
  }
  &__form {
    margin-top: 10px;
  }
  &__scope {
    margin-top: 18px;
    padding-top: 12px;
    border-top: 1px solid var(--sheetcraft-border-control);
  }
  &__opacity {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 90px;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  &__inline-options {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
  }
  &__image-layout {
    flex: 1;
    min-width: 0;
  }
  &__preview h3 {
    margin: 0 0 16px;
    font-size: 14px;
    color: var(--sheetcraft-text-primary);
  }
  &__paper {
    aspect-ratio: 210 / 297;
    overflow: hidden;
    border: 1px solid var(--sheetcraft-border-control);
    border-radius: 6px;
    background: white;
    box-shadow: 0 2px 6px rgb(0 0 0 / 4%);
  }
  &__paper canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  .is-disabled {
    opacity: 0.5;
  }
}
</style>
