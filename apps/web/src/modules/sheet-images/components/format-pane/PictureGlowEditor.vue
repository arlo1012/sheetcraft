<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { Choice, PictureGlow } from "@sheetcraft/core/picture-detailed-style";
import type {
  PictureFormatTranslate,
  PictureFormatLabelKey,
} from "../../picture-format-pane-model";
import { createPictureGlow } from "../../picture-effect-edit";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
import PicturePaintColor from "./PicturePaintColor.vue";
const props = defineProps<{
  ownerKey: string;
  value?: Choice<PictureGlow>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureGlow> | undefined) => boolean;
}>();
const glow = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() => (props.value === undefined ? "inherit" : props.value.kind));
const modes = computed(() => [
  { value: "inherit", label: props.t("effectInherit") },
  { value: "none", label: props.t("effectNone") },
  { value: "value", label: props.t("effectCustom") },
]);
function choose(value: unknown) {
  if (props.disabled) return;
  if (value === "inherit") props.onCommit(undefined);
  else if (value === "none") props.onCommit({ kind: "none" });
  else if (value === "value")
    props.onCommit({ kind: "value", value: glow.value ?? createPictureGlow() });
}
function update(patch: Partial<PictureGlow>) {
  return (
    !!glow.value &&
    !props.disabled &&
    props.onCommit({ kind: "value", value: { ...glow.value, ...patch } })
  );
}
function numberProps(
  label: PictureFormatLabelKey,
  value: number,
  onCommit: (value: number) => boolean,
  min: number,
  max: number,
) {
  return {
    ownerKey: `${props.ownerKey}:glow:${mode.value}`,
    value,
    label: props.t(label),
    onCommit,
    min,
    max,
    disabled: props.disabled,
    invalidMessage: props.t("outOfRange"),
    rejectedMessage: props.t("applyRejected"),
  };
}
</script>
<template>
  <div class="picture-glow-editor">
    <PictureFormatField :label="t('effectMode')"
      ><TSelect
        :model-value="mode"
        :options="modes"
        :disabled="disabled"
        size="small"
        :aria-label="t('glowSection')"
        @change="choose"
    /></PictureFormatField>
    <template v-if="glow">
      <PicturePaintColor
        :value="glow.color"
        :label="t('glowColor')"
        :automatic-label="t('automatic')"
        :disabled="disabled"
        :on-commit="(color) => update({ color })"
      />
      <PicturePaintNumber
        v-bind="numberProps('glowSizePt', glow.sizePt, (sizePt) => update({ sizePt }), 0, 4096)"
        unit="pt"
      />
      <PicturePaintNumber
        v-bind="
          numberProps(
            'glowTransparencyPercent',
            (1 - glow.opacity) * 100,
            (value) => update({ opacity: 1 - value / 100 }),
            0,
            100,
          )
        "
        unit="%"
      />
    </template>
  </div>
</template>
<style scoped lang="scss">
.picture-glow-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
}
</style>
