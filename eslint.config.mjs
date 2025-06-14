import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

const config = tseslint.config(
  // Recommended base config from ESLint (for general JS linting)
  eslint.configs.recommended,

  // Linting rules for plain JavaScript files
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }], // Allow specific console methods
      "no-empty-pattern": "off", // Disable empty pattern warning
    },
  },

  // Extend TypeScript ESLint recommended configs with appropriate file targeting
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: true, // Enable project-wide type-aware linting
        tsconfigRootDir: import.meta.dirname, // Use current directory for tsconfig resolution
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_", // Allow unused args if prefixed with '_'
          varsIgnorePattern: "^_", // Allow unused vars if prefixed with '_'
          caughtErrorsIgnorePattern: "^_", // Same for caught error variables
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-empty-pattern": "off",
      //'@typescript-eslint/no-unsafe-call': 'warn',
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "warn",
    },
  },

  // Override rules specifically for test files
  {
    files: ["**/*.spec.ts", "**/*.test.ts", "**/tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // Ignore non-source directories and declaration files
  {
    ignores: [
      "src/testData/**",
      "node_modules/**",
      "logs/**",
      "playwright-report/**",
      "ortoni-report/**",
      "dist/**",
      "*.d.ts",
    ],
  },

  // Integrate Prettier to disable stylistic rules that might conflict
  prettierConfig
);

export default config;
