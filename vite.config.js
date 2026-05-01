import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/toeic-90days-challenge/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase")) return "vendor-firebase";
          if (id.includes("@google/generative-ai")) return "vendor-gemini";
          if (id.includes("react")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
});
