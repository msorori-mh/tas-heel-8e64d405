/** Public Supabase client config (anon/publishable only). Safe to embed in client bundle. */
const independent = import.meta.env.VITE_INDEPENDENT_STAGING === "true";
export const PUBLIC_SUPABASE_URL = independent
  ? "https://yjpirilbpqxtmnayruht.supabase.co"
  : "https://zbdhxyuulyovihjgeqbn.supabase.co";
export const PUBLIC_SUPABASE_PUBLISHABLE_KEY = independent
  ? "sb_publishable_0jwJXT5ejTU8ChDH2feagg_FFPZQsgQ"
  : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZGh4eXV1bHlvdmloamdlcWJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTA2NDAsImV4cCI6MjA5NjI2NjY0MH0.BOkyCM3Ks7YwUKPkeFI4v7U_UeGVV8N37C1ovdFNth4";
export const PUBLIC_SUPABASE_PROJECT_ID = independent
  ? "yjpirilbpqxtmnayruht"
  : "zbdhxyuulyovihjgeqbn";
