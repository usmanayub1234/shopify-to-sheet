// ============================================================
//  lib/shopify.js
//  Shopify REST Admin API  —  paginated product fetcher
//  Uses REST (not GraphQL) with link-header pagination
// ============================================================

const SHOPIFY_STORE     = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN      = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION       = "2024-10";
const MIN_INVENTORY     = 1;
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

  while (url) {
    console.log(`  → Fetching page ${page}...`);

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error ${response.status}: ${text}`);
    }

    const data     = await response.json();
    const products = data.products || [];

    for (const product of products) {
      const totalInventory = product.variants.reduce(
        (sum, v) => sum + (v.inventory_quantity || 0), 0
      );

      if (totalInventory <= MIN_INVENTORY) continue;

      for (const variant of product.variants) {
        if ((variant.inventory_quantity || 0) <= MIN_INVENTORY) continue;

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
          compare_at_price: parseFloat(variant.compare_at_price || 0),
          inventory_qty   : variant.inventory_quantity || 0,
          synced_at       : new Date().toISOString(),
        });
      }
    }

    const linkHeader = response.headers.get("link");
    url = getNextPageUrl(linkHeader);
    page++;

    if (url) await sleep(500);
  }

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
