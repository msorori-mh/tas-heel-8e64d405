import { isInlineHtmlResourceUrl } from "@/lib/lessons/inline-html-resource";

/** Publication stores the resource kind and render mode in separate fields.
 * Accept the deployed kind-shaped rows only with their explicit interactive
 * publication mode. Body attestation, access and network checks remain required.
 */
export function isOfflineInteractiveResource(row: {
  url: string | null;
  resource_type: string | null;
  html_resource_type: string | null;
  metadata: unknown;
}): boolean {
  if (!isInlineHtmlResourceUrl(row.url)) return false;
  if (row.resource_type !== "mindmap" && row.resource_type !== "experiment") return false;
  if (row.html_resource_type === "INTERACTIVE") return true;
  if (row.html_resource_type !== row.resource_type) return false;
  const metadata = row.metadata;
  return (
    !!metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).cf11_render_mode === "INTERACTIVE"
  );
}
