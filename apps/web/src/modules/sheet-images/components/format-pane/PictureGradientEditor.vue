<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Plus, Minus } from "lucide-vue-next";
import { DEFAULT_WORKBOOK_THEME } from "@sheetcraft/core/workbook-theme";
import type {
  PictureGradientPaint,
  PicturePaintStop,
} from "@sheetcraft/core/picture-detailed-style";
import { useWorkbookTheme } from "../../../../shared/color/workbook-theme-context";
import {
  brightenPictureColor,
  resolvePictureColor,
} from "../../../../shared/images/picture-paint-color";
import {
  addPictureGradientStop,
  editPictureGradientStop,
  removePictureGradientStop,
  changePictureGradientKind,
} from "../../picture-paint-edit";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintColor from "./PicturePaintColor.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
const props = defineProps<{
  ownerKey: string;
  value: PictureGradientPaint;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (paint: PictureGradientPaint) => boolean;
}>();
const selected = ref(0),
  theme = useWorkbookTheme();
watch(
  () => props.ownerKey,
  () => {
    selected.value = 0;
  },
);
watch(
  () => props.value.stops.length,
  (length) => {
    selected.value = Math.min(selected.value, length - 1);
  },
);
const stop = computed(() => props.value.stops[selected.value]!);
const stopOwner = computed(() => `${props.ownerKey}:stop:${selected.value}`);
const kinds = computed(() => [
  { value: "linear", label: props.t("gradientLinear") },
  { value: "radial", label: props.t("gradientRadial") },
  { value: "rectangular", label: props.t("gradientRectangular") },
]);
function colorCss(value: PicturePaintStop) {
  const rgb = brightenPictureColor(
    resolvePictureColor(value.color, theme?.value ?? DEFAULT_WORKBOOK_THEME),
    value.brightness,
  );
  return `rgb(${rgb.map(Math.round).join(" ")} / ${value.opacity})`;
}
const preview = computed(
  () =>
    `linear-gradient(90deg, ${props.value.stops.map((value) => `${colorCss(value)} ${value.offset * 100}%`).join(", ")})`,
);
function update(paint: PictureGradientPaint) {
  return !props.disabled && props.onCommit(paint);
}
function editStop(patch: Partial<PicturePaintStop>) {
  const next = editPictureGradientStop(props.value, selected.value, patch);
  if (!update(next.gradient)) return false;
  selected.value = next.selectedIndex;
  return true;
}
function add() {
  const next = addPictureGradientStop(props.value);
  if (update(next.gradient)) selected.value = next.selectedIndex;
}
function remove() {
  const next = removePictureGradientStop(props.value, selected.value);
  if (update(next.gradient)) selected.value = next.selectedIndex;
}
function kind(value: unknown) {
  if (value === "linear" || value === "radial" || value === "rectangular")
    update(changePictureGradientKind(props.value, value));
}
function numberProps(
  label: Parameters<PictureFormatTranslate>[0],
  value: number,
  onCommit: (value: number) => boolean,
  min: number,
  max: number,
  ownerKey = props.ownerKey,
) {
  return {
    ownerKey,
    value,
    label: props.t(label),
    min,
    max,
    disabled: props.disabled,
    invalidMessage: props.t("outOfRange"),
    rejectedMessage: props.t("applyRejected"),
    onCommit,
  };
}
</script>
<template>
  <div class="picture-gradient-editor">
    <PictureFormatField :label="t('gradientKind')"
      ><TSelect
        :model-value="value.kind"
        :options="kinds"
        :disabled="disabled"
        size="small"
        :aria-label="t('gradientKind')"
        @change="kind"
    /></PictureFormatField>
    <div class="picture-gradient-editor__stops" role="group" :aria-label="t('gradientStops')">
      <div
        class="picture-gradient-editor__preview"
        :style="{ backgroundImage: preview }"
        aria-hidden="true"
      />
      <div class="picture-gradient-editor__markers">
        <button
          v-for="(item, index) in value.stops"
          :key="index"
          type="button"
          :disabled="disabled"
          :aria-pressed="selected === index"
          :aria-label="`${t('gradientStops')} ${index + 1}, ${Math.round(item.offset * 10000) / 100}%`"
          :style="{ '--stop-color': colorCss(item) }"
          @click="selected = index"
        >
          <span aria-hidden="true" />{{ index + 1 }}
        </button>
      </div>
      <div class="picture-gradient-editor__actions">
        <TButton
          variant="outline"
          size="small"
          :disabled="disabled || value.stops.length >= 16"
          :aria-label="t('gradientAddStop')"
          @click="add"
          ><Plus :size="14" />{{ t("gradientAddStop") }}</TButton
        ><TButton
          variant="text"
          size="small"
          :disabled="disabled || value.stops.length <= 2"
          :aria-label="t('gradientRemoveStop')"
          @click="remove"
          ><Minus :size="14" />{{ t("gradientRemoveStop") }}</TButton
        >
      </div>
    </div>
    <PicturePaintColor
      :value="stop.color"
      :label="t('paintColor')"
      :automatic-label="t('automatic')"
      :disabled="disabled"
      :on-commit="(color) => editStop({ color })"
    />
    <PicturePaintNumber
      v-bind="
        numberProps(
          'gradientPosition',
          stop.offset * 100,
          (value) => editStop({ offset: value / 100 }),
          0,
          100,
          stopOwner,
        )
      "
      unit="%"
    />
    <PicturePaintNumber
      v-bind="
        numberProps(
          'paintOpacity',
          (1 - stop.opacity) * 100,
          (value) => editStop({ opacity: 1 - value / 100 }),
          0,
          100,
          stopOwner,
        )
      "
      unit="%"
    />
    <PicturePaintNumber
      v-bind="
        numberProps(
          'gradientBrightness',
          stop.brightness * 100,
          (value) => editStop({ brightness: value / 100 }),
          -100,
          100,
          stopOwner,
        )
      "
      unit="%"
    />
    <PicturePaintNumber
      v-if="value.kind === 'linear'"
      v-bind="
        numberProps(
          'gradientAngle',
          value.angleDeg,
          (angleDeg) => value.kind === 'linear' && update({ ...value, angleDeg }),
          -3600,
          3600,
        )
      "
      unit="°"
    />
    <template v-else>
      <PicturePaintNumber
        v-bind="
          numberProps(
            'gradientCenterX',
            value.centerX * 100,
            (centerX) => value.kind !== 'linear' && update({ ...value, centerX: centerX / 100 }),
            0,
            100,
          )
        "
        unit="%"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'gradientCenterY',
            value.centerY * 100,
            (centerY) => value.kind !== 'linear' && update({ ...value, centerY: centerY / 100 }),
            0,
            100,
          )
        "
        unit="%"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'gradientRadiusX',
            value.radiusX * 100,
            (radiusX) => value.kind !== 'linear' && update({ ...value, radiusX: radiusX / 100 }),
            0.001,
            1600,
          )
        "
        unit="%"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'gradientRadiusY',
            value.radiusY * 100,
            (radiusY) => value.kind !== 'linear' && update({ ...value, radiusY: radiusY / 100 }),
            0.001,
            1600,
          )
        "
        unit="%"
      />
    </template>
  </div>
</template>
<style scoped lang="scss">
.picture-gradient-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
  &__stops {
    display: grid;
    gap: 8px;
  }
  &__preview {
    height: 24px;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-small);
  }
  &__markers {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  &__markers button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 27px;
    min-width: 28px;
    padding: 3px 5px;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-small);
    background: var(--sheetcraft-surface-panel);
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  &__markers button[aria-pressed="true"] {
    outline: 2px solid var(--sheetcraft-text-primary);
    outline-offset: 1px;
  }
  &__markers button span {
    width: 12px;
    height: 12px;
    background: var(--stop-color);
    border: 1px solid var(--sheetcraft-border-subtle);
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
