<script setup lang="ts">
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import {
  AppWindow,
  FileImage,
  FilePenLine,
  Shapes,
  TableProperties,
  WandSparkles,
} from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-automation-group"
    data-ribbon-group="automation"
    role="group"
    :aria-label="t('ribbon.automationTools')"
  >
    <RibbonMenuButton
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.quickTools') })"
      :text="t('ribbon.quickTools')"
      disabled
      data-ribbon-layout="tall"
      data-ribbon-placeholder="quick-tools"
      data-ribbon-span="2"
    >
      <WandSparkles :size="17" aria-hidden="true" />
    </RibbonMenuButton>
    <RibbonButton
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.generateIcon') })"
      :text="t('ribbon.generateIcon')"
      disabled
      data-ribbon-layout="tall"
      data-ribbon-placeholder="generate-icon"
      data-ribbon-span="2"
    >
      <Shapes :size="17" aria-hidden="true" />
    </RibbonButton>
    <div class="home-automation-group__stack" data-ribbon-stack="smart-table-pdf">
      <RibbonButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.smartTable') })"
        :text="t('ribbon.smartTable')"
        disabled
        data-ribbon-placeholder="smart-table"
        data-ribbon-row="1"
      >
        <TableProperties :size="15" aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.pdfToEditable') })"
        :text="t('ribbon.pdfToEditable')"
        disabled
        data-ribbon-placeholder="pdf-to-editable"
        data-ribbon-row="2"
      >
        <FilePenLine :size="15" aria-hidden="true" />
      </RibbonButton>
    </div>
    <div class="home-automation-group__stack" data-ribbon-stack="app-generator-pdf">
      <RibbonButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.appGenerator') })"
        :text="t('ribbon.appGenerator')"
        disabled
        data-ribbon-placeholder="app-generator"
        data-ribbon-row="1"
      >
        <AppWindow :size="15" aria-hidden="true" />
      </RibbonButton>
      <RibbonButton
        :label="t('app.unavailableFeature', { feature: t('ribbon.pdfToImage') })"
        :text="t('ribbon.pdfToImage')"
        disabled
        data-ribbon-placeholder="pdf-to-image"
        data-ribbon-row="2"
      >
        <FileImage :size="15" aria-hidden="true" />
      </RibbonButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-automation-group {
  @include ribbon.columns;

  &__stack {
    @include ribbon.stack;

    min-width: 94px;
  }
}
</style>
