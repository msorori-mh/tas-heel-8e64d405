import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
// Bind the APK to the same public configuration as source. Never read service-role secrets.
const publicConfig = readFileSync('src/integrations/supabase/public-config.ts', 'utf8');
const origin = publicConfig.match(/PUBLIC_SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
const html = readFileSync('mobile/www/index.html', 'utf8');
if (!origin || new URL(origin).protocol !== 'https:' || !html.includes(`connect-src 'self' ${origin};`)) {
  throw new Error('Local pages CSP must match the authoritative public Supabase URL');
}
await build({
  entryPoints: ['mobile/src/runtime.ts'], outfile: 'mobile/www/local-runtime.js',
  bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020',
  define: { 'import.meta.env': '{}', 'process.env': '{}' },
  legalComments: 'none', sourcemap: false,
});
console.log('Bundled local pages synchronization runtime');
