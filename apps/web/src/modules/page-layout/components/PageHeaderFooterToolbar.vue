<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Calendar, Clock, File, Files, Hash, Sheet } from "lucide-vue-next";
import type { HeaderFooterEditorAction, HeaderFooterEditContext } from "../header-footer-editor";
import type { HeaderFooterFormat } from "../header-footer-text";
import { useAppI18n } from "../../../shared/i18n";
import HeaderFooterFontDialog from "./HeaderFooterFontDialog.vue";

const props = defineProps<{
  context?: HeaderFooterEditContext;
  disabled: boolean;
  active: boolean;
  sampleText?: string;
}>();
const emit = defineEmits<{ action: [action: HeaderFooterEditorAction] }>();
const { t } = useAppI18n();
const fontVisible = ref(false);
const inactive = computed(() => props.disabled || !props.context);
function confirmFont(format: HeaderFooterFormat): void {
  if (!inactive.value && props.active) emit("action", { type: "format", patch: format });
}
watch(
  () =>
    [
      props.active,
      props.disabled,
      props.context?.section,
      props.context?.part,
      props.context?.variant,
    ] as const,
  () => {
    fontVisible.value = false;
  },
);
</script>

<template>
  <div
    class="page-header-footer-toolbar"
    role="group"
    :aria-label="t('pageLayout.headerFooterTools')"
    data-page-header-footer-toolbar
  >
    <TButton
      shape="square"
      variant="text"
      :title="t('pageLayout.headerFooterFont')"
      :aria-label="t('pageLayout.headerFooterFont')"
      :disabled="inactive"
      data-header-footer-action="font"
      @click="fontVisible = true"
      ><span class="page-header-footer-toolbar__font" aria-hidden="true">A</span></TButton
    >
    <TButton
      shape="square"
      variant="text"
      :title="t('pageLayout.headerFooterPageNumber')"
      :aria-label="t('pageLayout.headerFooterPageNumber')"
      :disabled="inactive"
      @click="emit('action', { type: 'insertField', field: 'pageNumber' })"
      ><template #icon><Hash class="page-header-footer-toolbar__icon" /></template
    ></TButton>
    <TButton
      shape="square"
      variant="text"
      :title="t('pageLayout.headerFooterPageCount')"
      :aria-label="t('pageLayout.headerFooterPageCount')"
      :disabled="inactive"
      @click="emit('action', { type: 'insertField', field: 'pageCount' })"
      ><template #icon><Files class="page-header-footer-toolbar__icon" /></template
    ></TButton>
    <TButton
      shape="square"
      variant="text"
      :title="t('pageLayout.headerFooterDate')"
      :aria-label="t('pageLayout.headerFooterDate')"
      :disabled="inactive"
      @click="emit('action', { type: 'insertField', field: 'date' })"
      ><template #icon><Calendar class="page-header-footer-toolbar__icon" /></template
    ></TButton>
    <TButton
      shape="square"
      variant="text"
      :title="t('pageLayout.headerFooterTime')"
      :aria-label="t('pageLayout.headerFooterTime')"
      :disabled="inactive"
      @click="emit('action', { type: 'insertField', field: 'time' })"
      ><template #icon><Clock class="page-header-footer-toolbar__icon" /></template
    ></TButton>
    <TButton
      shape="square"
      variant="text"
      :title="t('pageLayout.headerFooterFileName')"
      :aria-label="t('pageLayout.headerFooterFileName')"
      :disabled="inactive"
      @click="emit('action', { type: 'insertField', field: 'fileName' })"
      ><template #icon><File class="page-header-footer-toolbar__icon" /></template
    ></TButton>
    <TButton
      shape="square"
      variant="text"
      :title="t('pageLayout.headerFooterSheetName')"
      :aria-label="t('pageLayout.headerFooterSheetName')"
      :disabled="inactive"
      @click="emit('action', { type: 'insertField', field: 'sheetName' })"
      ><template #icon><Sheet class="page-header-footer-toolbar__icon" /></template
    ></TButton>
  </div>
  <HeaderFooterFontDialog
    v-if="context"
    v-model:visible="fontVisible"
    :format="context.format"
    :sample-text="sampleText"
    @confirm="confirmFont"
  />
</template>

<style scoped lang="scss">
.page-header-footer-toolbar {
  display: flex;
  align-items: center;
  gap: var(--idea-space-2);

  &__icon {
    width: var(--idea-action-icon-size);
    height: var(--idea-action-icon-size);
    stroke-width: var(--idea-icon-stroke-width);
  }

  &__font {
    font-family: var(--idea-font-sans);
    font-size: var(--idea-font-size-body-medium);
    line-height: 1;
  }
}
</style>
