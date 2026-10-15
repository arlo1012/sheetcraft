<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { Radical } from "lucide-vue-next";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import EquationContent from "../components/EquationContent.vue";
import { EQUATION_PRESETS, type EquationLocale, type EquationPresetId } from "./equation-catalog";
import en from "./equation-messages.en-US";
import zh from "./equation-messages.zh-CN";
const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    ownerId?: string | number;
    editSessionId?: string;
    locale?: EquationLocale;
    handler: (
      presetId: EquationPresetId | null,
    ) => boolean | { accepted: boolean } | Promise<boolean | { accepted: boolean }>;
  }>(),
  { disabled: false, locale: "en-US" },
);
const labels = computed(() => (props.locale === "zh-CN" ? zh : en));
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `equation-insert-${useId().replaceAll(":", "")}`;
const pending = ref(false);
const showPending = ref(false);
const failure = ref(false);
const generation = ref(0);
watch(
  pending,
  (value, _previous, onCleanup) => {
    showPending.value = false;
    if (!value) return;
    const timer = setTimeout(() => (showPending.value = true), 150);
    onCleanup(() => clearTimeout(timer));
  },
  { flush: "sync" },
);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
  onOpen() {
    generation.value++;
    failure.value = false;
  },
  onDismiss() {
    generation.value++;
    pending.value = false;
  },
});
// Captured callbacks belong to the menu generation, owner, handler and edit session.
const select = computed(() => {
  void open.value;
  const token = generation.value,
    handler = props.handler,
    owner = props.ownerId,
    session = props.editSessionId;
  return async (presetId: EquationPresetId | null) => {
    const valid = () =>
      open.value &&
      token === generation.value &&
      handler === props.handler &&
      owner === props.ownerId &&
      session === props.editSessionId &&
      !props.disabled;
    if (!valid() || pending.value) return;
    pending.value = true;
    failure.value = false;
    let accepted = false;
    try {
      const result = await handler(presetId);
      accepted =
        result === true ||
        (typeof result === "object" && result !== null && result.accepted === true);
    } catch {
      /* Keep current gallery for a retry. */
    }
    if (!valid()) return;
    pending.value = false;
    if (accepted) dismiss("programmatic", false);
    else failure.value = true;
  };
});
const presets = computed(() => {
  const captured = select.value;
  return EQUATION_PRESETS.map((choice) => ({
    ...choice,
    select: () => {
      void captured(choice.id);
    },
  }));
});
const selectNew = computed(() => {
  const captured = select.value;
  return () => {
    void captured(null);
  };
});
watch(
  () => [props.handler, props.ownerId, props.editSessionId, props.disabled, props.locale] as const,
  () => {
    generation.value++;
    pending.value = false;
    failure.value = false;
    dismiss("programmatic", false);
  },
  { flush: "sync" },
);
onBeforeUnmount(() => generation.value++);
</script>
<template>
  <span class="equation-insert-tool" :data-cell-edit-session="editSessionId">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="labels.equation"
      :text="labels.equation"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-insert-tool="equation"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Radical aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="equation-insert-menu"
        :style="floatingStyles"
        :label="labels.equation"
        :aria-busy="pending"
        :data-cell-edit-session="editSessionId"
      >
        <template #body>
          <GallerySection :title="labels.presets">
            <div class="equation-insert-menu__presets">
              <button
                v-for="choice in presets"
                :key="choice.id"
                type="button"
                role="menuitem"
                tabindex="-1"
                class="equation-insert-menu__choice"
                :data-equation-preset="choice.id"
                :disabled="disabled || pending"
                :aria-disabled="disabled || pending"
                :aria-label="choice.label[locale]"
                @click="choice.select"
              >
                <span class="equation-insert-menu__label">{{ choice.label[locale] }}</span>
                <span class="equation-insert-menu__preview" aria-hidden="true"
                  ><EquationContent :source="choice.source"
                /></span>
              </button>
            </div>
          </GallerySection>
        </template>
        <template #footer>
          <MenuItem :disabled="disabled || pending" data-equation-new @select="selectNew">{{
            labels.newEquation
          }}</MenuItem>
          <li
            v-if="showPending"
            class="equation-insert-menu__status"
            role="status"
            aria-live="polite"
          >
            {{ labels.applying }}
          </li>
          <p v-if="failure" class="equation-insert-menu__error" role="alert">{{ labels.failed }}</p>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
@use "../../../shared/gallery/gallery-choice" as gallery;
.equation-insert-tool {
  @include ribbon.tool;
}
.equation-insert-menu {
  width: 400px;
  max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
  max-height: min(660px, calc(100dvh - var(--sheetcraft-space-4) * 2));
  z-index: var(--sheetcraft-layer-menu);
  &__presets {
    display: grid;
    gap: var(--sheetcraft-space-2);
  }
  &__choice {
    @include gallery.choice(6px);
    display: grid;
    width: 100%;
    gap: var(--sheetcraft-space-2);
    text-align: left;
  }
  &__label {
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
    white-space: nowrap;
  }
  &__preview {
    min-height: 54px;
    overflow: hidden;
    font-size: 14px;
  }
  &__status,
  &__error {
    margin: 0;
    padding: var(--sheetcraft-space-2) var(--sheetcraft-menu-item-padding-inline, 14px);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
  &__status {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
