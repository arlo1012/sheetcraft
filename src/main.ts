import { createApp } from "vue";
import App from "./app/App.vue";
import "./shared/styles/index.scss";
import { createAppI18n } from "./shared/i18n";

createApp(App).use(createAppI18n()).mount("#app");
