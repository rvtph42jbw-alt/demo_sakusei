import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  server: {
    host: "0.0.0.0",
    proxy: { "/api": { target: "http://127.0.0.1:3000" } },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin.html", import.meta.url)),
      },
    },
  },
});
