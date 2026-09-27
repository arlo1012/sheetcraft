<script setup lang="ts">
import { ref, watch } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";

const props = defineProps<{
  addressLabel: string;
}>();

const emit = defineEmits<{
  navigate: [address: string];
}>();

const { t } = useAppI18n();
const input = ref<{ blur(): void }>();
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

function onUpdate(value: string | number): void {
  draft.value = String(value).toUpperCase();
}

function onFocus(_value: string | number, context: { e: FocusEvent }): void {
  isFocused.value = true;
  (context.e.target as HTMLInputElement).select();
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

function onEnter(_value: string | number, context: { e: KeyboardEvent }): void {
  const { e: event } = context;
  event.preventDefault();
  submit();
}

function onKeydown(_value: string | number, context: { e: KeyboardEvent }): void {
  const { e: event } = context;
  if (event.key === "Escape") {
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
      <TInput
        ref="input"
        class="workbook-formula-bar__address-input"
        :value="draft"
        align="center"
        type="text"
        autocomplete="off"
        :spell-check="false"
        v-native-control="{
          attributes: {
            'aria-label': t('formulaBar.cellAddress'),
            'data-address-input': '',
          },
        }"
        @update:value="onUpdate"
        @focus="onFocus"
        @blur="onBlur"
        @enter="onEnter"
        @keydown="onKeydown"
      />
    </label>
  </form>
</template>

<style scoped lang="scss">
.workbook-formula-bar__address {
  min-width: 0;
  height: 100%;
  margin: 0;
}

.workbook-formula-bar__field {
  display: block;
  min-width: 0;
  height: 100%;
  margin: 0;
}

.workbook-formula-bar__address-input {
  width: 100%;
}
</style>
