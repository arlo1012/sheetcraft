<script setup lang="ts">
import { ChevronDown, ChevronUp, Search } from "lucide-vue-next";
import { nextTick, ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { insertTextAtSelection } from "../../../shared/forms/text-selection";
import type { CellAddress } from "../workbook";

const props = defineProps<{
  address: CellAddress;
  addressLabel: string;
  inputValue: string;
  searchQuery: string;
}>();

const emit = defineEmits<{
  navigate: [address: string];
  commitCell: [payload: { address: CellAddress; input: string }];
  traverse: [payload: { address: CellAddress; direction: "up" | "down" }];
  updateSearchQuery: [query: string];
  find: [direction: "forward" | "backward"];
}>();

const { t } = useAppI18n();
const addressInput = ref<HTMLInputElement>();
const formulaInput = ref<HTMLTextAreaElement>();
const addressDraft = ref(props.addressLabel);
const formulaDraft = ref(props.inputValue);
const formulaSourceValue = ref(props.inputValue);
const formulaTarget = ref<CellAddress>({ ...props.address });
const formulaTargetLabel = ref(props.addressLabel);
const addressFocused = ref(false);
const formulaFocused = ref(false);
const isComposing = ref(false);

watch(
  () => props.addressLabel,
  (address) => {
    if (!addressFocused.value) {
      addressDraft.value = address;
    }
  },
);

watch(
  () => [props.address.row, props.address.column, props.inputValue] as const,
  () => {
    if (!formulaFocused.value) {
      syncFormulaFromProps();
    }
  },
);

function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function syncFormulaFromProps(): void {
  formulaTarget.value = { ...props.address };
  formulaTargetLabel.value = props.addressLabel;
  formulaSourceValue.value = props.inputValue;
  formulaDraft.value = props.inputValue;
}

function resetAddress(): void {
  addressDraft.value = props.addressLabel;
}

function onAddressInput(event: Event): void {
  addressDraft.value = readInputValue(event).toUpperCase();
}

function onAddressFocus(event: FocusEvent): void {
  addressFocused.value = true;
  (event.target as HTMLInputElement).select();
}

function onAddressBlur(): void {
  addressFocused.value = false;
  resetAddress();
}

function submitAddress(): void {
  emit("navigate", addressDraft.value.trim().toUpperCase());
  resetAddress();
  addressInput.value?.blur();
}

function onAddressKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    submitAddress();
  } else if (event.key === "Escape") {
    event.preventDefault();
    resetAddress();
    addressInput.value?.blur();
  }
}

function onFormulaFocus(): void {
  formulaFocused.value = true;
  formulaTarget.value = { ...props.address };
  formulaTargetLabel.value = props.addressLabel;
  formulaSourceValue.value = props.inputValue;
  formulaDraft.value = props.inputValue;
}

function onFormulaInput(event: Event): void {
  formulaDraft.value = readInputValue(event);
}

function commitFormulaDraft(): void {
  if (formulaDraft.value === formulaSourceValue.value) {
    return;
  }
  const payload = {
    address: { ...formulaTarget.value },
    input: formulaDraft.value,
  };
  formulaSourceValue.value = formulaDraft.value;
  emit("commitCell", payload);
}

function insertFormulaLineBreak(): void {
  const input = formulaInput.value;
  if (!input) {
    return;
  }
  const insertion = insertTextAtSelection(
    formulaDraft.value,
    input.selectionStart,
    input.selectionEnd,
    "\n",
  );
  formulaDraft.value = insertion.value;
  void nextTick(() => {
    input.setSelectionRange(insertion.caret, insertion.caret);
  });
}

function onFormulaKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" && event.altKey && !event.isComposing && !isComposing.value) {
    event.preventDefault();
    insertFormulaLineBreak();
  } else if (event.key === "Enter" && !event.isComposing && !isComposing.value) {
    event.preventDefault();
    commitFormulaDraft();
    emit("traverse", {
      address: { ...formulaTarget.value },
      direction: event.shiftKey ? "up" : "down",
    });
    formulaInput.value?.blur();
  } else if (event.key === "Escape") {
    event.preventDefault();
    formulaDraft.value = formulaSourceValue.value;
    formulaInput.value?.blur();
  }
}

function onFormulaBlur(): void {
  if (!isComposing.value) {
    commitFormulaDraft();
  }
  formulaFocused.value = false;
  void nextTick(syncFormulaFromProps);
}

function onSearchInput(event: Event): void {
  emit("updateSearchQuery", readInputValue(event));
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.isComposing) {
    return;
  }
  event.preventDefault();
  emit("find", event.shiftKey ? "backward" : "forward");
}
</script>

<template>
  <div
    class="workbook-formula-bar"
    role="group"
    :aria-label="t('formulaBar.label')"
    data-formula-bar
  >
    <form
      class="workbook-formula-bar__address"
      :aria-label="t('formulaBar.goToCell')"
      @submit.prevent="submitAddress"
    >
      <label class="workbook-formula-bar__field">
        <span class="ui-visually-hidden">{{ t("formulaBar.cellAddress") }}</span>
        <input
          ref="addressInput"
          class="workbook-formula-bar__address-input"
          :value="addressDraft"
          type="text"
          autocomplete="off"
          :spellcheck="false"
          :aria-label="t('formulaBar.cellAddress')"
          data-address-input
          @input="onAddressInput"
          @focus="onAddressFocus"
          @blur="onAddressBlur"
          @keydown="onAddressKeydown"
        />
      </label>
    </form>

    <span class="workbook-formula-bar__fx" aria-hidden="true">fx</span>

    <label class="workbook-formula-bar__field workbook-formula-bar__formula">
      <span class="ui-visually-hidden">
        {{
          t("formulaBar.editor", { address: formulaFocused ? formulaTargetLabel : addressLabel })
        }}
      </span>
      <textarea
        ref="formulaInput"
        class="workbook-formula-bar__formula-input"
        :value="formulaDraft"
        rows="1"
        wrap="off"
        autocomplete="off"
        :spellcheck="false"
        :aria-label="
          t('formulaBar.editor', { address: formulaFocused ? formulaTargetLabel : addressLabel })
        "
        aria-keyshortcuts="Alt+Enter"
        :placeholder="t('formulaBar.placeholder')"
        data-formula-input
        @input="onFormulaInput"
        @focus="onFormulaFocus"
        @blur="onFormulaBlur"
        @keydown="onFormulaKeydown"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
      />
    </label>

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
          @input="onSearchInput"
          @keydown="onSearchKeydown"
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
  </div>
</template>

<style scoped lang="scss">
.workbook-formula-bar {
  display: grid;
  grid-template-columns: 104px 30px minmax(120px, 1fr) minmax(210px, 300px);
  align-items: center;
  min-width: 0;
  height: 34px;
  background: var(--td-bg-color-secondarycontainer);
  border-bottom: 1px solid var(--td-component-border);

  &__address,
  &__field,
  &__formula {
    min-width: 0;
    height: 100%;
    margin: 0;
  }

  &__field {
    display: block;
  }

  &__address {
    padding: 4px 6px;
  }

  &__address-input,
  &__formula-input,
  &__search-input {
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 8px;
    background: var(--td-bg-color-container);
    border: 1px solid transparent;
    border-radius: 2px;
    outline: none;
    color: var(--td-text-color-primary);
    font-size: 12px;
    letter-spacing: 0;

    &:focus {
      border-color: var(--td-brand-color);
    }
  }

  &__address-input {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  &__fx {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    border-right: 1px solid var(--td-component-border);
    color: var(--td-text-color-placeholder);
    font-family: Georgia, serif;
    font-size: 14px;
    font-style: italic;
  }

  &__formula {
    padding: 4px 6px;
  }

  &__formula-input {
    overflow: auto;
    scrollbar-width: none;
    line-height: 18px;
    resize: none;
    white-space: pre;

    &::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
  }

  &__search {
    display: grid;
    grid-template-columns: 14px minmax(64px, 1fr) 24px 24px;
    align-items: center;
    gap: 2px;
    min-width: 0;
    height: 100%;
    padding: 4px 6px 4px 4px;
    border-left: 1px solid var(--td-component-border);
    color: var(--td-text-color-placeholder);
  }

  &__search-field {
    overflow: hidden;
  }

  &__search-input {
    padding-right: 6px;
    padding-left: 6px;

    &::-webkit-search-cancel-button {
      display: none;
    }
  }

  &__search-action {
    display: inline-grid;
    width: 24px;
    height: 24px;
    place-items: center;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--td-text-color-secondary);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background: var(--td-bg-color-container-hover);
      border-color: var(--td-component-border);
      outline: none;
    }
  }

  @media (max-width: 520px) {
    grid-template-columns: 72px 24px minmax(64px, 1fr) 128px;

    &__address {
      padding-right: 4px;
      padding-left: 4px;
    }

    &__formula {
      padding-right: 4px;
      padding-left: 4px;
    }

    &__search {
      grid-template-columns: minmax(64px, 1fr) 24px 24px;
      padding-right: 2px;
      padding-left: 2px;
    }

    &__search-icon {
      display: none;
    }
  }
}
</style>
