import { eslintConfig } from "@bluzzi/eslint-config";

export default eslintConfig({}, {
  // node:test suites return promises that the runner already tracks:
  files: ["**/*.test.ts"],
  rules: { "@typescript-eslint/no-floating-promises": "off" },
});
