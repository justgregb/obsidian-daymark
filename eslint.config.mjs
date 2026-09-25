import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["main.js", "node_modules/**", "tests/visual/margin-fixture.js"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Daymark", "Markdown", "Obsidian", "Tally"],
          enforceCamelCaseLower: true,
          ignoreRegex: ["^format guide$", "^[YMDHms\\-/. :]+$", "^[^\\s]+/[^\\s]+(?:\\.md)?$"]
        }
      ]
    }
  },
  {
    files: ["*.mjs", "scripts/**/*.mjs", "tests/**/*.ts", "benchmarks/**/*.ts", "vitest.config.ts"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off"
    }
  },
  {
    // Standalone browser fixtures supply Obsidian's DOM and SVG helpers.
    files: ["tests/visual/margin-entry.ts", "tests/visual/margin-obsidian.ts"],
    rules: {
      "obsidianmd/prefer-create-el": "off"
    }
  },
  {
    files: ["tests/obsidian-mock.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
      "import/no-extraneous-dependencies": "off"
    }
  }
);
