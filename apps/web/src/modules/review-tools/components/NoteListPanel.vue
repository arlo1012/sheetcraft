<script setup lang="ts">
import { MessageSquareText, Pencil, Trash2, X } from "lucide-vue-next";
import { vIconAction } from "../../../shared/focus/icon-action";
import { useAppI18n } from "../../../shared/i18n";

export type ReviewNoteListItem = {
  address: string;
  row: number;
  column: number;
  text: string;
  author?: string;
};

defineProps<{
  notes: readonly ReviewNoteListItem[];
  activeAddress: string;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  navigate: [target: { row: number; column: number }];
  edit: [target: { row: number; column: number }];
  delete: [target: { row: number; column: number }];
  close: [];
}>();
const { t } = useAppI18n();
</script>

<template>
  <aside class="note-list-panel" :aria-label="t('review.notesTitle')">
    <header class="note-list-panel__header">
      <h2>{{ t("review.notesTitle") }}</h2>
      <button
        v-icon-action
        type="button"
        :aria-label="t('review.close')"
        :title="t('review.close')"
        @click="emit('close')"
      >
        <X :size="16" />
      </button>
    </header>
    <p v-if="!notes.length" class="note-list-panel__empty">{{ t("review.noNotes") }}</p>
    <ol v-else class="note-list-panel__items">
      <li
        v-for="note in notes"
        :key="`${note.row}:${note.column}`"
        class="note-list-panel__item"
        :class="{ 'is-active': note.address === activeAddress }"
      >
        <button
          type="button"
          class="note-list-panel__navigate"
          :aria-current="note.address === activeAddress ? 'true' : undefined"
          @click="emit('navigate', { row: note.row, column: note.column })"
        >
          <MessageSquareText :size="16" aria-hidden="true" />
          <span class="note-list-panel__meta">
            <strong>{{ note.address }}</strong>
            <span>{{ note.author || t("review.anonymous") }}</span>
          </span>
        </button>
        <p>{{ note.text }}</p>
        <div v-if="!readOnly" class="note-list-panel__actions">
          <button
            v-icon-action
            type="button"
            :aria-label="t('review.edit')"
            :title="t('review.edit')"
            @click="emit('edit', { row: note.row, column: note.column })"
          >
            <Pencil :size="15" />
          </button>
          <button
            v-icon-action
            type="button"
            :aria-label="t('review.delete')"
            :title="t('review.delete')"
            @click="emit('delete', { row: note.row, column: note.column })"
          >
            <Trash2 :size="15" />
          </button>
        </div>
      </li>
    </ol>
  </aside>
</template>

<style scoped lang="scss">
.note-list-panel {
  display: flex;
  flex-direction: column;
  flex: 0 0 min(320px, 100vw);
  min-width: 248px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  border-left: 1px solid var(--idea-border-subtle);
  background: var(--idea-surface-panel);
  font-size: 12px;
  line-height: 20px;

  &__header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    min-height: 42px;
    padding: 0 10px 0 14px;
    border-bottom: 1px solid var(--idea-border-subtle);

    h2 {
      margin: 0;
      font-size: 14px;
      line-height: 22px;
      font-weight: 600;
    }
  }

  &__header button,
  &__actions button {
    display: inline-grid;
    width: 28px;
    height: 28px;
    padding: 0;
    color: var(--idea-text-secondary);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: 4px;
    place-items: center;

    &:hover {
      color: var(--idea-text-primary);
      background: var(--idea-surface-hover);
    }
  }

  &__empty {
    padding: 18px 14px;
    margin: 0;
    color: var(--idea-text-secondary);
  }

  &__items {
    display: grid;
    flex: 1 1 auto;
    align-content: start;
    gap: 1px;
    min-height: 0;
    padding: 0;
    margin: 0;
    overflow: auto;
    list-style: none;
  }

  &__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: start;
    gap: 6px;
    padding: 10px 10px 10px 14px;
    border-bottom: 1px solid var(--idea-border-subtle);

    &.is-active {
      background: var(--idea-surface-hover);
      box-shadow: inset 3px 0 var(--idea-text-link);
    }

    p {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--idea-text-secondary);
      font-size: 12px;
      line-height: 20px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  &__navigate {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    padding: 0;
    color: inherit;
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;

    svg {
      flex: 0 0 auto;
      margin-top: 2px;
      color: var(--idea-text-link);
    }
  }

  &__meta {
    display: grid;
    min-width: 0;
    gap: 2px;

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: var(--idea-text-secondary);
      font-size: 12px;
      line-height: 18px;
    }
  }

  &__actions {
    display: flex;
    grid-row: 1;
    grid-column: 2;
    align-self: start;
    gap: 2px;
  }
}
</style>
