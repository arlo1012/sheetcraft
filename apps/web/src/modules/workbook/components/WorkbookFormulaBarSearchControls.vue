<script setup lang="ts">
import { ChevronDown, ChevronUp, Search } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";

defineProps<{
  searchQuery: string;
}>();

const emit = defineEmits<{
  updateSearchQuery: [query: string];
  find: [direction: "forward" | "backward"];
}>();

const { t } = useAppI18n();

function onInput(event: Event): void {
  emit("updateSearchQuery", (event.target as HTMLInputElement).value);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.isComposing) {
    return;
  }
  event.preventDefault();
  emit("find", event.shiftKey ? "backward" : "forward");
}
</script>

<template>
  <div class="workbook-formula-bar__search" role="search">
    <Search class="workbook-formula-bar__search-icon" :size="14" aria-hidden="true" />
    <label class="workbook-formula-bar__field workbook-formula-bar__search-field">
      <span class="ui-visually-hidden">{{ t("navigation.findInSheet") }}</span>
      <input
        class="workbook-formula-bar__search-input"
        :value="searchQuery"
        type="search"
        autocomplete="off"
        :spellcheck="false"
        :aria-label="t('navigation.findInSheet')"
        :placeholder="t('navigation.findPlaceholder')"
        data-search-input
        @input="onInput"
        @keydown="onKeydown"
      />
    </label>
    <button
      class="workbook-formula-bar__search-action"
      type="button"
      :aria-label="t('navigation.findPrevious')"
      :title="t('navigation.findPrevious')"
      @click="emit('find', 'backward')"
    >
      <ChevronUp :size="15" aria-hidden="true" />
    </button>
    <button
      class="workbook-formula-bar__search-action"
      type="button"
      :aria-label="t('navigation.findNext')"
      :title="t('navigation.findNext')"
      @click="emit('find', 'forward')"
    >
      <ChevronDown :size="15" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.workbook-formula-bar__search {
  display: grid;
  grid-template-columns: 14px minmax(64px, 1fr) 24px 24px;
  align-items: center;
  gap: 2px;
  min-width: 0;
  height: 100%;
  padding: 4px 6px 4px 4px;
  border-left: 1px solid var(--idea-border-control);
  color: var(--idea-text-muted);
}

.workbook-formula-bar__field {
  display: block;
  min-width: 0;
  height: 100%;
  margin: 0;
}

.workbook-formula-bar__search-field {
  overflow: hidden;
}

.workbook-formula-bar__search-input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 6px;
  background: var(--idea-surface-panel);
  border: 1px solid transparent;
  border-radius: 2px;
  outline: none;
  color: var(--idea-text-primary);
  font-size: 12px;
  letter-spacing: 0;

  &:focus {
    border-color: var(--idea-action-primary);
  }

  &::-webkit-search-cancel-button {
    display: none;
  }
}

.workbook-formula-bar__search-action {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--idea-text-secondary);
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--idea-surface-hover);
    border-color: var(--idea-border-control);
    outline: none;
  }
}

@media (max-width: 520px) {
  .workbook-formula-bar__search {
    grid-template-columns: minmax(64px, 1fr) 24px 24px;
    padding-right: 2px;
    padding-left: 2px;
  }

  .workbook-formula-bar__search-icon {
    display: none;
  }
}
</style>
