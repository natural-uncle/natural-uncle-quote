// netlify/functions/view.js
// 讀取 Cloudinary raw 資源的 JSON 內容，並回報 locked 狀態（context.locked=1）
// 已加上強制「不快取」回應標頭，確保每次開啟都能即時反映鎖定

export async function handler(event) {
  try {
    const id = event.queryStringParameters?.id;
    if (!id) {
      return { statusCode: 400, body: "Missing id" };
    }

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud || !apiKey || !apiSecret) {
      return { statusCode: 500, body: "Missing Cloudinary config" };
    }

    const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    // 1) 用 Admin API 取得資源資訊（含 context 與 secure_url）
    const adminUrl = `https://api.cloudinary.com/v1_1/${cloud}/resources/raw/upload/${encodeURIComponent(id)}`;
    const r1 = await fetch(adminUrl, {
      method: "GET",
      headers: {
        Authorization: auth,
        // 防快取
        "Cache-Control": "no-store",
        Pragma: "no-cache"
      }
    });

    if (r1.status === 404) {
      return resp(404, { error: "Not found" });
    }
    if (!r1.ok) {
      const tt = await safeText(r1);
      return resp(500, { error: "Cloudinary admin error", detail: tt });
    }

    const meta = await r1.json();
    const locked = meta?.context?.custom?.locked === "1";

    // 2) 下載 raw 檔內容（一般是你上傳的 JSON）
    //    建議用 meta.secure_url，且加上版本參數避免 CDN 陳舊（meta.secure_url 通常已含版本）
    const fileUrl = meta?.secure_url;
    if (!fileUrl) {
      return resp(500, { error: "Missing secure_url on resource" });
    }

    const r2 = await fetch(fileUrl, {
      method: "GET",
      headers: {
        // 防快取（即使 CDN 仍可能有快取，搭配上面 admin 查詢即可準確拿到 locked）
        "Cache-Control": "no-store",
        Pragma: "no-cache"
      }
    });

    if (!r2.ok) {
      const tt = await safeText(r2);
      return resp(500, { error: "Fetch resource error", detail: tt });
    }

    const raw = await r2.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      // 如果不是 JSON，就原樣回傳字串
      data = raw;
    }

    return resp(200, { locked, data }, /*noStore=*/true);

  } catch (e) {
    return resp(500, { error: String(e?.message || e) });
  }
}

function resp(statusCode, jsonBody, noStore = false) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (noStore) {
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    headers["Pragma"] = "no-cache";
    headers["Expires"] = "0";
  }
  return {
    statusCode,
    headers,
    body: JSON.stringify(jsonBody)
  };
}

async function safeText(res) {
  try { return await res.text(); } catch { return "(no body)"; }
}
