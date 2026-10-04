<script setup lang="ts">
import { computed, useId } from "vue";

const props = defineProps<{
  shadow: "none" | "soft" | "hard";
  reflection: boolean;
  bevel: boolean;
  outlineWidth: number;
  gradient: boolean;
}>();

const id = useId().replaceAll(":", "");
const shadowId = `theme-effect-shadow-${id}`;
const gradientId = `theme-effect-gradient-${id}`;
const reflectionId = `theme-effect-reflection-${id}`;
const shadowFilter = computed(() => (props.shadow === "none" ? undefined : `url(#${shadowId})`));
const arrowStroke = computed(() => Math.max(0, Math.min(4, props.outlineWidth)));
</script>

<template>
  <svg class="theme-effect-preview" viewBox="0 0 72 54" aria-hidden="true">
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0.9" y2="1">
        <stop stop-color="#8eb6ea" />
        <stop offset="0.52" stop-color="#4d86cf" />
        <stop offset="1" stop-color="#2e65ad" />
      </linearGradient>
      <linearGradient :id="reflectionId" x1="0" y1="0" x2="0" y2="1">
        <stop stop-color="#4d86cf" stop-opacity=".32" />
        <stop offset="1" stop-color="#4d86cf" stop-opacity="0" />
      </linearGradient>
      <filter :id="shadowId" x="-30%" y="-30%" width="170%" height="180%">
        <feDropShadow
          dx="2"
          dy="3"
          :std-deviation="shadow === 'soft' ? 1.5 : 0.2"
          flood-color="#16263c"
          :flood-opacity="shadow === 'soft' ? 0.32 : 0.45"
        />
      </filter>
    </defs>
    <g :filter="shadowFilter">
      <path
        d="M8 18h28V9l28 18-28 18v-9H8z"
        :fill="gradient ? `url(#${gradientId})` : '#4d86cf'"
        :stroke="outlineWidth ? '#285892' : 'none'"
        :stroke-width="arrowStroke"
        stroke-linejoin="round"
      />
      <path
        v-if="bevel"
        d="M10 19h27v-8l23 15-23 15v-8H10z"
        fill="none"
        stroke="#dceaff"
        stroke-width="1.4"
        stroke-linejoin="round"
        opacity=".9"
      />
    </g>
    <path
      v-if="reflection"
      d="M8 38h28v-9l28-18v9L40 36h-4v9H8z"
      :fill="`url(#${reflectionId})`"
      opacity=".85"
    />
  </svg>
</template>

<style scoped lang="scss">
.theme-effect-preview {
  display: block;
  width: 100%;
  height: 52px;
}
</style>
