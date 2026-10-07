<script setup lang="ts">
import { computed, ref, watch } from "vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
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
    <RibbonButton
      :label="t('pageLayout.headerFooterFont')"
      :disabled="inactive"
      data-header-footer-action="font"
      @activate="fontVisible = true"
      ><span class="page-header-footer-toolbar__font" aria-hidden="true">A</span></RibbonButton
    >
    <RibbonButton
      :label="t('pageLayout.headerFooterPageNumber')"
      :disabled="inactive"
      @activate="emit('action', { type: 'insertField', field: 'pageNumber' })"
      ><Hash
    /></RibbonButton>
    <RibbonButton
      :label="t('pageLayout.headerFooterPageCount')"
      :disabled="inactive"
      @activate="emit('action', { type: 'insertField', field: 'pageCount' })"
      ><Files
    /></RibbonButton>
    <RibbonButton
      :label="t('pageLayout.headerFooterDate')"
      :disabled="inactive"
      @activate="emit('action', { type: 'insertField', field: 'date' })"
      ><Calendar
    /></RibbonButton>
    <RibbonButton
      :label="t('pageLayout.headerFooterTime')"
      :disabled="inactive"
      @activate="emit('action', { type: 'insertField', field: 'time' })"
      ><Clock
    /></RibbonButton>
    <RibbonButton
      :label="t('pageLayout.headerFooterFileName')"
      :disabled="inactive"
      @activate="emit('action', { type: 'insertField', field: 'fileName' })"
      ><File
    /></RibbonButton>
    <RibbonButton
      :label="t('pageLayout.headerFooterSheetName')"
      :disabled="inactive"
      @activate="emit('action', { type: 'insertField', field: 'sheetName' })"
      ><Sheet
    /></RibbonButton>
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

  &__font {
    font-family: var(--idea-font-sans);
    font-size: var(--idea-font-size-body-medium);
    line-height: 1;
  }
}
</style>
