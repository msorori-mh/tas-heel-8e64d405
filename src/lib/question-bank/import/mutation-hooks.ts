export const MUTATION_HOOKS = {
  disableAuthorizationGuard: false,
  missingAuthorizationAllows: false,
  disableExternalRelRejection: false,
  disablePreparseZipLimits: false,
  disableDuplicateEntryDetection: false,
  disablePathTraversalDetection: false,
  bypassFormulaInjectionGuard: false,
  allowUnsupportedFormat: false,
  disableIdempotencyValidation: false,
  disableRequiredColumnValidation: false,
};

export type MutationHookKey = keyof typeof MUTATION_HOOKS;

export function resetMutationHooks(): void {
  for (const key of Object.keys(MUTATION_HOOKS) as MutationHookKey[]) {
    MUTATION_HOOKS[key] = false;
  }
}
