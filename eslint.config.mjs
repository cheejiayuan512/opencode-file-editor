// Lint is a bug finder here, not a style guide: the rules below catch the
// failure modes the test suite cannot reach from outside the host — an
// unawaited save, a promise passed where a void handler belongs, a switch that
// silently forgets a case, a destructured prop that stops Solid tracking it.
//
// `npm run typecheck` stays the type gate. This adds the cross-expression
// checks a type checker deliberately leaves out.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";
import solid from "eslint-plugin-solid/configs/typescript";
import tseslint from "typescript-eslint";

const TYPESCRIPT = ["src/**/*.ts", "src/**/*.tsx", "index.ts"];

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "gui-experimental.cjs",
      "test/.build/**",
      "docs/**",
    ],
  },

  js.configs.recommended,

  {
    files: ["**/*.mjs", "**/*.js", "**/*.cjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Tests and build scripts are allowed to print.
    files: ["test/**/*.mjs", "scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },

  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: TYPESCRIPT,
  })),

  {
    files: TYPESCRIPT,
    languageOptions: {
      parserOptions: {
        // `projectService` reads the real tsconfig, so a rule can see the type
        // of the promise it is asking about.
        projectService: true,
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
      // The window half runs in a browser, the main half in Node. One file
      // holds both, so both globals are legitimate.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // A rejected promise nobody awaits is a bug that only shows up as a
      // silent no-op in the panel. `void` is the explicit acknowledgement.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The host API is typed; `any` leaks in from the SDK, not from here.
      "@typescript-eslint/no-explicit-any": "off",
      // An Ipc method that returns a promise without awaiting anything is
      // shaped by its contract, not by a missing await.
      "@typescript-eslint/require-await": "off",
      "no-console": "off",
    },
  },

  {
    files: ["src/**/*.tsx"],
    ...solid,
    rules: {
      ...solid.rules,
      // `solid/no-destructure` is the one that matters: destructuring props
      // reads them once and loses reactivity, which looks like a stale panel.
      "solid/no-destructure": "error",
      "solid/reactivity": "warn",
    },
  },
);
