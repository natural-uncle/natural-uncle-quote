// netlify/functions/share.js
// 將報價 JSON 上傳到 Cloudinary (raw/json) → 回傳短代碼與可分享連結

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    if (!payload || !Array.isArray(payload.items) || !payload.total) {
      return { statusCode: 400, body: "Invalid payload" };
    }

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;      // dijzndzw2
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folder = process.env.CLOUDINARY_FOLDER || "quotes";
    if (!cloud || !apiKey || !apiSecret) {
      return { statusCode: 500, body: "Missing Cloudinary config" };
    }

    // 只用檔名，別把 folder 放進 public_id
    const rnd = Math.random().toString(36).slice(2, 8);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const publicId = `q-${today}-${rnd}`; // <-- 不含資料夾

    // 簽名（folder + public_id + timestamp + format）
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { folder, public_id: publicId, timestamp, format: "json" };
    const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
    const crypto = await import("node:crypto");
    const signature = crypto.createHash("sha1").update(sorted + apiSecret).digest("hex");

    // 上傳
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud}/raw/upload`;
    const form = new URLSearchParams();
    form.set("file", `data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
    form.set("api_key", apiKey);
    form.set("timestamp", String(timestamp));
    form.set("public_id", publicId);
    form.set("folder", folder);
    form.set("format", "json");
    form.set("signature", signature);

    const r = await fetch(uploadUrl, { method: "POST", body: form });
    const j = await r.json();
    if (!r.ok) return { statusCode: 500, body: `Cloudinary upload error: ${JSON.stringify(j)}` };

    // 回傳短碼（就是 public_id 本身），以及分享網址
    const host = event.headers["x-forwarded-host"] || event.headers.host || "natural-uncle-quote.netlify.app";
    const proto = event.headers["x-forwarded-proto"] || "https";
    const base = `${proto}://${host}/`;
    const cid = publicId; // e.g. q-20250904-abc123
    const shareUrl = `${base}#cid=${encodeURIComponent(cid)}`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, cid, share_url: shareUrl })
    };

  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) };
  }
}
