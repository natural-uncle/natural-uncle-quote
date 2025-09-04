// netlify/functions/share.js
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    if (!body || !Array.isArray(body.items) || !body.total) {
      return { statusCode: 400, body: "Invalid payload" };
    }

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const key = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;
    const folder = process.env.CLOUDINARY_FOLDER || "quotes";
    if (!cloud || !key || !secret) {
      return { statusCode: 500, body: "Missing Cloudinary config" };
    }

    // 產一個簡短 id 當檔名，例如 q-20250904-abc123
    const rnd = Math.random().toString(36).slice(2, 8);
    const today = new Date().toISOString().slice(0,10).replace(/-/g,"");
    const publicId = `${folder}/q-${today}-${rnd}`;

    // 依 Cloudinary 規範簽名上傳（resource_type=raw, format=json）
    const ts = Math.floor(Date.now()/1000);
    const paramsToSign = new URLSearchParams({
      public_id: publicId,
      resource_type: "raw",
      type: "upload",
      timestamp: String(ts),
      folder
    });
    // 簽名：把 querystring + secret 做 sha1
    const crypto = await import("node:crypto");
    const toSign = `folder=${folder}&public_id=${publicId}&resource_type=raw&timestamp=${ts}&type=upload${secret ? "" : ""}`;
    const signature = crypto.createHash("sha1").update(toSign + secret).digest("hex");

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud}/raw/upload`;
    const form = new URLSearchParams();
    form.set("file", `data:application/json;base64,${Buffer.from(JSON.stringify(body)).toString("base64")}`);
    form.set("public_id", publicId);
    form.set("api_key", key);
    form.set("timestamp", String(ts));
    form.set("signature", signature);
    form.set("resource_type", "raw");
    form.set("folder", folder);
    form.set("format", "json"); // 讓網址固定 .json

    const res = await fetch(uploadUrl, { method: "POST", body: form });
    const j = await res.json();
    if (!res.ok) {
      return { statusCode: 500, body: `Cloudinary upload error: ${JSON.stringify(j)}` };
    }

    const base = process.env.SHARE_URL_BASE ||
      `https://${event.headers.host || "natural-uncle-quote.netlify.app"}/`;
    const cid = publicId.replace(`${folder}/`, ""); // 只保留短代碼部分
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
