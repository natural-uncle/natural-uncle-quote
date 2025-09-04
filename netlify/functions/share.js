// netlify/functions/share.js
// POST  /api/share  → 把前端傳來的報價 JSON 上傳到 Cloudinary (resource_type=raw, format=json)
//                      產生短ID (cid) 並回傳 { cloudinaryId, cid, url, secure_url }
// GET   /api/share?cid=... → 從 Cloudinary 讀回 JSON 內容（唯讀頁會用）

import crypto from "crypto";

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return cors(200, "ok"); // CORS preflight
    }

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const folderRaw = (process.env.CLOUDINARY_UPLOAD_FOLDER || "").replace(/^\/+|\/+$/g, "");

    if (!cloud || !apiKey || !apiSecret) {
      return json(500, { error: "Cloudinary env missing: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET" });
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      // 產生短ID（避免太長）
      const shortId = "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const publicId = (folderRaw ? `${folderRaw}/` : "") + shortId;

      // 上傳到 Cloudinary：raw 資源、json 格式（讓 URL 可帶 .json）
      const jsonStr = JSON.stringify(payload);
      const dataUri = "data:application/json;base64," + Buffer.from(jsonStr, "utf8").toString("base64");

      const timestamp = Math.floor(Date.now() / 1000);

      // 簽名：只簽 format / public_id / timestamp（避免 folder 參數，直接把 folder 放進 public_id）
      const toSign = `format=json&public_id=${publicId}&timestamp=${timestamp}`;
      const signature = crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");

      // 呼叫 Cloudinary 上傳 API
      const urlUpload = `https://api.cloudinary.com/v1_1/${cloud}/raw/upload`;
      const body = new URLSearchParams();
      body.set("file", dataUri);
      body.set("api_key", apiKey);
      body.set("timestamp", String(timestamp));
      body.set("public_id", publicId);
      body.set("format", "json");
      body.set("signature", signature);

      const up = await fetch(urlUpload, { method: "POST", body });
      const upTxt = await up.text();
      if (!up.ok) {
        return json(500, { error: "cloudinary upload failed", detail: upTxt });
      }
      const upJ = safeJson(upTxt);

      const result = {
        cloudinaryId: publicId,
        cid: shortId, // 回傳短ID，前端會用 #cid=<這個>
        url: upJ.url || null,
        secure_url: upJ.secure_url || null,
      };
      return json(200, result);
    }

    if (event.httpMethod === "GET") {
      const cid = getParam(event.queryStringParameters, "cid");
      if (!cid) return json(400, { error: "cid is required" });

      const publicId = (process.env.CLOUDINARY_UPLOAD_FOLDER ? `${(process.env.CLOUDINARY_UPLOAD_FOLDER || "").replace(/^\/+|\/+$/g,"")}/` : "") + cid;

      // 嘗試兩種讀取方式：先帶 .json，再不帶
      const rawBase = `https://res.cloudinary.com/${cloud}/raw/upload/${encodeURIComponent(publicId)}`;
      const urlJson = rawBase + ".json";
      const r1 = await fetch(urlJson);
      if (r1.ok) {
        const txt = await r1.text();
        const data = safeJson(txt);
        if (data && typeof data === "object") return corsJson(200, data);
      }
      const r2 = await fetch(rawBase);
      if (r2.ok) {
        const txt = await r2.text();
        const data = safeJson(txt);
        if (data && typeof data === "object") return corsJson(200, data);
      }
      return corsJson(404, { error: "not found or not json" });
    }

    return cors(405, "Method Not Allowed");
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
}

/* -------- Helpers -------- */
function getParam(qs, k){ return qs && (qs[k] ?? qs[k?.toLowerCase?.()]) || null; }
function json(status, obj){
  return { statusCode: status, headers: { "Content-Type":"application/json" }, body: JSON.stringify(obj) };
}
function cors(status, text){
  return { statusCode: status, headers: corsHeaders({"Content-Type":"text/plain"}), body: String(text) };
}
function corsJson(status, obj){
  return { statusCode: status, headers: corsHeaders({"Content-Type":"application/json"}), body: JSON.stringify(obj) };
}
function corsHeaders(extra){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra
  };
}
function safeJson(txt){ try{ return JSON.parse(txt); }catch{ return null; } }
