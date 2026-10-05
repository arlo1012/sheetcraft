<script setup lang="ts">
import { Link2, Table2 } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import ImageInsertMenu from "../../home-tools/components/ImageInsertMenu.vue";
defineProps<{
  disabled: boolean;
  imageDisabled: boolean;
  hyperlinkDisabled: boolean;
  hasTable: boolean;
  editSessionId?: string;
}>();
const emit = defineEmits<{
  insertImage: [mode: "cell" | "floating"];
  insertHyperlink: [];
  insertTable: [];
  manageTable: [];
}>();
defineSlots<{ watermark(): unknown }>();
const { t } = useAppI18n();
</script>
<template>
  <RibbonToolbar :label="t('ribbon.insertTools')" :data-cell-edit-session="editSessionId">
    <section
      class="insert-toolbar__group"
      :aria-label="t('tables.tools')"
      role="group"
      data-ribbon-group="insert-tables"
    >
      <RibbonButton
        variant="tall"
        :label="t('tables.tools')"
        :text="t('tables.create')"
        :disabled="disabled"
        data-insert-tool="table"
        @activate="hasTable ? emit('manageTable') : emit('insertTable')"
        ><Table2
      /></RibbonButton>
    </section>
    <section
      class="insert-toolbar__group"
      :aria-label="t('image.insertMenu')"
      role="group"
      data-ribbon-group="insert-illustrations"
    >
      <ImageInsertMenu :disabled="imageDisabled" @insert-image="emit('insertImage', $event)" />
      <slot name="watermark" />
    </section>
    <section
      class="insert-toolbar__group"
      :aria-label="t('hyperlinks.insert')"
      role="group"
      data-ribbon-group="insert-links"
    >
      <RibbonButton
        variant="tall"
        :label="t('hyperlinks.insert')"
        :text="t('hyperlinks.insert')"
        :disabled="hyperlinkDisabled"
        data-insert-tool="hyperlink"
        @activate="emit('insertHyperlink')"
        ><Link2
      /></RibbonButton>
    </section>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.insert-toolbar__group {
  @include ribbon.columns;
}
</style>
