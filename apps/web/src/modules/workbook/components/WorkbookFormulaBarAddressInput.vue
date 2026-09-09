<script setup lang="ts">
import { ref, watch } from "vue";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  addressLabel: string;
}>();

const emit = defineEmits<{
  navigate: [address: string];
}>();

const { t } = useAppI18n();
const input = ref<HTMLInputElement>();
const draft = ref(props.addressLabel);
const isFocused = ref(false);

watch(
  () => props.addressLabel,
  (address) => {
    if (!isFocused.value) {
      draft.value = address;
    }
  },
);

function reset(): void {
  draft.value = props.addressLabel;
}

function onInput(event: Event): void {
  draft.value = (event.target as HTMLInputElement).value.toUpperCase();
}

function onFocus(event: FocusEvent): void {
  isFocused.value = true;
  (event.target as HTMLInputElement).select();
}

function onBlur(): void {
  isFocused.value = false;
  reset();
}

function submit(): void {
  emit("navigate", draft.value.trim().toUpperCase());
  reset();
  input.value?.blur();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    submit();
  } else if (event.key === "Escape") {
    event.preventDefault();
    reset();
    input.value?.blur();
  }
}
</script>

<template>
  <form
    class="workbook-formula-bar__address"
    :aria-label="t('formulaBar.goToCell')"
    @submit.prevent="submit"
  >
    <label class="workbook-formula-bar__field">
      <span class="ui-visually-hidden">{{ t("formulaBar.cellAddress") }}</span>
      <input
        ref="input"
        class="workbook-formula-bar__address-input"
        :value="draft"
        type="text"
        autocomplete="off"
        :spellcheck="false"
        :aria-label="t('formulaBar.cellAddress')"
        data-address-input
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      />
    </label>
  </form>
</template>

<style scoped lang="scss">
.workbook-formula-bar__address,
.workbook-formula-bar__field {
  min-width: 0;
  height: 100%;
  margin: 0;
}

.workbook-formula-bar__address {
  padding: 4px 6px;
}

.workbook-formula-bar__field {
  display: block;
}

.workbook-formula-bar__address-input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  background: var(--idea-surface-panel);
  border: 1px solid transparent;
  border-radius: 2px;
  outline: none;
  color: var(--idea-text-primary);
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  text-align: center;

  &:focus {
    border-color: var(--idea-action-primary);
  }
}

@media (max-width: 520px) {
  .workbook-formula-bar__address {
    padding-right: 4px;
    padding-left: 4px;
  }
}
</style>
