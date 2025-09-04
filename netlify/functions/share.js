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

    // 生成 public_id（例：quotes/q-20250904-ab12cd）
    const rnd = Math.random().toString(36).slice(2, 8);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const publicId = `${folder}/q-${today}-${rnd}`;

    // 依 Cloudinary 規範製作簽名（將要上傳的參數按字母排序 → 用 & 串接 → + API_SECRET → sha1）
    const timestamp = Math.floor(Date.now() / 1000);

    // 參與簽名的參數（不要包含 file、api_key、resource_type、cloud_name）
    const params = {
      folder,                       // quotes
      public_id: publicId,          // quotes/q-xxxxxx
      timestamp,                    // 秒
      format: "json"                // 希望輸出 .json
    };

    // 排序並串成 querystring
    const sortedKeys = Object.keys(params).sort();
    const toSign = sortedKeys.map(k => `${k}=${params[k]}`).join("&");

    // 簽名
    const crypto = await import("node:crypto");
    const signature = crypto.createHash("sha1")
      .update(toSign + apiSecret)
      .digest("hex");

    // 準備上傳
    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud}/raw/upload`;
    const form = new URLSearchParams();
    form.set("file", `data:application/json;base64,${Buffer.from(JSON.stringify(payload)).toString("base64")}`);
    form.set("api_key", apiKey);
    form.set("timestamp", String(timestamp));
    form.set("public_id", publicId);
    form.set("folder", folder);
    form.set("format", "json");
    form.set("signature", signature);

    const res = await fetch(uploadUrl, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      return { statusCode: 500, body: `Cloudinary upload error: ${JSON.stringify(data)}` };
    }

    // 回傳短連結（用 #cid=短碼）
    const host = event.headers["x-forwarded-host"] || event.headers.host || "natural-uncle-quote.netlify.app";
    const proto = (event.headers["x-forwarded-proto"] || "https");
    const base = `${proto}://${host}/`;

    // 短碼只保留最後一段（q-xxxxxx-xxxx）
    const cid = publicId.split("/").pop();
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
