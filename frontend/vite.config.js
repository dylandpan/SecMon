import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://44.249.234.166:3000",
        changeOrigin: true,
      },
    },
  },
});
