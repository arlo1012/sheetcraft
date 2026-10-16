<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import { useWorkbookTheme } from "../../../../shared/color/workbook-theme-context";
import PanelSelect from "../../../../shared/panel-select/PanelSelect.vue";
import PicturePresetChoices from "./PicturePresetChoices.vue";
import { picturePresetPreview } from "../../picture-preset-preview";
import PictureFormatField from "./PictureFormatField.vue";
import type {
  PicturePresetGalleryItem,
  PicturePresetGalleryGroup,
} from "../../picture-preset-gallery-model";
const props = withDefaults(
  defineProps<{
    ownerKey: string;
    groups: readonly PicturePresetGalleryGroup[];
    selectedId?: string;
    disabled?: boolean;
    t: PictureFormatTranslate;
    onSelect: (id: string) => boolean;
    /** Optional explicit theme inheritance, separate from the concrete preset model. */
    onInherit?: () => boolean;
    columns?: number;
    label?: string;
    emptyLabel?: string;
    inline?: boolean;
    reason?: string;
    error?: string;
  }>(),
  { columns: 3 },
);
const theme = useWorkbookTheme(),
  opening = ref<string>(),
  callbackGeneration = ref(0);
let generation = 0;
const flattened = computed(() => props.groups.flatMap((group) => group.items));
const selected = computed(() => flattened.value.find((item) => item.id === props.selectedId));
const errors = new Set<string>();
function itemLabel(item: PicturePresetGalleryItem) {
  return (
    props.t(item.labelKey) +
    (item.ordinal === undefined ? "" : ` ${item.ordinal}`) +
    (item.unitKey ? ` ${props.t(item.unitKey)}` : "")
  );
}
function preview(item: PicturePresetGalleryItem) {
  if (errors.has(item.id)) return;
  try {
    return picturePresetPreview(item.previewStyle, theme?.value);
  } catch {
    errors.add(item.id);
    return;
  }
}
function selectionAction(id: string, close: () => void) {
  const key = props.ownerKey,
    token = generation,
    handler = props.onSelect;
  return () => {
    if (
      props.disabled ||
      opening.value !== key ||
      props.ownerKey !== key ||
      generation !== token ||
      props.onSelect !== handler ||
      !flattened.value.some((item) => item.id === id)
    )
      return false;
    if (handler(id) !== true) return false;
    close();
    return true;
  };
}
function inheritanceAction(close: () => void) {
  const key = props.ownerKey,
    token = generation,
    handler = props.onInherit;
  return () => {
    if (
      !handler ||
      props.disabled ||
      opening.value !== key ||
      props.ownerKey !== key ||
      generation !== token ||
      props.onInherit !== handler
    )
      return false;
    if (handler() !== true) return false;
    close();
    return true;
  };
}
watch(
  () => props.ownerKey,
  () => {
    generation++;
    opening.value = undefined;
    errors.clear();
  },
);
watch(
  () => [props.onSelect, props.onInherit] as const,
  () => {
    generation++;
    callbackGeneration.value++;
    opening.value = undefined;
  },
  { flush: "sync" },
);
onUnmounted(() => {
  generation++;
  opening.value = undefined;
});
function open(value: boolean) {
  generation++;
  opening.value = value ? props.ownerKey : undefined;
}
</script>
<template>
  <PictureFormatField
    :label="label ?? t('preset')"
    :inline="inline"
    :reason="reason"
    :error="error"
  >
    <PanelSelect
      :key="`${ownerKey}:${callbackGeneration}`"
      :model-value="selectedId"
      :label="label ?? t('preset')"
      :value-label="selected ? itemLabel(selected) : (emptyLabel ?? t('effectCustom'))"
      :disabled="disabled"
      panel-width="content"
      @open-change="open"
    >
      <template #value
        ><img
          v-if="selected && preview(selected)"
          :src="preview(selected)"
          alt=""
          class="picture-preset-gallery__selected"
        /><span
          class="picture-preset-gallery__value"
          :title="selected ? itemLabel(selected) : (emptyLabel ?? t('effectCustom'))"
          >{{ selected ? itemLabel(selected) : (emptyLabel ?? t("effectCustom")) }}</span
        ></template
      >
      <template #panel="{ close }">
        <div v-if="onInherit" class="picture-preset-gallery__actions">
          <TButton
            variant="text"
            size="small"
            :disabled="disabled"
            data-picture-preset-inherit
            :onClick="inheritanceAction(close)"
            >{{ t("effectInherit") }}</TButton
          >
        </div>
        <PicturePresetChoices
          :scrollable="false"
          :owner-key="`${ownerKey}:${callbackGeneration}`"
          :groups="groups"
          :selected-id="selectedId"
          :disabled="disabled"
          :columns="columns"
          :t="t"
          :on-select="(id) => selectionAction(id, close)()"
        />
      </template>
    </PanelSelect>
  </PictureFormatField>
</template>
<style scoped lang="scss">
.picture-preset-gallery__actions {
  display: flex;
  padding: 6px;
}

.picture-preset-gallery__value {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picture-preset-gallery__selected {
  flex: 0 0 auto;
  max-width: 28px;
  max-height: 20px;
  object-fit: contain;
}
</style>
