<script setup lang="ts">
import {
  ClipboardCheck,
  FileLock2,
  FileKey2,
  MessageSquareText,
  MessageSquarePlus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-vue-next";
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";

const props = withDefaults(
  defineProps<{
    busy: boolean;
    readOnly: boolean;
    hasNote: boolean;
    hasNotes: boolean;
    hasSelectedNotes?: boolean;
    showActiveNote: boolean;
    editSessionId?: string;
  }>(),
  { hasSelectedNotes: undefined, editSessionId: undefined },
);
const emit = defineEmits<{
  proofread: [];
  editNote: [];
  deleteNotes: [];
  previousNote: [];
  nextNote: [];
  toggleNote: [];
  toggleProtection: [];
}>();
const { t } = useAppI18n();
const canDeleteNotes = computed(() => props.hasSelectedNotes ?? props.hasNote);
const noteActionLabel = computed(() => t(props.hasNote ? "review.editNote" : "review.newNote"));
const notesVisibilityLabel = computed(() =>
  t(props.hasNote && props.showActiveNote ? "review.hideNotes" : "review.showNotes"),
);
const protectionLabel = computed(() =>
  t(props.readOnly ? "review.unprotectSheet" : "review.protectSheet"),
);
</script>

<template>
  <RibbonToolbar
    class="review-toolbar"
    :label="t('review.title')"
    :data-cell-edit-session="editSessionId"
  >
    <section
      class="review-toolbar__group"
      role="group"
      data-ribbon-group="review-proofreading"
      :aria-label="t('review.groupProofreading')"
    >
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :label="t('review.proofread')"
        :text="t('review.proofread')"
        data-review-action="proofread"
        @activate="emit('proofread')"
        ><ClipboardCheck
      /></RibbonButton>
    </section>
    <section
      class="review-toolbar__group"
      role="group"
      data-ribbon-group="review-notes"
      :aria-label="t('review.groupNotes')"
    >
      <RibbonButton
        variant="tall"
        :disabled="busy || readOnly"
        :label="noteActionLabel"
        :text="noteActionLabel"
        data-review-action="edit-note"
        @activate="emit('editNote')"
        ><Pencil v-if="hasNote" /><MessageSquarePlus v-else
      /></RibbonButton>
      <RibbonButton
        variant="tall"
        :disabled="busy || readOnly || !canDeleteNotes"
        :label="t('review.deleteNotes')"
        :text="t('review.deleteNotes')"
        data-review-action="delete-notes"
        @activate="emit('deleteNotes')"
        ><Trash2
      /></RibbonButton>
      <div class="review-toolbar__stack">
        <RibbonButton
          :disabled="busy || !hasNotes"
          :label="t('review.previousNote')"
          :text="t('review.previousNote')"
          data-review-action="previous-note"
          @activate="emit('previousNote')"
          ><ChevronUp
        /></RibbonButton>
        <RibbonButton
          :disabled="busy || !hasNotes"
          :label="t('review.nextNote')"
          :text="t('review.nextNote')"
          data-review-action="next-note"
          @activate="emit('nextNote')"
          ><ChevronDown
        /></RibbonButton>
      </div>
      <RibbonButton
        variant="tall"
        :disabled="busy || !hasNote"
        :pressed="hasNote && showActiveNote"
        :label="notesVisibilityLabel"
        :text="notesVisibilityLabel"
        data-review-action="toggle-note"
        @activate="emit('toggleNote')"
        ><MessageSquareText
      /></RibbonButton>
    </section>
    <section
      class="review-toolbar__group"
      role="group"
      data-ribbon-group="review-protection"
      :aria-label="t('review.groupProtection')"
    >
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :pressed="readOnly"
        :label="protectionLabel"
        :text="protectionLabel"
        :aria-description="t('review.protectionHint')"
        data-review-action="toggle-protection"
        @activate="emit('toggleProtection')"
        ><FileKey2 v-if="readOnly" /><FileLock2 v-else
      /></RibbonButton>
    </section>
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.review-toolbar {
  &__group {
    @include ribbon.columns;
  }

  &__stack {
    @include ribbon.stack;
  }
}
</style>
