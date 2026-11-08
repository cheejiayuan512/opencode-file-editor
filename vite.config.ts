import { defineConfig } from "vite";
import { gui } from "@opencode/plugin/gui/vite";

// Written to the package root on purpose: a local plugin directory resolves its
// GUI part by file name (`gui-experimental.cjs`). A package `exports` map makes
// the loader resolve `<name>/gui-experimental` through node_modules instead,
// which fails for a directory you point at directly.
export default defineConfig({
  plugins: [gui({ outFile: "gui-experimental.cjs" })],
});
