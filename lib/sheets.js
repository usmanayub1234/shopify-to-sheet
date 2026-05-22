// ============================================================
//  lib/sheets.js
//  Google Sheets API v4 — Service Account JWT auth
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

export async function writeToGoogleSheet(products) {
  const token = await getAccessToken();
  await clearSheet(token);

  const values = [
    HEADERS,
    ...products.map((p) => [
      p.product_id, p.product_title, p.product_type, p.status,
      p.total_inventory, p.variant_id, p.variant_title, p.sku,
      p.price, p.compare_at_price || "", p.inventory_qty, p.synced_at,
    ]),
  ];

  const range    = `${SHEET_TAB_NAME}!A1`;
  const endpoint = `${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;

  const response = await fetch(endpoint, {
    method : "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body   : JSON.stringify({ range, majorDimension: "ROWS", values }),
  });

  if (!response.ok) throw new Error(`Sheets write error: ${await response.text()}`);

  await formatHeaderRow(token);

  return {
    rowsWritten: products.length,
    sheetUrl   : `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`,
  };
}

async function clearSheet(token) {
  await fetch(`${SHEETS_API}/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_TAB_NAME)}:clear`, {
    method : "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function formatHeaderRow(token) {
  const metaRes = await fetch(`${SHEETS_API}/${SPREADSHEET_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta    = await metaRes.json();
  const sheetId = meta.sheets?.find(s => s.properties.title === SHEET_TAB_NAME)?.properties.sheetId ?? 0;

  await fetch(`${SHEETS_API}/${SPREADSHEET_ID}:batchUpdate`, {
    method : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body   : JSON.stringify({
      requests: [
        {
          repeatCell: {
            range : { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell  : {
              userEnteredFormat: {
                backgroundColor: { red: 0.1, green: 0.1, blue: 0.18 },
                textFormat     : { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
              },
            },
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
}

async function getAccessToken() {
  const now     = Math.floor(Date.now() / 1000);
  const payload = { iss: CLIENT_EMAIL, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const jwt     = await signJWT(payload);

  const response = await fetch(TOKEN_URL, {
    method : "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body   : new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion : jwt,
    }),
  });

  if (!response.ok) throw new Error(`Google OAuth error: ${await response.text()}`);
  return (await response.json()).access_token;
}

async function signJWT(payload) {
  const header  = { alg: "RS256", typ: "JWT" };
  const enc     = (obj) => btoa(JSON.stringify(obj)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const message = `${enc(header)}.${enc(payload)}`;

  const keyData   = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/,"").replace(/-----END PRIVATE KEY-----/,"").replace(/\s/g,"");
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(message));
  const sigB64    = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");

  return `${message}.${sigB64}`;
}
