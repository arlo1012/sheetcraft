import { dictionaryAliases } from "./dictionary-assets.ts";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: dictionaryAliases },
  optimizeDeps: {
    // These workspace packages publish from dist. Keep them out of the dependency
    // optimizer so Vite observes their rebuilt output during development.
    exclude: ["@sheetcraft/core", "@sheetcraft/sheet-engine", "@sheetcraft/xlsx-io"],
  },
  worker: {
    format: "es",
    rolldownOptions: {
      output: { chunkFileNames: "assets/worker-[name]-[hash].js" },
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vue-runtime",
              test: /node_modules[\\/](?:@vue|vue|vue-i18n|@floating-ui)[\\/]/,
              priority: 30,
            },
            {
              name: "tdesign-image-viewer",
              test: /node_modules[\\/]tdesign-vue-next[\\/](?:es|lib)[\\/]image-viewer[\\/]/,
              priority: 25,
              includeDependenciesRecursively: false,
            },
            {
              name: "tdesign-image",
              test: /node_modules[\\/]tdesign-vue-next[\\/](?:es|lib)[\\/]image[\\/]/,
              priority: 24,
              includeDependenciesRecursively: false,
            },
            {
              name: "tdesign",
              test: /node_modules[\\/]tdesign-vue-next[\\/]/,
              priority: 20,
              includeDependenciesRecursively: true,
            },
            {
              name: "icons",
              test: /node_modules[\\/]lucide-vue-next[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 7200,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 7200,
  },
});
