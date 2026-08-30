type ProviderMetadata = {
  app_metadata?: {
    provider?: unknown;
    providers?: unknown;
  } | null;
};

/**
 * Password accounts must re-authenticate before deletion. OAuth-only accounts
 * do not have a local password, so their already-validated bearer session plus
 * the destructive confirmation is the available in-app deletion proof.
 * Unknown metadata fails closed and requires a password.
 */
export function accountDeletionRequiresPassword(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;

  const metadata = (value as ProviderMetadata).app_metadata;
  if (!metadata || typeof metadata !== "object") return true;

  const providers = new Set<string>();
  if (typeof metadata.provider === "string" && metadata.provider.trim()) {
    providers.add(metadata.provider.trim().toLowerCase());
  }
  if (Array.isArray(metadata.providers)) {
    for (const provider of metadata.providers) {
      if (typeof provider === "string" && provider.trim()) {
        providers.add(provider.trim().toLowerCase());
      }
    }
  }

  return providers.size === 0 || providers.has("email");
}
