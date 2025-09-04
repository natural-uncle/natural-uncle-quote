// netlify/functions/view.js
// 讀取 Cloudinary raw JSON 內容 + 回報 locked 狀態
// 強制「不快取」，並自動處理：去除副檔名、缺資料夾時補上 CLOUDINARY_FOLDER (預設 quotes)

export async function handler(event) {
  try {
    let id = event.queryStringParameters?.id || "";
    if (!id) return resp(400, { error: "Missing id" });

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const FOLDER = process.env.CLOUDINARY_FOLDER || "quotes";
    if (!cloud || !apiKey || !apiSecret) return resp(500, { error: "Missing Cloudinary config" });

    const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    // 正規化：去掉開頭/結尾斜線 + 副檔名
    id = id.trim().replace(/^\/+|\/+$/g, "").replace(/\.(json|txt|bin|pdf)$/i, "");

    // 嘗試 1：原始 public_id
    let meta = await getAdminMeta(cloud, auth, id);

    // 嘗試 2：若不含資料夾，補上預設 FOLDER
    if (!meta && !id.includes("/")) {
      meta = await getAdminMeta(cloud, auth, `${FOLDER}/${id}`);
      if (meta) id = `${FOLDER}/${id}`;
    }

    if (!meta) return resp(404, { error: "Not found", tried: id });

    const locked = meta?.context?.custom?.locked === "1";
    const fileUrl = meta?.secure_url;
    if (!fileUrl) return resp(500, { error: "Missing secure_url on resource" });

    const r2 = await fetch(fileUrl, {
      method: "GET",
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" }
    });
    if (!r2.ok) return resp(500, { error: "Fetch resource error", detail: await safeText(r2) });

    const raw = await r2.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    return resp(200, { locked, data, public_id: id }, true);

  } catch (e) {
    return resp(500, { error: String(e?.message || e) });
  }
}

async function getAdminMeta(cloud, auth, publicId) {
  const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/raw/upload/${encodeURIComponent(publicId)}`;
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: auth,
      "Cache-Control": "no-store",
      Pragma: "no-cache"
    }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await safeText(r));
  return await r.json();
}

function resp(statusCode, json, noStore = false) {
  const h = { "Content-Type": "application/json" };
  if (noStore) {
    h["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    h["Pragma"] = "no-cache";
    h["Expires"] = "0";
  }
  return { statusCode, headers: h, body: JSON.stringify(json) };
}

async function safeText(res){ try{ return await res.text(); }catch{ return "(no body)"; } }
