<script setup lang="ts">
import {
  ClipboardCheck,
  LockKeyhole,
  SquarePen,
  BookLock,
  FileLock2,
  FileKey2,
  MessageSquarePlus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-vue-next";
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import NoteResetMenu from "./NoteResetMenu.vue";
import NoteVisibilityMenu from "./NoteVisibilityMenu.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";

const props = withDefaults(
  defineProps<{
    busy: boolean;
    canLockCells?: boolean;
    lockedState?: boolean | "mixed";
    structureProtected?: boolean;
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
  showAllNotes: [];
  hideAllNotes: [];
  resetNoteBox: [mode: "position" | "size" | "all"];
  toggleProtection: [];
  toggleCellsLock: [];
  editableRanges: [];
  toggleWorkbookProtection: [];
}>();
const { t } = useAppI18n();
const canDeleteNotes = computed(() => props.hasSelectedNotes ?? props.hasNote);
const noteActionLabel = computed(() => t(props.hasNote ? "review.editNote" : "review.newNote"));
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
      <div class="review-toolbar__stack">
        <NoteResetMenu
          :disabled="busy || readOnly || !hasNote"
          @reset="emit('resetNoteBox', $event)"
        />
        <NoteVisibilityMenu
          :disabled="busy || !hasNotes"
          :has-note="hasNote"
          :show-active-note="showActiveNote"
          @toggle="emit('toggleNote')"
          @show-all="emit('showAllNotes')"
          @hide-all="emit('hideAllNotes')"
        />
      </div>
    </section>
    <section
      class="review-toolbar__group"
      role="group"
      data-ribbon-group="review-protection"
      :aria-label="t('review.groupProtection')"
    >
      <div class="review-toolbar__stack">
        <RibbonButton
          :disabled="!canLockCells"
          :pressed="lockedState"
          :label="t(lockedState === true ? 'review.unlockCells' : 'review.lockCells')"
          :text="t('review.lockCells')"
          data-review-action="lock-cells"
          @activate="emit('toggleCellsLock')"
          ><LockKeyhole
        /></RibbonButton>
        <RibbonButton
          :disabled="busy || readOnly"
          :label="t('review.editableRanges')"
          :text="t('review.editableRanges')"
          data-review-action="editable-ranges"
          @activate="emit('editableRanges')"
          ><SquarePen
        /></RibbonButton>
      </div>
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
      <RibbonButton
        variant="tall"
        :disabled="busy"
        :pressed="structureProtected"
        :label="t(structureProtected ? 'review.unprotectWorkbook' : 'review.protectWorkbook')"
        :text="t(structureProtected ? 'review.unprotectWorkbook' : 'review.protectWorkbook')"
        data-review-action="protect-workbook"
        @activate="emit('toggleWorkbookProtection')"
        ><BookLock
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
