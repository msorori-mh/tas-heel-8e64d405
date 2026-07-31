/** Type declarations for the local preflight validator (plain .mjs). */
export interface PreflightIssue {
  file: string;
  rowNumber: number | null;
  code: string;
  message: string;
}
export interface PreflightReport {
  ok: boolean;
  errors: PreflightIssue[];
  warnings: PreflightIssue[];
  found: string[];
  missing: string[];
}
export declare function validateContentPackage(dir: string): Promise<PreflightReport>;
