<script setup lang="ts">
import { Printer } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";

const { t } = useAppI18n();
defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ print: [] }>();
</script>

<template>
  <section
    class="home-utility-group"
    data-ribbon-group="utility"
    role="group"
    :aria-label="t('ribbon.utilityTools')"
  >
    <RibbonButton
      variant="tall"
      :label="t('ribbon.print')"
      :text="t('ribbon.print')"
      :disabled="disabled"
      data-ribbon-layout="tall"
      data-ribbon-action="print"
      @activate="emit('print')"
      data-ribbon-span="2"
    >
      <Printer aria-hidden="true" />
    </RibbonButton>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.home-utility-group {
  @include ribbon.columns;

  padding-right: 6px;
  padding-left: 6px;
  border-right: 0;
}
</style>
