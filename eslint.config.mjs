import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["main.js", "node_modules/**"] },
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
    files: ["*.mjs", "scripts/**/*.mjs", "tests/**/*.ts", "vitest.config.ts"],
    rules: {
      "obsidianmd/no-nodejs-modules": "off"
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
