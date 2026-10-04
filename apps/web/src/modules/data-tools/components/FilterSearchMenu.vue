<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { ChevronDown, Search } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
import type { FilterSearchOptions } from "../filter-value-options";

const props = defineProps<{ options: FilterSearchOptions; disabled?: boolean }>();
const emit = defineEmits<{ change: [options: FilterSearchOptions] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof TButton> | null>(null);
const triggerRef = computed<HTMLElement | null>(() => buttonRef.value?.$el ?? null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `filter-search-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => Boolean(props.disabled)),
  placement: "bottom-start",
  defaultFocus: "selected",
});
defineExpose({ rootElement: computed(() => surfaceRef.value?.rootElement ?? null) });

function change(options: Partial<FilterSearchOptions>): void {
  emit("change", { ...props.options, ...options });
  dismiss("programmatic", true);
}
</script>

<template>
  <TButton
    ref="buttonRef"
    class="filter-search-menu__trigger"
    role="button"
    variant="text"
    theme="default"
    size="small"
    :disabled="disabled"
    :aria-label="t('dataTools.filter.searchOptions')"
    :title="t('dataTools.filter.searchOptions')"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="menuId"
    @mousedown.stop.prevent
    @click.stop="toggleMenu"
    @keydown.enter.stop.prevent="toggleMenu()"
    @keydown.space.stop.prevent="toggleMenu()"
    @keydown="onTriggerKeydown"
  >
    <span class="filter-search-menu__icons" aria-hidden="true">
      <Search class="filter-search-menu__search-icon" />
      <ChevronDown class="filter-search-menu__arrow" :class="{ 'is-open': open }" />
    </span>
  </TButton>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="surfaceRef"
      class="filter-search-menu"
      :label="t('dataTools.filter.searchOptions')"
      :style="floatingStyles"
      @keydown.esc.stop.prevent="dismiss('escape', true)"
    >
      <MenuRadioItem
        indicator="check"
        :checked="options.mode === 'all'"
        @select="change({ mode: 'all' })"
      >
        {{ t("dataTools.filter.searchAllKeywords") }}
      </MenuRadioItem>
      <MenuRadioItem
        indicator="check"
        :checked="options.mode === 'any'"
        @select="change({ mode: 'any' })"
      >
        {{ t("dataTools.filter.searchAnyKeyword") }}
      </MenuRadioItem>
      <MenuRadioItem
        indicator="check"
        :checked="options.mode === 'phrase'"
        @select="change({ mode: 'phrase' })"
      >
        {{ t("dataTools.filter.searchEntireString") }}
      </MenuRadioItem>
      <MenuSeparator />
      <MenuRadioItem indicator="check" :checked="options.pinyin" @select="change({ pinyin: true })">
        {{ t("dataTools.filter.enablePinyinSearch") }}
      </MenuRadioItem>
      <MenuRadioItem
        indicator="check"
        :checked="!options.pinyin"
        @select="change({ pinyin: false })"
      >
        {{ t("dataTools.filter.disablePinyinSearch") }}
      </MenuRadioItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.filter-search-menu {
  z-index: var(--idea-layer-popover-submenu);

  &__trigger {
    width: 32px;
    height: 24px;
  }

  &__icons {
    display: flex;
    align-items: center;
    gap: var(--idea-space-1);
  }

  &__search-icon {
    width: var(--idea-control-icon-size);
    height: var(--idea-control-icon-size);
  }

  &__arrow {
    width: 10px;
    height: 10px;

    &.is-open {
      transform: rotate(180deg);
    }
  }
}
</style>
