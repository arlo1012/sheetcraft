import { dictionaryAliases } from "./dictionary-assets.ts";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: dictionaryAliases },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        inline: ["tdesign-vue-next"],
      },
    },
  },
});
