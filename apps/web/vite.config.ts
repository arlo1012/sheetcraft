import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "0.0.0.0",
    port: 7200,
  },
  preview: {
    host: "0.0.0.0",
    port: 7200,
  },
});
