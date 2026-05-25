// ============================================================
//  lib/shopify.js  —  FIXED v3
//  ✅ Includes ALL active products where ANY variant has qty >= 1
//  ✅ Does NOT skip product if total inventory seems low
//  ✅ Matches exactly what furorjeans.com/collections/all shows
// ============================================================

const SHOPIFY_STORE     = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN      = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION       = "2024-10";
const PRODUCTS_PER_PAGE = 250;

const BASE_URL = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}`;

const headers = {
  "X-Shopify-Access-Token": ACCESS_TOKEN,
  "Content-Type"          : "application/json",
};

export async function fetchAllShopifyProducts() {
  const rows = [];
  let url = `${BASE_URL}/products.json?status=active&limit=${PRODUCTS_PER_PAGE}&fields=id,title,product_type,status,variants`;
  let page = 1;
  let totalProducts = 0;

  while (url) {
    console.log(`  → Fetching page ${page}...`);

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${text}`);
    }

    const data     = await response.json();
    const products = data.products || [];
    console.log(`  → Page ${page}: ${products.length} products received`);

    for (const product of products) {
      totalProducts++;

      // ✅ FIX: check if ANY variant has inventory >= 1
      // Old code used totalInventory which caused issues when
      // some variants had 0 and some had stock
      const hasStock = product.variants.some(v => (v.inventory_quantity || 0) >= 1);

      // Skip products where ALL variants are out of stock
      if (!hasStock) continue;

      // Total inventory across all variants
      const totalInventory = product.variants.reduce(
        (sum, v) => sum + Math.max(0, v.inventory_quantity || 0), 0
      );

      // Write one row per variant that has stock >= 1
      for (const variant of product.variants) {
        const qty = variant.inventory_quantity || 0;

        // Only write variants with at least 1 unit
        if (qty < 1) continue;

        rows.push({
          product_id      : product.id,
          product_title   : product.title,
          product_type    : product.product_type || "(No Type)",
          status          : "ACTIVE",
          total_inventory : totalInventory,
          variant_id      : variant.id,
          variant_title   : variant.title,
          sku             : variant.sku || "",
          price           : parseFloat(variant.price || 0),
          compare_at_price: parseFloat(variant.compare_at_price || 0) || "",
          inventory_qty   : qty,
          synced_at       : new Date().toISOString(),
        });
      }
    }

    const linkHeader = response.headers.get("link");
    url = getNextPageUrl(linkHeader);
    page++;

    if (url) await sleep(500);
  }

  console.log(`✅ Total products scanned: ${totalProducts}`);
  console.log(`✅ Total variant rows with stock: ${rows.length}`);
  console.log(`✅ Unique products with stock: ${new Set(rows.map(r => r.product_id)).size}`);

  return rows;
}

function getNextPageUrl(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
