<script setup lang="ts">
import { computed } from "vue";
import { cloneFloatingImage } from "@sheetcraft/core/workbook";
import { Eye, EyeOff, X } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { FloatingImage } from "@sheetcraft/core/workbook";
import { isPictureGroup } from "@sheetcraft/core";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  images: readonly FloatingImage[];
  selectedIds: readonly string[];
  disabled: boolean;
  renameHandler?: (image: FloatingImage, name: string) => boolean;
  visibilityHandler?: (image: FloatingImage) => boolean;
  selectHandler?: (ids: string[]) => boolean;
  closeHandler?: () => boolean;
}>();
const emit = defineEmits<{
  select: [ids: string[]];
  visibility: [image: FloatingImage];
  rename: [image: FloatingImage, name: string];
  close: [];
}>();
const { t } = useAppI18n();
function toggle(id: string): void {
  const image = props.images.find((entry) => entry.id === id);
  if (!image) return;
  // Owned groups are root selections; groupId only relates standalone pictures.
  const groupId = isPictureGroup(image) ? undefined : image.groupId;
  const members = groupId
    ? props.images
        .filter((entry) => !isPictureGroup(entry) && entry.groupId === groupId)
        .map((entry) => entry.id)
    : [image.id];
  const rootIds = new Set(props.images.map((entry) => entry.id));
  const selectedIds = props.selectedIds.filter((value) => rootIds.has(value));
  select(
    selectedIds.includes(id)
      ? selectedIds.filter((value) => !members.includes(value))
      : [...new Set([...selectedIds, ...members])],
  );
}
const callbacks = computed(() => {
  const rename = props.renameHandler;
  const visibility = props.visibilityHandler;
  const select = props.selectHandler;
  const close = props.closeHandler;
  return {
    rename: (image: FloatingImage, name: string) => {
      if (props.disabled || rename !== props.renameHandler) return;
      if (rename) rename(cloneFloatingImage(image), name);
      else emit("rename", image, name);
    },
    visibility: (image: FloatingImage) => {
      if (props.disabled || visibility !== props.visibilityHandler) return;
      if (visibility) visibility(cloneFloatingImage(image));
      else emit("visibility", image);
    },
    select: (ids: string[]) => {
      if (select !== props.selectHandler) return;
      if (select) select(ids);
      else emit("select", ids);
    },
    close: () => {
      if (close !== props.closeHandler) return;
      if (close) close();
      else emit("close");
    },
  };
});
const closeAction = computed(() => callbacks.value.close);
const selectAllAction = computed(() => {
  const owner = callbacks.value;
  const ids = props.images.map((image) => image.id);
  return () => owner.select(ids);
});
function select(ids: string[]): void {
  callbacks.value.select(ids);
}
const rows = computed(() => {
  const owner = callbacks.value;
  return [...props.images].reverse().map((entry) => {
    const image = cloneFloatingImage(entry);
    return {
      image,
      rename: (value: unknown) => owner.rename(image, String(value)),
      visibility: () => owner.visibility(image),
      select: () => {
        if (owner === callbacks.value) toggle(image.id);
      },
    };
  });
});
</script>
<template>
  <aside class="picture-selection-pane" :aria-label="t('picture.selectionPane')">
    <header class="picture-selection-pane__header">
      <strong>{{ t("picture.selectionPane") }}</strong
      ><TButton variant="text" shape="square" :aria-label="t('picture.close')" @click="closeAction"
        ><X :size="16"
      /></TButton>
    </header>
    <TButton size="small" variant="text" @click="selectAllAction">{{
      t("picture.selectAll")
    }}</TButton>
    <p v-if="!images.length">{{ t("picture.noPictures") }}</p>
    <ul class="picture-selection-pane__list">
      <li
        v-for="row in rows"
        :key="row.image.id"
        class="picture-selection-pane__row"
        :class="{ 'is-selected': selectedIds.includes(row.image.id) }"
      >
        <TCheckbox
          :model-value="selectedIds.includes(row.image.id)"
          :aria-label="row.image.altText || row.image.id"
          @change="row.select"
        />
        <TInput
          :key="row.image.id + row.image.altText"
          :default-value="row.image.altText || row.image.id"
          size="small"
          :disabled="disabled"
          :aria-label="t('picture.name')"
          @blur="row.rename"
        />
        <TButton
          size="small"
          variant="text"
          shape="square"
          :disabled="disabled"
          :aria-label="t(row.image.hidden ? 'picture.show' : 'picture.hide')"
          @click="row.visibility"
          ><EyeOff v-if="row.image.hidden" :size="16" /><Eye v-else :size="16"
        /></TButton>
      </li>
    </ul>
  </aside>
</template>
<style scoped lang="scss">
.picture-selection-pane {
  display: flex;
  flex-direction: column;
  width: 280px;
  flex: 0 0 280px;
  min-height: 0;
  padding: 8px;
  border-left: 1px solid var(--sheetcraft-border-subtle);
  background: var(--sheetcraft-surface-panel);
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__list {
    padding: 0;
    margin: 8px 0;
    list-style: none;
    overflow: auto;
  }
  &__row {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 4px;
    &.is-selected {
      background: var(--sheetcraft-surface-hover);
    }
  }
}
</style>
