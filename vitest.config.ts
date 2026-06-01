import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@unimap/core": pkg("./packages/core/src/index.ts"),
      "@unimap/testing": pkg("./packages/testing/src/index.ts"),
      "@unimap/mock-server": pkg("./packages/mock-server/src/index.ts"),
      "@unimap/provider-google": pkg("./packages/provider-google/src/index.ts"),
      "@unimap/provider-apple": pkg("./packages/provider-apple/src/index.ts"),
      "@unimap/provider-osm": pkg("./packages/provider-osm/src/index.ts"),
      "@unimap/provider-unofficial": pkg("./packages/provider-unofficial/src/index.ts"),
      "@unimap/proxy": pkg("./packages/proxy/src/index.ts"),
      "@unimap/client": pkg("./packages/client/src/index.ts"),
      "@unimap/render": pkg("./packages/render/src/index.ts"),
      "@unimap/react": pkg("./packages/react/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.{test,spec}.ts", "packages/**/*.{test,spec}.tsx"],
    environment: "node",
    globals: false,
    testTimeout: 15_000,
  },
});
