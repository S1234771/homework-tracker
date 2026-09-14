import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base должен совпадать с названием репозитория на GitHub,
// иначе на GitHub Pages не подгрузятся стили и скрипты.
export default defineConfig({
  plugins: [react()],
  base: "/homework-tracker/",
});
