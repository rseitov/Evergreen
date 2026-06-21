import { defineConfig } from "vite";
import { resolve } from "node:path";

// Builds the three extension entry points to dist/ as ES modules.
// The manifest and popup.html are copied from public/ by Vite automatically.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.ts"),
        background: resolve(__dirname, "src/background.ts"),
        popup: resolve(__dirname, "src/popup.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
  },
});
