# Mobile subject cards preview check

PR: #220
Branch: feat/mobile-subject-cards-compact-grid
Preview Worker: tamkeen-staging-web

This documentation update requests a fresh non-production branch build after the user reviewed Cloudflare build settings. It does not prove that Cloudflare received the push or completed the build.

Expected configuration:
- Build: npm ci && npm run build
- Version command: npx wrangler versions upload --config .output/server/wrangler.json
- Root directory: /
- Non-production branch builds enabled

Verify the exact branch and commit in full build history, then use that version's preview URL. Check two-column cards, readable Arabic labels, show-all/show-less behavior, semester switching, subject navigation, and unchanged desktop layout. Record visual results before merging. No production deployment is requested by this checkpoint.
