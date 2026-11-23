<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
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
  CELL_FONT_SIZE_PRESETS,
  filterFontFamilyOption,
} from "../../../shared/cell-text/font-catalog";
import { useFontCatalog } from "../../../shared/cell-text/useFontCatalog";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
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
const dialogId = `watermark-${useId()}`;
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
const { fontOptions, fontResourceRevision } = useFontCatalog(() =>
  draft.value.fontFamily ? [draft.value.fontFamily] : [],
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
watch(
  [draft, imageDraft, textEnabled, imageEnabled, fontResourceRevision],
  () => void nextTick(drawPreview),
  {
    deep: true,
  },
);
watch(previewCanvas, (canvas) => {
  if (canvas) void nextTick(drawPreview);
});
onBeforeUnmount(clearLocalImage);
</script>

<template>
  <Dialog
    v-if="visible"
    :visible="visible"
    :header="t('pageDecoration.customWatermark')"
    :aria-label="t('pageDecoration.customWatermark')"
    role="dialog"
    aria-modal="true"
    :confirm-btn="{
      content: t('pageDecoration.confirm'),
      disabled: !canSave || busy,
      loading: busy,
    }"
    :cancel-btn="t('pageDecoration.cancel')"
    width="min(740px, calc(100vw - 32px))"
    placement="center"
    @confirm="save"
    @close="close"
    @opened="drawPreview"
  >
    <div class="watermark-dialog">
      <section class="watermark-dialog__settings">
        <input
          ref="imageInput"
          name="watermark-image-file"
          type="file"
          accept="image/*"
          hidden
          :aria-label="t('pageDecoration.imageWatermark')"
          @change="imageChanged"
        />
        <div class="watermark-dialog__card">
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
              label-align="left"
              :label-width="labelWidth"
              class="watermark-dialog__form sheetcraft-form-grid"
            >
              <TFormItem :label="t('pageDecoration.scale')">
                <TSelect
                  v-model="imageScale"
                  v-native-control="{
                    attributes: {
                      id: `${dialogId}-image-scale`,
                      name: `${dialogId}-image-scale`,
                      'aria-label': t('pageDecoration.scale'),
                    },
                  }"
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
                    v-native-control="{
                      attributes: {
                        id: `${dialogId}-image-layout`,
                        name: `${dialogId}-image-layout`,
                        'aria-label':
                          t('pageDecoration.imageWatermark') + ': ' + t('pageDecoration.layout'),
                      },
                    }"
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
        </div>

        <div class="watermark-dialog__card">
          <TCheckbox v-model="textEnabled" :disabled="busy">{{
            t("pageDecoration.textWatermark")
          }}</TCheckbox>
          <TForm
            :data="draft"
            label-align="left"
            :label-width="labelWidth"
            class="watermark-dialog__form sheetcraft-form-grid"
            :class="{ 'is-disabled': !textEnabled }"
          >
            <TFormItem :label="t('pageDecoration.watermarkText')">
              <TAutoComplete
                v-model="draft.text"
                v-native-control="{
                  attributes: {
                    id: `${dialogId}-text`,
                    name: `${dialogId}-text`,
                    'aria-label': t('pageDecoration.watermarkText'),
                  },
                }"
                :disabled="!textEnabled || busy"
                :options="[
                  {
                    label: t('pageDecoration.confidential'),
                    value: t('pageDecoration.confidential'),
                  },
                  { label: t('pageDecoration.topSecret'), value: t('pageDecoration.topSecret') },
                  { label: t('pageDecoration.noCopy'), value: t('pageDecoration.noCopy') },
                  {
                    label: t('pageDecoration.internalUse'),
                    value: t('pageDecoration.internalUse'),
                  },
                ]"
                :input-props="{ maxlength: 256 }"
              />
            </TFormItem>
            <TFormItem :label="t('pageDecoration.fontFamily')">
              <TAutoComplete
                v-model="draft.fontFamily"
                v-native-control="{
                  attributes: {
                    id: `${dialogId}-font-family`,
                    name: `${dialogId}-font-family`,
                    'aria-label': t('pageDecoration.fontFamily'),
                  },
                }"
                :disabled="!textEnabled || busy"
                :options="fontOptions"
                filterable
                :filter="filterFontFamilyOption"
              />
            </TFormItem>
            <TFormItem :label="t('pageDecoration.fontSize')">
              <TSelect
                v-model="draft.fontSize"
                v-native-control="{
                  attributes: {
                    id: `${dialogId}-font-size`,
                    name: `${dialogId}-font-size`,
                    'aria-label': t('pageDecoration.fontSize'),
                  },
                }"
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
                v-native-control="{
                  attributes: {
                    id: `${dialogId}-text-layout`,
                    name: `${dialogId}-text-layout`,
                    'aria-label':
                      t('pageDecoration.textWatermark') + ': ' + t('pageDecoration.layout'),
                  },
                }"
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
                  v-native-control="{
                    attributes: {
                      id: `${dialogId}-opacity`,
                      name: `${dialogId}-opacity`,
                      'aria-label': t('pageDecoration.opacity'),
                    },
                  }"
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
        </div>

        <div class="watermark-dialog__card">
          <TForm
            :label-width="labelWidth"
            label-align="left"
            class="watermark-dialog__scope sheetcraft-form-grid"
          >
            <TFormItem :label="t('pageDecoration.applyTo')">
              <TSelect
                v-model="scope"
                v-native-control="{
                  attributes: {
                    id: `${dialogId}-scope`,
                    name: `${dialogId}-scope`,
                    'aria-label': t('pageDecoration.applyTo'),
                  },
                }"
                :disabled="busy"
                :options="[
                  { label: t('pageDecoration.currentSheet'), value: 'sheet' },
                  { label: t('pageDecoration.workbook'), value: 'workbook' },
                ]"
              />
            </TFormItem>
          </TForm>
        </div>
      </section>
      <section class="watermark-dialog__preview" :aria-label="t('pageDecoration.preview')">
        <div class="watermark-dialog__paper"><canvas ref="previewCanvas" /></div>
      </section>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.watermark-dialog {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(220px, 0.95fr);
  gap: 16px;
  align-items: start;
  &__settings {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  &__card {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 10px 12px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__image-controls {
    display: grid;
    gap: 8px;
  }
  &__choose-image {
    width: 100%;
    min-height: 36px;
    border: 1px dashed var(--sheetcraft-border-control);
    border-radius: var(--sheetcraft-radius-floating-item);
    background: var(--sheetcraft-surface-panel);
    color: var(--sheetcraft-text-secondary);
    font: inherit;
    cursor: pointer;
    transition:
      border-color 0.12s ease,
      background-color 0.12s ease,
      color 0.12s ease;

    &:hover:not(:disabled) {
      border-color: var(--sheetcraft-action-primary);
      color: var(--sheetcraft-text-primary);
    }
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
    display: grid;
    gap: 8px;
  }
  &__scope {
    display: grid;
  }
  &__opacity {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 84px;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  &__inline-options {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
  }
  &__image-layout {
    flex: 1;
    min-width: 0;
  }
  &__preview {
    display: grid;
    place-items: center;
    height: 100%;
    padding: 14px;
    border-radius: var(--sheetcraft-radius-dialog-card);
    background: var(--sheetcraft-surface-dialog-card);
  }
  &__paper {
    width: 100%;
    aspect-ratio: 210 / 297;
    overflow: hidden;
    border: 1px solid var(--sheetcraft-border-divider);
    border-radius: var(--sheetcraft-radius-floating-item);
    background: white;
    box-shadow: 0 2px 8px rgb(15 23 42 / 6%);
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
