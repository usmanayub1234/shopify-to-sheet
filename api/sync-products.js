// ============================================================
//  api/sync-products.js
//  Vercel Serverless Function
//  Fetches ALL active Shopify products (inventory > 1)
//  and writes them to Google Sheets via Service Account
// ============================================================

import { fetchAllShopifyProducts } from "../lib/shopify.js";
import { writeToGoogleSheet }      from "../lib/sheets.js";
import { verifySecret }            from "../lib/auth.js";

export const config = { maxDuration: 300 }; // 5 min timeout for large stores

export default async function handler(req, res) {
  // ── Security: only allow GET + valid cron secret ──────────
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel Cron passes Authorization header automatically
  // Manual calls must pass ?secret=YOUR_CRON_SECRET
  const authorized = verifySecret(req);
  if (!authorized) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log(`[${new Date().toISOString()}] ▶ Sync started`);

  try {
    // ── 1. Fetch products from Shopify ─────────────────────
    console.log("📦 Fetching Shopify products...");
    const products = await fetchAllShopifyProducts();

    console.log(`✅ Fetched ${products.length} active products with inventory > 1`);

    // ── 2. Write to Google Sheets ──────────────────────────
    console.log("📊 Writing to Google Sheets...");
    const result = await writeToGoogleSheet(products);

    console.log(`✅ Sheet updated: ${result.rowsWritten} rows written`);

    return res.status(200).json({
      success      : true,
      timestamp    : new Date().toISOString(),
      productsFound: products.length,
      rowsWritten  : result.rowsWritten,
      sheetUrl     : result.sheetUrl,
    });

  } catch (err) {
    console.error("❌ Sync failed:", err.message);
    return res.status(500).json({
      success  : false,
      error    : err.message,
      timestamp: new Date().toISOString(),
    });
  }
}
