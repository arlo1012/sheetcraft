<script setup lang="ts">
import { Eye, EyeOff, X } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import type { FloatingImage } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  images: readonly FloatingImage[];
  selectedIds: readonly string[];
  disabled: boolean;
}>();
const emit = defineEmits<{
  select: [ids: string[]];
  visibility: [image: FloatingImage];
  rename: [image: FloatingImage, name: string];
  close: [];
}>();
const { t } = useAppI18n();
function toggle(id: string): void {
  emit(
    "select",
    props.selectedIds.includes(id)
      ? props.selectedIds.filter((value) => value !== id)
      : [...props.selectedIds, id],
  );
}
</script>
<template>
  <aside class="picture-selection-pane" :aria-label="t('picture.selectionPane')">
    <header class="picture-selection-pane__header">
      <strong>{{ t("picture.selectionPane") }}</strong
      ><TButton
        variant="text"
        shape="square"
        :aria-label="t('picture.close')"
        @click="emit('close')"
        ><X :size="16"
      /></TButton>
    </header>
    <TButton
      size="small"
      variant="text"
      @click="
        emit(
          'select',
          images.map((image) => image.id),
        )
      "
      >{{ t("picture.selectAll") }}</TButton
    >
    <p v-if="!images.length">{{ t("picture.noPictures") }}</p>
    <ul class="picture-selection-pane__list">
      <li
        v-for="image in [...images].reverse()"
        :key="image.id"
        class="picture-selection-pane__row"
        :class="{ 'is-selected': selectedIds.includes(image.id) }"
      >
        <TCheckbox
          :model-value="selectedIds.includes(image.id)"
          :aria-label="image.altText || image.id"
          @change="toggle(image.id)"
        />
        <TInput
          :key="image.id + image.altText"
          :default-value="image.altText || image.id"
          size="small"
          :disabled="disabled"
          :aria-label="t('picture.name')"
          @blur="(value) => emit('rename', image, String(value))"
        />
        <TButton
          size="small"
          variant="text"
          shape="square"
          :disabled="disabled"
          :aria-label="t(image.hidden ? 'picture.show' : 'picture.hide')"
          @click="emit('visibility', image)"
          ><EyeOff v-if="image.hidden" :size="16" /><Eye v-else :size="16"
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
  border-left: 1px solid var(--idea-border-subtle);
  background: var(--idea-surface-panel);
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
      background: var(--idea-surface-hover);
    }
  }
}
</style>
