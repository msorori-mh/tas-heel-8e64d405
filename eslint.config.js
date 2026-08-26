import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // Supabase CLI output; formatting it would be overwritten on the next schema generation.
      "src/integrations/supabase/types.ts",
      // Generated operational corpus used as immutable question-bank import input.
      "tests/fixtures/question-bank/import/qb02-operational-fixtures.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Legacy admin adapters and executable fixture harnesses cross dynamic
    // Supabase/ExcelJS boundaries that are not represented in generated types.
    // Keep the exception path-scoped while issue #122 tracks their typed migration.
    files: [
      "scripts/generate-import-templates.ts",
      "src/components/admin/CurriculumPrelaunchPurgeControl.tsx",
      "src/components/admin/ExamTemplateQuestionsDialog.tsx",
      "src/components/admin/Grade12SubjectCatalogInitializer.tsx",
      "src/components/admin/LessonCreateDialog.tsx",
      "src/components/admin/LessonSummaryDialog.tsx",
      "src/components/exams/ExamTemplatesSection.tsx",
      "src/components/lessons/InteractiveResourceViewer.tsx",
      "src/lib/content-codes/content-codes.functions.ts",
      "src/lib/content-import-html-package.test.ts",
      "src/lib/content-import/html-package/zip-ingestion.ts",
      "src/lib/interactive-resource-viewer-integration.test.ts",
      "src/lib/lessons/content-v3.test.ts",
      "src/lib/lessons/lesson-lifecycle.test.ts",
      "src/lib/lessons/lesson-lifecycle.ts",
      "src/lib/offline/offline-pack.ts",
      "src/lib/question-bank/import/canonical-json.ts",
      "src/lib/question-bank/import/workbook-parser.ts",
      "src/routes/_authenticated/admin.exam-templates.tsx",
      "src/routes/_authenticated/admin.lesson-content.$lessonId.tsx",
      "src/routes/_authenticated/admin.lessons.index.tsx",
      "src/routes/_authenticated/admin.questions.tsx",
      "src/routes/_authenticated/admin.units.tsx",
      "tests/content-factory/content-factory-11-r6-dry-run-zero-write.test.ts",
      "tests/e2e/import-center-pr86/stubs/golden-lesson-direct.functions.ts",
      "tests/fixtures/question-bank/import/oracle-harness.ts",
      "tests/support/test-engine.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
  eslintPluginPrettier,
);
