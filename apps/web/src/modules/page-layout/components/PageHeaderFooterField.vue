<script setup lang="ts">
import { computed, ref } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  value: string;
  section: "header" | "footer";
  part: "left" | "center" | "right";
  pageNumber?: number;
  pageCount: number;
  sheetName: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ change: [value: string] }>();
const { t } = useAppI18n();
const editing = ref(false);
const draft = ref("");
const text = computed(() =>
  editing.value
    ? draft.value
    : props.value.replace(/&&|&[PNA]/g, (token) => {
        if (token === "&&") return "&";
        if (token === "&P") return props.pageNumber === undefined ? "" : String(props.pageNumber);
        if (token === "&N") return String(props.pageCount);
        return props.sheetName;
      }),
);
const label = computed(() => {
  if (props.section === "header") {
    return t(
      props.part === "left"
        ? "pageLayout.headerLeft"
        : props.part === "center"
          ? "pageLayout.headerCenter"
          : "pageLayout.headerRight",
    );
  }
  return t(
    props.part === "left"
      ? "pageLayout.footerLeft"
      : props.part === "center"
        ? "pageLayout.footerCenter"
        : "pageLayout.footerRight",
  );
});
function focus(): void {
  draft.value = props.value;
  editing.value = true;
}
function finish(): void {
  if (!editing.value) return;
  editing.value = false;
  if (draft.value !== props.value) emit("change", draft.value);
}
function keydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== "Escape") return;
  event.preventDefault();
  if (event.key === "Escape") draft.value = props.value;
  (event.target as HTMLElement).blur();
}
</script>

<template>
  <label class="page-header-footer-field">
    <span class="ui-visually-hidden">{{ label }}</span>
    <TInput
      :model-value="text"
      :align="part"
      :disabled="disabled"
      :maxlength="1024"
      :aria-label="label"
      :title="label"
      :placeholder="
        part === 'center'
          ? t(section === 'header' ? 'pageLayout.addHeader' : 'pageLayout.addFooter')
          : ''
      "
      borderless
      data-page-header-footer
      :data-page-section="section"
      :data-page-part="part"
      @update:model-value="draft = String($event)"
      @focus="focus"
      @blur="finish"
      @enter="(_value, context) => keydown(context.e)"
      @keydown="(_value, context) => keydown(context.e)"
    />
  </label>
</template>

<style scoped lang="scss">
.page-header-footer-field {
  display: block;
  width: 100%;
  min-width: 0;
  background: transparent;
}
</style>
