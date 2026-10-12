<script setup lang="ts">
import { computed } from "vue";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { Choice, PictureSoftEdges } from "@sheetcraft/core/picture-detailed-style";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import { createPictureSoftEdges } from "../../picture-effect-edit";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
const props = defineProps<{
  ownerKey: string;
  value?: Choice<PictureSoftEdges>;
  disabled?: boolean;
  t: PictureFormatTranslate;
  onCommit: (value: Choice<PictureSoftEdges> | undefined) => boolean;
}>();
const soft = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
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
    props.onCommit({ kind: "value", value: soft.value ?? createPictureSoftEdges() });
}
</script>
<template>
  <div class="picture-soft-edges-editor">
    <PictureFormatField :label="t('effectMode')"
      ><TSelect
        :model-value="mode"
        :options="modes"
        :disabled="disabled"
        size="small"
        :aria-label="t('softEdgesSection')"
        @change="choose"
    /></PictureFormatField>
    <PicturePaintNumber
      v-if="soft"
      :owner-key="`${ownerKey}:softEdges:${mode}`"
      :value="soft.sizePt"
      :label="t('softEdgeSizePt')"
      unit="pt"
      :min="0"
      :max="4096"
      :disabled="disabled"
      :invalid-message="t('outOfRange')"
      :rejected-message="t('applyRejected')"
      :on-commit="(sizePt) => !disabled && onCommit({ kind: 'value', value: { sizePt } })"
    />
    <div v-if="soft" class="picture-soft-edges-editor__presets">
      <button
        v-for="sizePt in [1, 2.5, 5, 10, 25, 50]"
        :key="sizePt"
        type="button"
        :disabled="disabled"
        :aria-pressed="soft.sizePt === sizePt"
        @click="onCommit({ kind: 'value', value: { sizePt } })"
      >
        {{ sizePt }} {{ t("unitPt") }}
      </button>
    </div>
  </div>
</template>
<style scoped lang="scss">
.picture-soft-edges-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
  &__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  &__presets button {
    font: inherit;
    color: inherit;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-small);
    background: var(--sheetcraft-surface-panel);
    padding: 4px 7px;
    cursor: pointer;
  }
  &__presets button[aria-pressed="true"] {
    outline: 2px solid var(--sheetcraft-text-primary);
  }
}
</style>
