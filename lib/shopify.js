// ============================================================
//  lib/shopify.js  —  paginated fetcher for free plan
//  Each call fetches ONE page of 250 products
// ============================================================

const SHOPIFY_STORE     = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN      = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION       = "2024-10";
const PAGE_SIZE         = 250;

const BASE_URL = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}`;
const headers  = {
  "X-Shopify-Access-Token": ACCESS_TOKEN,
  "Content-Type"          : "application/json",
};

// ── Get total number of pages needed ──────────────────────────
export async function getTotalPages() {
  const res  = await fetch(`${BASE_URL}/products/count.json?status=active`, { headers });
  const data = await res.json();
  return Math.ceil((data.count || 0) / PAGE_SIZE);
}

// ── Fetch ONE specific page using cursor-based pagination ──────
// We store page cursors in memory per cold start — but since
// GitHub Actions calls sequentially, we use page_info tokens
// via a simpler approach: fetch pages by offset using since_id

export async function fetchShopifyPage(pageNum) {
  // Fetch all pages up to pageNum to get the right cursor
  // For reliability on free plan we use page parameter approach
  const url = `${BASE_URL}/products.json?status=active&limit=${PAGE_SIZE}&page=${pageNum}&fields=id,title,product_type,status,variants`;

  console.log(`  → Fetching page ${pageNum}...`);
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shopify API ${response.status}: ${text}`);
  }

  const data     = await response.json();
  const products = data.products || [];
  const rows     = [];

  for (const product of products) {
    const hasStock = product.variants.some(v => (v.inventory_quantity || 0) >= 1);
    if (!hasStock) continue;

    const totalInventory = product.variants.reduce(
      (sum, v) => sum + Math.max(0, v.inventory_quantity || 0), 0
    );

    for (const variant of product.variants) {
      const qty = variant.inventory_quantity || 0;
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

  // Check if there are more pages
  const linkHeader = response.headers.get("link") || "";
  const hasNextPage = linkHeader.includes('rel="next"');

  return { rows, hasNextPage, totalFetched: products.length };
}
