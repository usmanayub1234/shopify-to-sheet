// ============================================================
//  api/sync-products.js  —  FIXED for Vercel Free Plan
//  Supports pagination — call with ?page=1, ?page=2 etc
//  Each page fetches 250 products and writes to sheet
//  GitHub Actions calls each page separately
// ============================================================

import { fetchShopifyPage, getTotalPages } from "../lib/shopify.js";
import { writePageToGoogleSheet, clearSheet, formatSheet } from "../lib/sheets.js";
import { verifySecret } from "../lib/auth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!verifySecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const action = req.query.action || "sync";
  const page   = parseInt(req.query.page || "1");

  console.log(`[${new Date().toISOString()}] action=${action} page=${page}`);

  try {
    // ── action=clear: clear the sheet before sync starts ──
    if (action === "clear") {
      await clearSheet();
      return res.status(200).json({ success: true, action: "clear" });
    }

    // ── action=format: format headers after all pages done ─
    if (action === "format") {
      await formatSheet();
      return res.status(200).json({ success: true, action: "format" });
    }

    // ── action=pages: return how many pages exist ──────────
    if (action === "pages") {
      const total = await getTotalPages();
      return res.status(200).json({ success: true, totalPages: total });
    }

    // ── default: sync one page ─────────────────────────────
    const { rows, hasNextPage, totalFetched } = await fetchShopifyPage(page);

    if (rows.length > 0) {
      await writePageToGoogleSheet(rows, page);
    }

    return res.status(200).json({
      success     : true,
      page        : page,
      rowsWritten : rows.length,
      hasNextPage : hasNextPage,
      totalFetched: totalFetched,
      timestamp   : new Date().toISOString(),
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
