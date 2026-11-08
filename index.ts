import { Plugin } from "@opencode/plugin";

// The server half exists only to own the plugin id: a package with no server
// part takes its package name instead, which would rename every stored tab key.
export default Plugin.define({
  id: "file-editor",
  setup() {},
});
