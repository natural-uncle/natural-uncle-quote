// netlify/functions/view.js
// 將 Cloudinary 的 raw/image/video 檔（通常是 JSON 的 raw 檔）找出來，回 data + locked 狀態
// - 自動移除副檔名(.json/.txt/.pdf...)
// - 若 id 無資料夾，補上 CLOUDINARY_FOLDER (預設 quotes)
// - 會依序嘗試 admin API: raw/image/video + candidates
// - 若仍找不到，使用 Search API 以 public_id / FOLDER/public_id / filename 搜尋
// - 一律回覆 no-store，避免快取造成的舊狀態

const RTYPES = ["raw", "image", "video"];

export async function handler(event) {
  try {
    let id = (event.queryStringParameters?.id || "").trim();
    if (!id) return resp(400, { error: "Missing id" });

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const FOLDER = process.env.CLOUDINARY_FOLDER || "quotes";
    if (!cloud || !apiKey || !apiSecret) {
      return resp(500, { error: "Missing Cloudinary config" });
    }
    const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    // 正規化 id：去頭/尾斜線、拿掉常見副檔名
    id = normalizeId(id);

    // 先組候選 public_id（原樣 / 補資料夾）
    const candidates = unique([
      id,
      !id.includes("/") ? `${FOLDER}/${id}` : null,
    ].filter(Boolean));

    // 1) 直接用 Admin API 嘗試三種 resource_type * 多個 candidates
    let meta = null, rtype = null, publicIdFound = null;
    for (const rt of RTYPES) {
      for (const pid of candidates) {
        const m = await getAdminMeta(cloud, auth, rt, pid);
        if (m) { meta = m; rtype = rt; publicIdFound = pid; break; }
      }
      if (meta) break;
    }

    // 2) Admin 都找不到 → 用 Search API 再找一次
    if (!meta) {
      const found = await searchAny(cloud, auth, id, FOLDER);
      if (found) {
        rtype = found.resource_type;
        publicIdFound = found.public_id;
        // 以找到的 resource_type/public_id 再打一次 Admin API 取得 context
        meta = await getAdminMeta(cloud, auth, rtype, publicIdFound, /*throwOnError*/true);
      }
    }

    if (!meta) {
      return resp(404, { error: "Not found", tried: { id, candidates } });
    }

    const locked = meta?.context?.custom?.locked === "1";
    const fileUrl = meta?.secure_url;
    if (!fileUrl) return resp(500, { error: "Missing secure_url on resource", rtype, publicIdFound });

    // 3) 下載檔案內容（多半是 JSON）
    const r2 = await fetch(fileUrl, {
      method: "GET",
      headers: { "Cache-Control": "no-store", "Pragma": "no-cache" },
    });
    if (!r2.ok) return resp(500, { error: "Fetch resource error", status: r2.status, detail: await safeText(r2) });

    const raw = await r2.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }

    return resp(200, {
      locked,
      data,
      public_id: publicIdFound,
      resource_type: rtype,
    }, true);

  } catch (e) {
    return resp(500, { error: String(e?.message || e) });
  }
}

/* ---------------- helpers ---------------- */

function normalizeId(id) {
  // 去掉 URL 編碼/起始 '#', 'cid=' 等情況（保守處理）
  try { id = decodeURIComponent(id); } catch {}
  id = id.replace(/^#?cid=/i, "");
  id = id.replace(/^\/+|\/+$/g, "");
  // 去掉常見副檔名
  id = id.replace(/\.(json|txt|bin|pdf|xml|csv|yaml|yml)$/i, "");
  return id;
}

async function getAdminMeta(cloud, auth, resourceType, publicId, throwOnError = false) {
  const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/${resourceType}/upload/${encodeURIComponent(publicId)}`;
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: auth,
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    }
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const t = await safeText(r);
    if (throwOnError) throw new Error(`Admin API error (${resourceType}/${publicId}): ${t}`);
    return null;
  }
  return await r.json();
}

async function searchAny(cloud, auth, id, folder) {
  // 用 Cloudinary Search API 嘗試找：
  // - public_id = id
  // - public_id = folder/id
  // - filename = id
  const exprParts = [
    `public_id="${escapeExpr(id)}"`,
    `public_id="${escapeExpr(`${folder}/${id}`)}"`,
    `filename="${escapeExpr(basename(id))}"`,
  ];
  const expr = exprParts.join(" OR ");

  const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/search`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
    },
    body: JSON.stringify({ expression: expr, max_results: 1 })
  });
  if (!r.ok) {
    // 搜尋失敗就當找不到，不 throw
    return null;
  }
  const json = await r.json();
  const res = (json?.resources || [])[0];
  if (!res) return null;
  return res; // 包含 public_id/resource_type/secure_url/（通常也有 context）
}

function basename(id) {
  const i = id.lastIndexOf("/");
  return i >= 0 ? id.slice(i + 1) : id;
}

function escapeExpr(s) {
  // 雖然多半用不到，但保險處理特殊字元
  return s.replace(/(["\\])/g, "\\$1");
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function resp(statusCode, json, noStore = false) {
  const headers = { "Content-Type": "application/json" };
  if (noStore) {
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    headers["Pragma"] = "no-cache";
    headers["Expires"] = "0";
  }
  return { statusCode, headers, body: JSON.stringify(json) };
}

async function safeText(res){ try { return await res.text(); } catch { return "(no body)"; } }
