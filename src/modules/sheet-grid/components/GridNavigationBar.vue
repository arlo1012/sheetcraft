<script setup lang="ts">
import { ChevronDown, ChevronUp, Search } from "lucide-vue-next";
import { ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";

const { t } = useAppI18n();

const props = defineProps<{
  address: string;
  searchQuery: string;
  searchFeedback?: string;
}>();

const emit = defineEmits<{
  navigate: [address: string];
  updateSearchQuery: [query: string];
  find: [direction: "forward" | "backward"];
}>();

const addressDraft = ref(props.address);

watch(
  () => props.address,
  (address) => {
    addressDraft.value = address;
  },
);

function submitAddress(): void {
  emit("navigate", addressDraft.value);
}
</script>

<template>
  <div class="grid-navigation-bar" :aria-label="t('navigation.sheet')">
    <form
      class="grid-navigation-bar__address"
      :aria-label="t('navigation.goToCell')"
      @submit.prevent="submitAddress"
    >
      <input
        v-model="addressDraft"
        :aria-label="t('navigation.cellAddress')"
        autocomplete="off"
        spellcheck="false"
        @blur="addressDraft = address"
        @keydown.escape="addressDraft = address"
      />
    </form>

    <div class="grid-navigation-bar__divider" aria-hidden="true" />

    <div class="grid-navigation-bar__search" role="search">
      <Search :size="15" aria-hidden="true" />
      <input
        :value="searchQuery"
        :aria-label="t('navigation.findInSheet')"
        autocomplete="off"
        :placeholder="t('navigation.findPlaceholder')"
        spellcheck="false"
        @input="emit('updateSearchQuery', ($event.target as HTMLInputElement).value)"
        @keydown.enter.prevent="emit('find', $event.shiftKey ? 'backward' : 'forward')"
      />
      <span class="grid-navigation-bar__feedback" aria-live="polite">{{ searchFeedback }}</span>
      <button
        type="button"
        :aria-label="t('navigation.findPrevious')"
        :title="t('navigation.findPrevious')"
        @click="emit('find', 'backward')"
      >
        <ChevronUp :size="15" aria-hidden="true" />
      </button>
      <button
        type="button"
        :aria-label="t('navigation.findNext')"
        :title="t('navigation.findNext')"
        @click="emit('find', 'forward')"
      >
        <ChevronDown :size="15" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.grid-navigation-bar {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 34px;
  padding: 0 8px;
  background: var(--ui-surface-muted);
  border-bottom: 1px solid var(--ui-border-strong);

  input {
    height: 26px;
    min-width: 0;
    padding: 0 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--ui-text-primary);
    font: inherit;
    letter-spacing: 0;
    outline: none;

    &:hover {
      border-color: var(--ui-border-default);
    }

    &:focus {
      background: var(--ui-surface-primary);
      border-color: var(--ui-brand-primary);
    }
  }

  &__address {
    flex: 0 0 92px;

    input {
      width: 100%;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      box-sizing: border-box;
    }
  }

  &__divider {
    width: 1px;
    height: 20px;
    margin: 0 8px;
    background: var(--ui-border-default);
  }

  &__search {
    display: flex;
    align-items: center;
    min-width: 0;
    color: var(--ui-text-muted);

    input {
      width: min(220px, 28vw);
      font-size: 12px;
    }

    button {
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      padding: 0;
      background: transparent;
      border: 0;
      border-radius: 3px;
      color: var(--ui-text-secondary);
      cursor: pointer;

      &:hover {
        background: var(--ui-surface-primary);
        color: var(--ui-text-primary);
      }

      &:focus-visible {
        outline: 2px solid var(--ui-brand-primary);
        outline-offset: -2px;
      }
    }
  }

  &__feedback {
    min-width: 64px;
    padding: 0 6px;
    color: var(--ui-text-muted);
    font-size: 11px;
    white-space: nowrap;
  }
}
</style>
