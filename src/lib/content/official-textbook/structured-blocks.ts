/**
 * TAMKEEN_STRUCTURED_TEXTBOOK_READER_PILOT_20A1B
 *
 * Typed access to human-approved Official Textbook structured content.
 * The approved JSON is the single source of truth and is IMMUTABLE:
 * no rewording, no summarizing, no reordering, no dropped blocks.
 */

import approvedPilot from "@/content/official-textbook/pilot-20a1b/approved.json";
import manifestPilot from "@/content/official-textbook/pilot-20a1b/approval_manifest.json";
import assetB025 from "@/assets/official-textbook/pilot-20a1b/pilot-b025-01.png.asset.json";
import assetB027a from "@/assets/official-textbook/pilot-20a1b/pilot-b027-01.png.asset.json";
import assetB027b from "@/assets/official-textbook/pilot-20a1b/pilot-b027-02.png.asset.json";

export type StructuredBlockType =
  | "heading"
  | "lesson_header"
  | "objectives"
  | "paragraph"
  | "list"
  | "quran_verses"
  | "verse_meaning"
  | "figure"
  | "official_activity"
  | "official_textbook_assessment"
  | "table";

export interface StructuredAyah {
  number: number | null;
  text_exact: string;
  review_required?: boolean;
}

export interface StructuredQuestion {
  number_label: string;
  text_exact: string;
  sub_items_exact: string[];
}

export interface StructuredBlock {
  block_id: string;
  type: string;
  source_pdf_page: number | null;
  source_book_page_label: string | null;
  heading_exact: string | null;
  paragraphs_exact: string[];
  items_exact: string[];
  ayahs: StructuredAyah[];
  table_rows: string[][];
  questions: StructuredQuestion[];
  figure_description_only: string | null;
  figure_asset_paths: string[];
  confidence: string;
  review_required: boolean;
  notes: string | null;
}

export interface StructuredDocument {
  document_title: string;
  detected_subject: string | null;
  detected_semester: string | null;
  detected_section: string | null;
  detected_lesson_title: string | null;
  source_pdf_sha256: string;
  body_page_start: number;
  body_page_end: number;
  blocks: StructuredBlock[];
}

/** Approved asset path -> Tamkeen-managed (same-origin) asset URL. No base64, no external host. */
export const PILOT_20A1B_ASSET_MAP: Record<string, string> = {
  "assets/pilot-b025-01.png": assetB025.url,
  "assets/pilot-b027-01.png": assetB027a.url,
  "assets/pilot-b027-02.png": assetB027b.url,
};

export const PILOT_20A1B_DOCUMENT = approvedPilot as unknown as StructuredDocument;
export const PILOT_20A1B_MANIFEST = manifestPilot as {
  pilot: string;
  approved_json_sha256: string;
  source_pdf_sha256: string;
  auto_publish: boolean;
  status: string;
};

/** Marker used to bind a lesson row to this approved structured document. */
export const PILOT_20A1B_MARKER = "TAMKEEN_STRUCTURED_PILOT:20A1B";

export function resolveStructuredDocument(
  storedContent: string | null | undefined,
): StructuredDocument | null {
  const raw = (storedContent ?? "").trim();
  if (!raw) return null;
  if (raw.includes(PILOT_20A1B_MARKER)) return PILOT_20A1B_DOCUMENT;
  return null;
}
