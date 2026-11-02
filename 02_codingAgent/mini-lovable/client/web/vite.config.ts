import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "");
  return {
    plugins: [react()],
    server: {
      proxy: { "/api": `http://127.0.0.1:${env.PORT ?? 8000}` },
    },
  };
});
