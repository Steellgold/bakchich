import { eslintConfig } from "@bluzzi/eslint-config";

export default eslintConfig({}, {
  // Root config file belongs to no app tsconfig:
  ignores: ["eslint.config.js"],
}, {
  // node:test suites return promises that the runner already tracks:
  files: ["**/*.test.ts"],
  rules: { "@typescript-eslint/no-floating-promises": "off" },
});
