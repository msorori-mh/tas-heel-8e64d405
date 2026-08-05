// Feature Flags configuration for Operational HTML Content Onboarding (PR 17)

export const CONTENT_FEATURE_FLAGS = {
  ENABLE_HTML_CONTENT_BACKEND: import.meta.env.VITE_ENABLE_HTML_CONTENT_BACKEND === "true",
  ENABLE_HTML_CONTENT_UPLOAD: import.meta.env.VITE_ENABLE_HTML_CONTENT_UPLOAD === "true",
  ENABLE_HTML_CONTENT_PUBLISH: import.meta.env.VITE_ENABLE_HTML_CONTENT_PUBLISH === "true",
  ENABLE_HTML_CONTENT_STUDENT_READ: import.meta.env.VITE_ENABLE_HTML_CONTENT_STUDENT_READ === "true",
};
