<script setup lang="ts">
import { ref, useId } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../../shared/i18n";
import type { HyperlinkDraft, HyperlinkInput } from "../useHyperlinksController";

const props = defineProps<{ draft: HyperlinkDraft; error?: string }>();
const emit = defineEmits<{ confirm: [value: HyperlinkInput]; remove: []; cancel: [] }>();
const { t } = useAppI18n();
const id = useId();
const displayText = ref(props.draft.displayText);
const target = ref(props.draft.target);
const tooltip = ref(props.draft.tooltip);
</script>

<template>
  <Dialog
    :visible="true"
    :header="t(draft.hasLink ? 'hyperlinks.edit' : 'hyperlinks.insert')"
    :confirm-btn="{ content: t('hyperlinks.confirm'), disabled: !target.trim() }"
    :cancel-btn="t('hyperlinks.cancel')"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    width="min(520px, calc(100vw - 32px))"
    placement="center"
    @confirm="emit('confirm', { target, tooltip, displayText })"
    @close="emit('cancel')"
  >
    <div class="hyperlink-dialog">
      <label :for="`${id}-text`">{{ t("hyperlinks.displayText") }}</label>
      <TInput
        :id="`${id}-text`"
        v-model="displayText"
        :disabled="!draft.canEditDisplay"
        data-hyperlink-text
      />
      <p v-if="!draft.canEditDisplay" class="hyperlink-dialog__hint">
        {{ t("hyperlinks.formulaTextHint") }}
      </p>
      <label :for="`${id}-target`">{{ t("hyperlinks.address") }}</label>
      <TInput :id="`${id}-target`" v-model="target" autofocus data-hyperlink-target />
      <p class="hyperlink-dialog__hint">{{ t("hyperlinks.addressHint") }}</p>
      <label :for="`${id}-tooltip`">{{ t("hyperlinks.tooltip") }}</label>
      <TInput :id="`${id}-tooltip`" v-model="tooltip" data-hyperlink-tooltip />
      <p v-if="error" class="hyperlink-dialog__error" role="alert">{{ error }}</p>
      <TButton
        v-if="draft.hasLink"
        class="hyperlink-dialog__remove"
        theme="default"
        variant="outline"
        @click="emit('remove')"
        >{{ t("hyperlinks.remove") }}</TButton
      >
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.hyperlink-dialog {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  &__hint,
  &__error {
    grid-column: 2;
    margin: 0;
  }
  &__hint {
    color: var(--idea-text-secondary);
  }
  &__error {
    color: var(--idea-status-error);
  }
  &__remove {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
