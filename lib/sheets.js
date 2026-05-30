// ============================================================
//  lib/sheets.js  —  supports page-by-page writing
// ============================================================

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const SHEET_TAB_NAME = process.env.GOOGLE_SHEET_TAB_NAME || "Shopify Products";
const CLIENT_EMAIL   = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY    = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL  = "https://oauth2.googleapis.com/token";
const SCOPES     = "https://www.googleapis.com/auth/spreadsheets";

const HEADERS = [
  "Product ID", "Product Title", "Product Type", "Status",
  "Total Inventory", "Variant ID", "Variant Title", "SKU",
  "Price", "Compare At Price", "Variant Inventory", "Last Synced At",
];

// ── Clear the entire sheet ─────────────────────────────────────
export async function clearSheet() {
  const token = await getAccessToken();
  await fetch(
    `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_TAB_NAME)}:clear`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  // Write headers immediately after clearing
  await writeRows(token, [HEADERS], 1);
  console.log("✅ Sheet cleared and headers written");
}

// ── Write one page of rows to sheet ───────────────────────────
// page=1 starts at row 2 (after header), page=2 at row 252, etc
export async function writePageToGoogleSheet(rows, page) {
  const token     = await getAccessToken();
  const startRow  = 2 + ((page - 1) * 250); // row 2, 252, 502...
  const values    = rows.map(r => [
    r.product_id, r.product_title, r.product_type, r.status,
    r.total_inventory, r.variant_id, r.variant_title, r.sku,
    r.price, r.compare_at_price || "", r.inventory_qty, r.synced_at,
  ]);
  await writeRows(token, values, startRow);
  console.log(`✅ Page ${page}: wrote ${rows.length} rows starting at row ${startRow}`);
}

// ── Format headers after all pages done ───────────────────────
export async function formatSheet() {
  const token = await getAccessToken();
  const meta  = await (await fetch(`${SHEETS_API}/${SPREADSHEET_ID}`, {
    headers: { Authorization: `Bearer ${token}` }
  })).json();
  const sheetId = meta.sheets?.find(s => s.properties.title === SHEET_TAB_NAME)?.properties.sheetId ?? 0;

  await fetch(`${SHEETS_API}/${SPREADSHEET_ID}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range : { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell  : { userEnteredFormat: {
              backgroundColor: { red: 0.1, green: 0.1, blue: 0.18 },
              textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
            }},
            fields: "userEnteredFormat(backgroundColor,textFormat)",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields    : "gridProperties.frozenRowCount",
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: HEADERS.length },
          },
        },
      ],
    }),
  });
  console.log("✅ Sheet formatted");
}

// ── Write rows to specific start row ──────────────────────────
async function writeRows(token, values, startRow) {
  const range    = `${SHEET_TAB_NAME}!A${startRow}`;
  const endpoint = `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const response = await fetch(endpoint, {
    method : "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body   : JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!response.ok) throw new Error(`Sheets write error: ${await response.text()}`);
}

// ── Service Account JWT auth ───────────────────────────────────
async function getAccessToken() {
  const now     = Math.floor(Date.now() / 1000);
  const payload = { iss: CLIENT_EMAIL, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const jwt     = await signJWT(payload);
  const res     = await fetch(TOKEN_URL, {
    method : "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body   : new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`OAuth error: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function signJWT(payload) {
  const header  = { alg: "RS256", typ: "JWT" };
  const enc     = obj => btoa(JSON.stringify(obj)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const message = `${enc(header)}.${enc(payload)}`;
  const keyData = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/,"").replace(/-----END PRIVATE KEY-----/,"").replace(/\s/g,"");
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(message));
  const sigB64   = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  return `${message}.${sigB64}`;
}
