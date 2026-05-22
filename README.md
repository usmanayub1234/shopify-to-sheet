# Shopify to Google Sheets — Auto Daily Sync via Vercel

Syncs ACTIVE Shopify products (inventory > 1) to Google Sheets daily at 2 AM UTC.

## Architecture
Shopify REST API → Vercel Cron Function → Google Sheets → Looker Studio

## File Structure
```
api/sync-products.js    ← Vercel serverless endpoint + cron trigger
lib/shopify.js          ← Shopify REST paginator
lib/sheets.js           ← Google Sheets writer (Service Account JWT)
lib/auth.js             ← Cron secret guard
vercel.json             ← Daily cron: 0 2 * * *
.env.example            ← All required env vars
```

---

## STEP 1 — Shopify API Token
1. Shopify Admin → Settings → Apps → Develop Apps → Create App
2. Scopes needed: read_products, read_inventory
3. Install app → copy the shpat_... token (shown once only)

---

## STEP 2 — Google Service Account
1. console.cloud.google.com → New Project
2. Enable Google Sheets API
3. IAM → Service Accounts → Create → download JSON key
4. You need: client_email and private_key from the JSON

---

## STEP 3 — Google Sheet
1. Create a Google Sheet
2. Add a tab named: Shopify Products
3. Copy the Sheet ID from the URL
4. Share the sheet with your service account email (Editor role)

---

## STEP 4 — Deploy to Vercel

```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_USERNAME/shopify-to-sheets.git
git push -u origin main
```

Then: vercel.com → New Project → Import GitHub repo → add env vars → Deploy

## Environment Variables (add in Vercel dashboard)

| Variable                      | Where to get it              |
|-------------------------------|------------------------------|
| SHOPIFY_STORE_DOMAIN          | your-store.myshopify.com     |
| SHOPIFY_ACCESS_TOKEN          | Shopify Develop Apps         |
| GOOGLE_SPREADSHEET_ID         | From Google Sheet URL        |
| GOOGLE_SHEET_TAB_NAME         | Shopify Products             |
| GOOGLE_SERVICE_ACCOUNT_EMAIL  | From service account JSON    |
| GOOGLE_PRIVATE_KEY            | From service account JSON    |
| CRON_SECRET                   | openssl rand -hex 32         |

---

## STEP 5 — Test Manual Sync
```
https://your-app.vercel.app/api/sync-products?secret=YOUR_CRON_SECRET
```

Expected response:
```json
{ "success": true, "productsFound": 142, "rowsWritten": 538 }
```

---

## STEP 6 — Cron Schedule
vercel.json runs: 0 2 * * * (every day 2 AM UTC)
NOTE: Vercel Cron requires Pro plan.

---

## Looker Studio Setup

1. lookerstudio.google.com → Create → Report
2. Add Data → Google Sheets → your sheet → Shopify Products tab

### Chart 1 — Product Count by Type (Bar Chart)
- Dimension: Product Type
- Metric: COUNT_DISTINCT(Product ID)

### Chart 2 — Add Filter Control
- Control: Drop-down list
- Field: Product Type

### Scorecard KPIs
- COUNT_DISTINCT(Product ID) = Total Live Products
- SUM(Variant Inventory) = Total Units in Stock

---

## Google Sheet Columns
Product ID | Product Title | Product Type | Status | Total Inventory
Variant ID | Variant Title | SKU | Price | Compare At Price | Variant Inventory | Last Synced At

---

## Troubleshooting
- 401 Unauthorized → Check SHOPIFY_ACCESS_TOKEN
- 403 on Sheets → Share sheet with service account email
- JWT error → GOOGLE_PRIVATE_KEY must include BEGIN/END lines
- Cron not firing → Upgrade Vercel to Pro
