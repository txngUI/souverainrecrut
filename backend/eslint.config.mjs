import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "prisma/migrations"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Les paramètres imposés par Express (req, res, next) ou volontairement ignorés commencent par "_"
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_|^(req|res|next)$", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      globals: globals.jest,
    },
    rules: {
      // jest.mock(..., () => require(...)) est le schéma standard pour les mocks de module
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
  },
  // Désactive les règles de style qui entreraient en conflit avec Prettier
  prettier,
);
