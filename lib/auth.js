// ============================================================
//  lib/auth.js
//  Verifies the incoming request is from Vercel Cron
//  or a trusted manual trigger
// ============================================================

const CRON_SECRET = process.env.CRON_SECRET;

export function verifySecret(req) {
  // ── Vercel Cron sends Authorization: Bearer <CRON_SECRET> ─
  const authHeader = req.headers["authorization"] || "";
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  // ── Manual trigger: ?secret=CRON_SECRET in query string ──
  if (req.query?.secret === CRON_SECRET) return true;

  // ── Allow if no secret is configured (dev mode only) ─────
  if (!CRON_SECRET) {
    console.warn("⚠️  CRON_SECRET not set — running in open mode (not safe for production)");
    return true;
  }

  return false;
}
