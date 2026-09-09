<script setup lang="ts">
import {
  AppWindow,
  FileImage,
  FilePenLine,
  Shapes,
  TableProperties,
  WandSparkles,
} from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonIconAction from "./RibbonIconAction.vue";

const { t } = useAppI18n();
</script>

<template>
  <section
    class="home-automation-group"
    data-ribbon-group="automation"
    role="group"
    :aria-label="t('ribbon.automationTools')"
  >
    <RibbonIconAction
      class="home-automation-group__quick-tools"
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.quickTools') })"
      :text="t('ribbon.quickTools')"
      disabled
      disclosure
      data-ribbon-layout="tall"
      data-ribbon-placeholder="quick-tools"
      data-ribbon-span="2"
    >
      <WandSparkles :size="17" aria-hidden="true" />
    </RibbonIconAction>
    <RibbonIconAction
      class="home-automation-group__generate-icon"
      variant="tall"
      :label="t('app.unavailableFeature', { feature: t('ribbon.generateIcon') })"
      :text="t('ribbon.generateIcon')"
      disabled
      data-ribbon-layout="tall"
      data-ribbon-placeholder="generate-icon"
      data-ribbon-span="2"
    >
      <Shapes :size="17" aria-hidden="true" />
    </RibbonIconAction>
    <div class="home-automation-group__grid" data-ribbon-grid="automation-secondary">
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.smartTable') })"
        :text="t('ribbon.smartTable')"
        disabled
        data-ribbon-column="1"
        data-ribbon-placeholder="smart-table"
        data-ribbon-row="1"
      >
        <TableProperties :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.appGenerator') })"
        :text="t('ribbon.appGenerator')"
        disabled
        data-ribbon-column="2"
        data-ribbon-placeholder="app-generator"
        data-ribbon-row="1"
      >
        <AppWindow :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.pdfToEditable') })"
        :text="t('ribbon.pdfToEditable')"
        disabled
        data-ribbon-column="1"
        data-ribbon-placeholder="pdf-to-editable"
        data-ribbon-row="2"
      >
        <FilePenLine :size="15" aria-hidden="true" />
      </RibbonIconAction>
      <RibbonIconAction
        :label="t('app.unavailableFeature', { feature: t('ribbon.pdfToImage') })"
        :text="t('ribbon.pdfToImage')"
        disabled
        data-ribbon-column="2"
        data-ribbon-placeholder="pdf-to-image"
        data-ribbon-row="2"
      >
        <FileImage :size="15" aria-hidden="true" />
      </RibbonIconAction>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../styles/ribbon-groups" as ribbon;

.home-automation-group {
  @include ribbon.mixed(max-content max-content max-content);

  &__quick-tools,
  &__generate-icon,
  &__grid {
    grid-row: 1 / 3;
  }

  &__quick-tools {
    grid-column: 1;
  }

  &__generate-icon {
    grid-column: 2;
  }

  &__grid {
    display: grid;
    grid-column: 3;
    grid-template-columns: repeat(2, minmax(94px, max-content));
    grid-template-rows: repeat(2, 27px);
    align-items: center;
    column-gap: 2px;

    [data-ribbon-row="1"] {
      grid-row: 1;
    }

    [data-ribbon-row="2"] {
      grid-row: 2;
    }

    [data-ribbon-column="1"] {
      grid-column: 1;
    }

    [data-ribbon-column="2"] {
      grid-column: 2;
    }
  }
}
</style>
