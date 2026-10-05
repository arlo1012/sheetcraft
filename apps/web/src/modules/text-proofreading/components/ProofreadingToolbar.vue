<script setup lang="ts">
import {
  ClipboardCheck,
  Files,
  FilePlus2,
  FileWarning,
  BookOpen,
  Headphones,
  Settings,
  SquareX,
} from "lucide-vue-next";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { useWordProofreading } from "../useWordProofreading";
defineProps<{ busy: boolean }>();
const emit = defineEmits<{
  open: [panel: NonNullable<ReturnType<typeof useWordProofreading>["panel"]["value"]>];
  close: [];
}>();
const { t } = useAppI18n();
</script>
<template>
  <RibbonToolbar :label="t('wordProof.title')">
    <section class="word-toolbar__group" role="group" :aria-label="t('wordProof.title')">
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('wordProof.general')"
        :text="t('wordProof.general')"
        @activate="emit('open', 'general')"
        ><ClipboardCheck
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('wordProof.batch')"
        :text="t('wordProof.batch')"
        @activate="emit('open', 'batch')"
        ><Files
      /></RibbonButton>
    </section>
    <section class="word-toolbar__group" role="group" :aria-label="t('wordProof.dictionary')">
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('wordProof.accepted')"
        :text="t('wordProof.accepted')"
        @activate="emit('open', 'accepted')"
        ><FilePlus2
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('wordProof.mistake')"
        :text="t('wordProof.mistake')"
        @activate="emit('open', 'mistake')"
        ><FileWarning
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('wordProof.dictionary')"
        :text="t('wordProof.dictionary')"
        @activate="emit('open', 'dictionary')"
        ><BookOpen
      /></RibbonButton>
    </section>
    <section class="word-toolbar__group" role="group" :aria-label="t('wordProof.settings')">
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('wordProof.feedback')"
        :text="t('wordProof.feedback')"
        @activate="emit('open', 'feedback')"
        ><Headphones
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('wordProof.settings')"
        :text="t('wordProof.settings')"
        @activate="emit('open', 'settings')"
        ><Settings
      /></RibbonButton>
    </section>
    <RibbonButton
      variant="tall"
      :label="t('wordProof.close')"
      :text="t('wordProof.close')"
      @activate="emit('close')"
      ><SquareX
    /></RibbonButton>
  </RibbonToolbar>
</template>
<style scoped lang="scss">
.word-toolbar__group {
  display: flex;
  gap: 2px;
  padding-inline: 8px;
  border-right: 1px solid var(--td-component-border);
}
</style>
