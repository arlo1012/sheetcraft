<script setup lang="ts">
import { ChevronDown, ChevronUp, Search } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Input as TInput } from "tdesign-vue-next/es/input";
import type { InputValue } from "tdesign-vue-next/es/input/type";
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

function submitAddressFromInput(_value: InputValue, context: { e: KeyboardEvent }): void {
  context.e.preventDefault();
  submitAddress();
}

function updateAddressDraft(value: InputValue): void {
  addressDraft.value = String(value).toUpperCase();
}

function onAddressKeydown(_value: InputValue, context: { e: KeyboardEvent }): void {
  if (context.e.key === "Escape") {
    addressDraft.value = props.address;
  }
}

function updateSearch(value: InputValue): void {
  emit("updateSearchQuery", String(value));
}

function findFromSearch(_value: InputValue, context: { e: KeyboardEvent }): void {
  emit("find", context.e.shiftKey ? "backward" : "forward");
}
</script>

<template>
  <div class="grid-navigation-bar" :aria-label="t('navigation.sheet')">
    <form
      class="grid-navigation-bar__address"
      :aria-label="t('navigation.goToCell')"
      @submit.prevent="submitAddress"
    >
      <label class="grid-navigation-bar__address-control">
        <span class="ui-visually-hidden">{{ t("navigation.cellAddress") }}</span>
        <TInput
          class="grid-navigation-bar__address-input"
          size="small"
          :model-value="addressDraft"
          autocomplete="off"
          :spell-check="false"
          @change="updateAddressDraft"
          @blur="addressDraft = address"
          @enter="submitAddressFromInput"
          @keydown="onAddressKeydown"
        />
      </label>
    </form>

    <div class="grid-navigation-bar__divider" aria-hidden="true" />

    <div class="grid-navigation-bar__search" role="search">
      <Search :size="15" aria-hidden="true" />
      <label class="grid-navigation-bar__search-control">
        <span class="ui-visually-hidden">{{ t("navigation.findInSheet") }}</span>
        <TInput
          class="grid-navigation-bar__search-input"
          size="small"
          :model-value="searchQuery"
          autocomplete="off"
          :placeholder="t('navigation.findPlaceholder')"
          :spell-check="false"
          @change="updateSearch"
          @enter="findFromSearch"
        />
      </label>
      <span class="grid-navigation-bar__feedback" aria-live="polite">{{ searchFeedback }}</span>
      <TButton
        type="button"
        variant="text"
        shape="square"
        size="small"
        class="grid-navigation-bar__search-button"
        :aria-label="t('navigation.findPrevious')"
        :title="t('navigation.findPrevious')"
        @click="emit('find', 'backward')"
      >
        <template #icon>
          <ChevronUp :size="15" aria-hidden="true" />
        </template>
      </TButton>
      <TButton
        type="button"
        variant="text"
        shape="square"
        size="small"
        class="grid-navigation-bar__search-button"
        :aria-label="t('navigation.findNext')"
        :title="t('navigation.findNext')"
        @click="emit('find', 'forward')"
      >
        <template #icon>
          <ChevronDown :size="15" aria-hidden="true" />
        </template>
      </TButton>
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

  &__address {
    flex: 0 0 92px;
  }

  &__address-control,
  &__search-control {
    display: block;
    min-width: 0;
  }

  &__address-input {
    width: 100%;
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
  }

  &__search-control {
    width: min(220px, 28vw);
  }

  &__search-input {
    width: 100%;
  }

  &__search-button {
    flex: 0 0 auto;
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
