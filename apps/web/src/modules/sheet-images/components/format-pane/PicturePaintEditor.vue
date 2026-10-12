<script setup lang="ts">
import {
  createPictureTextureBlob,
  pictureTextureFromAssetId,
  type PictureTextureId,
} from "../../picture-texture";
import PictureTextureGallery from "./PictureTextureGallery.vue";
import { computed, onUnmounted, ref, watch } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import {
  PICTURE_PATTERN_PRESETS,
  type Choice,
  type PicturePaint,
  type PicturePatternPreset,
  type PictureAnchor,
} from "@sheetcraft/core/picture-detailed-style";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import {
  createPictureGradientPaint,
  createPictureSolidPaint,
  getPictureStretchOffsets,
  editPictureStretchOffset,
} from "../../picture-paint-edit";
import { createPicturePatternSampler } from "../../../../shared/images/picture-paint-pattern";
import { PICTURE_PATTERN_LABELS } from "../../picture-pattern-labels";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintColor from "./PicturePaintColor.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
import PictureGradientEditor from "./PictureGradientEditor.vue";
const props = defineProps<{
  ownerKey: string;
  value?: Choice<PicturePaint>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  sourceAssetId?: string;
  paintRole?: "fill" | "line";
  loadAsset?: (blob: Blob, texture?: PictureTextureId) => Promise<string | undefined>;
  onCommit: (value: Choice<PicturePaint> | undefined) => boolean;
}>();
const paint = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() =>
  props.value === undefined
    ? "inherit"
    : props.value.kind === "none"
      ? "none"
      : ["linear", "radial", "rectangular"].includes(props.value.value.kind)
        ? "gradient"
        : props.value.value.kind,
);
const busy = ref(false),
  sourceError = ref<string>(),
  fileInput = ref<HTMLInputElement>();
let request = 0;
watch(
  () => props.ownerKey,
  () => {
    request++;
    busy.value = false;
    sourceError.value = undefined;
  },
);
onUnmounted(() => {
  request++;
});
const disabled = computed(() => props.disabled || busy.value);
const modes = computed(() => [
  { value: "inherit", label: props.t("paintInherit") },
  { value: "none", label: props.t(props.paintRole === "line" ? "none" : "paintNone") },
  { value: "solid", label: props.t(props.paintRole === "line" ? "solid" : "paintSolid") },
  { value: "gradient", label: props.t(props.paintRole === "line" ? "gradient" : "paintGradient") },
  {
    value: "picture",
    label: props.t(props.paintRole === "line" ? "paintLinePicture" : "paintPicture"),
  },
  {
    value: "pattern",
    label: props.t(props.paintRole === "line" ? "paintLinePattern" : "paintPattern"),
  },
]);
const anchors: readonly { value: PictureAnchor; key: Parameters<PictureFormatTranslate>[0] }[] = [
  { value: "top-left", key: "alignTopLeft" },
  { value: "top", key: "alignTop" },
  { value: "top-right", key: "alignTopRight" },
  { value: "left", key: "alignLeft" },
  { value: "center", key: "alignCenter" },
  { value: "right", key: "alignRight" },
  { value: "bottom-left", key: "alignBottomLeft" },
  { value: "bottom", key: "alignBottom" },
  { value: "bottom-right", key: "alignBottomRight" },
];
const anchorOptions = computed(() =>
  anchors.map(({ value, key }) => ({ value, label: props.t(key) })),
);
const flipOptions = computed(() => [
  { value: "none", label: props.t("paintMirrorNone") },
  { value: "x", label: props.t("paintMirrorX") },
  { value: "y", label: props.t("paintMirrorY") },
  { value: "xy", label: props.t("paintMirrorBoth") },
]);
const owner = computed(() => `${props.ownerKey}:paint:${mode.value}`);
function commit(value: PicturePaint) {
  return !disabled.value && props.onCommit({ kind: "value", value });
}
function picture(assetId: string): Extract<PicturePaint, { kind: "picture" }> {
  return {
    kind: "picture",
    assetId,
    opacity: 1,
    rotateWithShape: true,
    layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
  };
}
function changeMode(value: unknown) {
  if (disabled.value) return;
  if (value === "inherit") props.onCommit(undefined);
  else if (value === "none") props.onCommit({ kind: "none" });
  else if (value === "solid") commit(createPictureSolidPaint());
  else if (value === "gradient") commit(createPictureGradientPaint());
  else if (value === "pattern")
    commit({
      kind: "pattern",
      preset: "pct50",
      foreground: { kind: "rgb", rgb: "#000000" },
      background: { kind: "rgb", rgb: "#FFFFFF" },
      opacity: 1,
      rotateWithShape: true,
    });
  else if (value === "picture") {
    if (props.loadAsset) void texture("paper");
    else if (props.sourceAssetId) commit(picture(props.sourceAssetId));
    else fileInput.value?.click();
  }
}
function numberProps(
  label: Parameters<PictureFormatTranslate>[0],
  value: number,
  onCommit: (value: number) => boolean,
  min: number,
  max: number,
) {
  return {
    ownerKey: owner.value,
    value,
    label: props.t(label),
    onCommit,
    min,
    max,
    disabled: disabled.value,
    invalidMessage: props.t("outOfRange"),
    rejectedMessage: props.t("applyRejected"),
  };
}
function layout(value: unknown) {
  const current = paint.value;
  if (current?.kind !== "picture") return;
  if (value === "tile")
    commit({
      ...current,
      layout: {
        kind: "tile",
        scaleX: 1,
        scaleY: 1,
        offsetXPt: 0,
        offsetYPt: 0,
        anchor: "center",
        flip: "none",
      },
    });
  else if (value === "stretch")
    commit({
      ...current,
      layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
    });
}
function editTile(
  patch: Partial<Extract<Extract<PicturePaint, { kind: "picture" }>["layout"], { kind: "tile" }>>,
) {
  const current = paint.value;
  return (
    current?.kind === "picture" &&
    current.layout.kind === "tile" &&
    commit({ ...current, layout: { ...current.layout, ...patch } })
  );
}
const stretch = computed(() =>
  paint.value?.kind === "picture" && paint.value.layout.kind === "stretch"
    ? getPictureStretchOffsets(paint.value.layout)
    : undefined,
);
function stretchSide(side: "left" | "right" | "top" | "bottom", value: number) {
  const current = paint.value;
  return current?.kind === "picture" && commit(editPictureStretchOffset(current, side, value));
}
async function loadSource(getBlob: () => Blob | Promise<Blob>, textureId?: PictureTextureId) {
  if (disabled.value || !props.loadAsset) return;
  const generation = ++request,
    key = props.ownerKey,
    loader = props.loadAsset,
    apply = props.onCommit;
  const choice = JSON.stringify(props.value),
    previous =
      paint.value?.kind === "picture"
        ? { ...paint.value, layout: { ...paint.value.layout } }
        : undefined;
  const current = () =>
    generation === request &&
    key === props.ownerKey &&
    !props.disabled &&
    props.loadAsset === loader &&
    props.onCommit === apply &&
    JSON.stringify(props.value) === choice;
  busy.value = true;
  sourceError.value = undefined;
  try {
    const blob = await getBlob();
    if (!current()) return;
    const id = await loader(blob, textureId);
    if (!current()) return;
    if (!id) {
      sourceError.value = props.t("applyRejected");
      return;
    }
    const value = previous ? { ...previous, assetId: id } : picture(id);
    if (textureId && value.layout.kind !== "tile")
      value.layout = {
        kind: "tile",
        scaleX: 1,
        scaleY: 1,
        offsetXPt: 0,
        offsetYPt: 0,
        anchor: "center",
        flip: "none",
      };
    if (!apply({ kind: "value", value })) sourceError.value = props.t("applyRejected");
  } catch {
    if (generation === request && key === props.ownerKey)
      sourceError.value = props.t("paintSourceFailed");
  } finally {
    if (generation === request) busy.value = false;
  }
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (file) void loadSource(() => file);
}
async function clipboard() {
  await loadSource(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((candidate) =>
      candidate.types.some((type) =>
        ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type),
      ),
    );
    const type = item?.types.find((type) =>
      ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type),
    );
    if (!item || !type) throw Error("No supported clipboard picture.");
    return item.getType(type);
  });
}
async function texture(id: PictureTextureId) {
  await loadSource(() => createPictureTextureBlob(id), id);
}
const selectedTexture = computed(() =>
  paint.value?.kind === "picture" ? pictureTextureFromAssetId(paint.value.assetId) : undefined,
);
const patternPreviews = new Map<PicturePatternPreset, string>();
function patternPreview(preset: PicturePatternPreset) {
  const cached = patternPreviews.get(preset);
  if (cached) return cached;
  const sampler = createPicturePatternSampler(preset);
  let rectangles = "";
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 28; x++) {
      const alpha = sampler.sample(x, y);
      if (alpha > 0)
        rectangles += `<rect x="${x}" y="${y}" width="1" height="1" opacity="${alpha.toFixed(3)}"/>`;
    }
  const url = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="24"><rect width="28" height="24" fill="white"/><g fill="black">${rectangles}</g></svg>`)}`;
  patternPreviews.set(preset, url);
  return url;
}
</script>
<template>
  <div class="picture-paint-editor">
    <PictureFormatField :label="t(paintRole === 'line' ? 'lineMode' : 'paintMode')"
      ><TSelect
        :model-value="mode"
        :options="modes"
        :disabled="disabled"
        size="small"
        :aria-label="t(paintRole === 'line' ? 'lineMode' : 'paintMode')"
        @change="changeMode"
    /></PictureFormatField>
    <template v-if="paint">
      <p v-if="paintRole !== 'line'" class="picture-paint-editor__source">
        {{ t("paintBehindSourceHelp") }}
      </p>
      <PicturePaintColor
        v-if="paint.kind === 'solid'"
        :value="paint.color"
        :label="t(paintRole === 'line' ? 'lineColor' : 'paintColor')"
        :automatic-label="t('automatic')"
        :disabled="disabled"
        :on-commit="(color) => paint?.kind === 'solid' && commit({ ...paint, color })"
      />
      <PictureGradientEditor
        v-if="paint.kind === 'linear' || paint.kind === 'radial' || paint.kind === 'rectangular'"
        :owner-key="owner"
        :value="paint"
        :disabled="disabled"
        :t="t"
        :on-commit="commit"
      />
      <template v-if="paint.kind === 'pattern'">
        <PictureFormatField :label="t('patternPreset')" stacked
          ><div
            class="picture-paint-editor__patterns"
            role="group"
            :aria-label="t('patternPreset')"
          >
            <button
              v-for="preset in PICTURE_PATTERN_PRESETS"
              :key="preset"
              type="button"
              :title="t(PICTURE_PATTERN_LABELS[preset])"
              :aria-label="t(PICTURE_PATTERN_LABELS[preset])"
              :aria-pressed="paint.preset === preset"
              :disabled="disabled"
              @click="paint?.kind === 'pattern' && commit({ ...paint, preset })"
            >
              <img :src="patternPreview(preset)" alt="" />
            </button></div
        ></PictureFormatField>
        <PicturePaintColor
          :value="paint.foreground"
          :label="t('patternForeground')"
          :automatic-label="t('automatic')"
          :disabled="disabled"
          :on-commit="(foreground) => paint?.kind === 'pattern' && commit({ ...paint, foreground })"
        />
        <PicturePaintColor
          :value="paint.background"
          :label="t('patternBackground')"
          :automatic-label="t('automatic')"
          :disabled="disabled"
          :on-commit="(background) => paint?.kind === 'pattern' && commit({ ...paint, background })"
        />
      </template>
      <template v-if="paint.kind === 'picture'">
        <p class="picture-paint-editor__source">{{ t("paintSourceReady") }}</p>
        <PictureTextureGallery
          :owner-key="ownerKey"
          :selected="selectedTexture"
          :disabled="disabled || !loadAsset"
          :t="t"
          :on-select="texture"
        />
        <div class="picture-paint-editor__actions">
          <TButton
            variant="outline"
            size="small"
            :disabled="disabled || !loadAsset"
            @click="fileInput?.click()"
            >{{ t("paintLocalFile") }}</TButton
          ><TButton
            variant="text"
            size="small"
            :disabled="disabled || !loadAsset"
            @click="clipboard"
            >{{ t("paintClipboard") }}</TButton
          >
        </div>
        <PictureFormatField :label="t('paintLayout')"
          ><TSelect
            :model-value="paint.layout.kind"
            :options="[
              { value: 'stretch', label: t('paintStretch') },
              { value: 'tile', label: t('paintTile') },
            ]"
            :disabled="disabled"
            size="small"
            :aria-label="t('paintLayout')"
            @change="layout"
        /></PictureFormatField>
        <template v-if="paint.layout.kind === 'tile'">
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintOffsetX',
                paint.layout.offsetXPt,
                (offsetXPt) => editTile({ offsetXPt }),
                -4096,
                4096,
              )
            "
            unit="pt"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintOffsetY',
                paint.layout.offsetYPt,
                (offsetYPt) => editTile({ offsetYPt }),
                -4096,
                4096,
              )
            "
            unit="pt"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintScaleX',
                paint.layout.scaleX * 100,
                (value) => editTile({ scaleX: value / 100 }),
                0.001,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintScaleY',
                paint.layout.scaleY * 100,
                (value) => editTile({ scaleY: value / 100 }),
                0.001,
                1600,
              )
            "
            unit="%"
          />
          <PictureFormatField :label="t('paintAlignment')"
            ><TSelect
              :model-value="paint.layout.anchor"
              :options="anchorOptions"
              :disabled="disabled"
              size="small"
              :aria-label="t('paintAlignment')"
              @change="
                (value) =>
                  anchors.some((item) => item.value === value) &&
                  editTile({ anchor: value as PictureAnchor })
              "
          /></PictureFormatField>
          <PictureFormatField :label="t('paintMirror')"
            ><TSelect
              :model-value="paint.layout.flip"
              :options="flipOptions"
              :disabled="disabled"
              size="small"
              :aria-label="t('paintMirror')"
              @change="
                (value) =>
                  (value === 'none' || value === 'x' || value === 'y' || value === 'xy') &&
                  editTile({ flip: value })
              "
          /></PictureFormatField>
        </template>
        <template v-else-if="stretch">
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchLeft',
                stretch.left,
                (value) => stretchSide('left', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchRight',
                stretch.right,
                (value) => stretchSide('right', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchTop',
                stretch.top,
                (value) => stretchSide('top', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchBottom',
                stretch.bottom,
                (value) => stretchSide('bottom', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
        </template>
      </template>
      <PicturePaintNumber
        v-bind="
          numberProps(
            'paintOpacity',
            (1 - paint.opacity) * 100,
            (value) => !!paint && commit({ ...paint, opacity: 1 - value / 100 }),
            0,
            100,
          )
        "
        unit="%"
      />
      <TCheckbox
        v-if="paint.kind !== 'solid'"
        :model-value="paint.rotateWithShape"
        :disabled="disabled"
        @change="
          (rotateWithShape) =>
            typeof rotateWithShape === 'boolean' &&
            paint?.kind !== 'solid' &&
            !!paint &&
            commit({ ...paint, rotateWithShape })
        "
        >{{ t("paintRotate") }}</TCheckbox
      >
    </template>
    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      hidden
      :disabled="disabled || !loadAsset"
      @change="chooseFile"
    />
    <p v-if="busy" role="status">{{ t("paintSourceLoading") }}</p>
    <p v-if="sourceError" role="alert" class="picture-paint-editor__error">{{ sourceError }}</p>
  </div>
</template>
<style scoped lang="scss">
.picture-paint-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
  &__patterns {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    max-height: 236px;
    overflow: auto;
    padding: 3px;
  }
  &__patterns button {
    display: grid;
    place-items: center;
    height: 34px;
    padding: 2px;
    background: var(--sheetcraft-surface-panel);
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-small);
    cursor: pointer;
  }
  &__patterns button:hover {
    background: var(--sheetcraft-surface-hover);
  }
  &__patterns button[aria-pressed="true"] {
    outline: 2px solid var(--sheetcraft-text-primary);
    outline-offset: 1px;
  }
  &__patterns img {
    width: 28px;
    height: 24px;
    max-width: 100%;
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  &__source {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-text-primary);
  }
}
</style>
