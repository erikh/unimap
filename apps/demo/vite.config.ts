import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

// The demo is not an npm workspace; alias @unimap/* straight to source so it
// builds inside the monorepo without publishing anything.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@unimap/core": pkg("../../packages/core/src/index.ts"),
      "@unimap/client": pkg("../../packages/client/src/index.ts"),
      "@unimap/render": pkg("../../packages/render/src/index.ts"),
      "@unimap/react": pkg("../../packages/react/src/index.ts"),
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 5173, host: true },
});
