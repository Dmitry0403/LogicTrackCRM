const js = require("@eslint/js");
const globals = require("globals");
const reactPlugin = require("eslint-plugin-react");

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        google: "readonly",
        gisTokenClient: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
    },
    rules: {
      "no-unused-vars": [
        "error",
        { args: "none", caughtErrorsIgnorePattern: "^_" },
      ],
      "react/jsx-uses-vars": "error",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];
