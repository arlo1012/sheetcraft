<script setup lang="ts">
import {
  CaseSensitive,
  Hash,
  Coins,
  Calculator,
  CalendarDays,
  CalendarRange,
  Clock,
  Percent,
  Divide,
  Superscript,
  Type,
} from "lucide-vue-next";
import type { NumberFormatPresetChoice } from "../number-format-presets";
defineProps<{ choice: NumberFormatPresetChoice }>();
</script>

<template>
  <CaseSensitive v-if="choice === 'general'" aria-hidden="true" />
  <Hash v-else-if="choice === 'number'" aria-hidden="true" />
  <Coins v-else-if="choice === 'currency'" aria-hidden="true" />
  <Calculator v-else-if="choice === 'accounting'" aria-hidden="true" />
  <CalendarDays v-else-if="choice === 'shortDate'" aria-hidden="true" />
  <CalendarRange v-else-if="choice === 'longDate'" aria-hidden="true" />
  <Clock v-else-if="choice === 'time'" aria-hidden="true" />
  <Percent v-else-if="choice === 'percent'" aria-hidden="true" />
  <Divide v-else-if="choice === 'fraction'" aria-hidden="true" />
  <Superscript v-else-if="choice === 'scientific'" aria-hidden="true" />
  <Type v-else aria-hidden="true" />
</template>
