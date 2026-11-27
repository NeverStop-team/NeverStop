# NeverStop | Competitive Recruitment Portal

Separate Cloudflare Worker for competition applications. The public NeverStop website remains on GitHub Pages; the Discord community is open and only the competitive role requires approval.

## What is implemented

- Discord OAuth2 identify login; applications require membership in the public Discord server.
- Application submission and status view using D1 (no Discord OAuth token stored).
- Staff-only administration with an explicit Discord ID allowlist, status filters, notes and audit trail.
- On approval the Discord bot adds the competitive role, not a new server invitation.
- Failed role assignment is recorded as role_error and staff can retry.
- Same-origin, CSRF and session-cookie checks are included; the app is not yet deployed.

## Deployment steps

1. In the competitive directory: npm install, then npx wrangler login.
2. Run: npx wrangler d1 create neverstop-competitive
3. Copy the returned D1 database_id into wrangler.jsonc.
4. Create a Discord Developer Portal application and invite its bot to the existing NeverStop Discord server.
5. Give the bot Manage Roles (not Administrator). Place the bot role ABOVE the 競技メンバー role.
6. Fill wrangler.jsonc vars: DISCORD_CLIENT_ID, DISCORD_GUILD_ID, COMPETITIVE_ROLE_ID, ADMIN_USER_IDS (comma-separated staff Discord IDs).
7. Run: npx wrangler secret put DISCORD_CLIENT_SECRET
8. Run: npx wrangler secret put DISCORD_BOT_TOKEN
9. Run: npm run db:remote, then npm run deploy.
10. Add the exact https://YOUR-WORKER-DOMAIN/auth/callback URL to Discord OAuth2 Redirects.
11. Test with one non-admin and one admin account, verifying that approval adds the competitive role.
12. Only after testing, replace the public recruit page's 準備中 label with the live Worker root URL.

## Routes

- / — applicant portal
- /admin.html — staff dashboard
- /health — configuration health
- /api/me — logged-in session information

## Security and operations

- Do not put secrets or bot tokens in GitHub or GitHub Pages.
- Admin page is not secured by hiding HTML; all admin data and decisions require server-side identity checks.
- Applicants join the public Discord first; approvals only add the competitive role.
- Restrict competitive-only Discord channels to that role, not the public @everyone role.
- Review application data retention and deletion policy before going live; add WAF/Turnstile for public launch.
- The previous competitive eligibility rules (including 18+) remain visible on the public website.
- No back-office server or database is active until Cloudflare resources and Discord credentials are configured.

## Local commands

cd competitive
npm install
npm run db:local
npm run dev
