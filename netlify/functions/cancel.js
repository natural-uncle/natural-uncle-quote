// netlify/functions/cancel.js
// 將指定 Cloudinary public_id 的 context.status 設為 "cancelled" 並記錄取消原因與時間
// 也會將 context.locked 設為 1（避免後續再被變更）
// 以現有 Cloudinary 當作儲存層，無需新增資料庫

const RTYPES = ["raw", "image", "video"];
const DTYPES = ["upload", "authenticated", "private"];

export async function handler(event){
  try{
    if (event.httpMethod !== "POST") return resp(405, "Method Not Allowed");

    const body = JSON.parse(event.body || "{}");
    let id = (body.id || "").trim();
    const reason = String(body.reason || "").slice(0, 500); // 最多 500 字避免太長
    if (!id) return json(400, { error: "Missing id" });

    // 取得 Cloudinary 環境變數
    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud || !apiKey || !apiSecret) {
      return json(500, { error: "Missing Cloudinary env (CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET)" });
    }
    const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    id = normalizeId(id);

    // 嘗試找出對應的 resource（先 Admin API，再 Search API）
    const meta = await findResourceMeta(cloud, auth, id);
    if (!meta) return json(404, { error: "Resource not found" });

    // 更新 context：標示為 cancelled 並加上原因與時間
    const now = new Date().toISOString();
    const newContext = {
      ...(meta.context?.custom || {}),
      locked: "1",
      status: "cancelled",
      cancel_reason: reason,
      cancel_time: now
    };

    const putRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud}/resources/${meta.resource_type}/${meta.type}/${encodeURIComponent(meta.public_id)}`,
      {
        method: "POST",
        headers: { Authorization: auth, "Content-Type":"application/json" },
        body: JSON.stringify({ context: newContext })
      }
    );
    const putText = await safeText(putRes);
    if (!putRes.ok) return json(502, { error: "Failed to update context", response: putText });

    return json(200, {
      ok: true,
      id: meta.public_id,
      resource_type: meta.resource_type,
      type: meta.type,
      context: newContext
    });
  }catch(e){
    return json(500, { error: String(e?.message || e) });
  }
}

function normalizeId(id){
  try{ id = decodeURIComponent(id); }catch{}
  // 去除前後空白、#、查詢參數與副檔名
  id = String(id).trim().replace(/^#+/, "").replace(/[?#].*$/, "");
  return id.replace(/\.(json|txt|bin|pdf|xml|csv|yaml|yml)$/i, "");
}

async function findResourceMeta(cloud, auth, id){
  // 1) 直接嘗試所有 rtype×dtype
  for (const rtype of RTYPES){
    for (const dtype of DTYPES){
      const m = await getAdminMeta(cloud, auth, rtype, dtype, id);
      if (m) return m;
    }
  }
  // 2) 用 Search API 嘗試 public_id 與 quotes/public_id
  const exprs = [
    `public_id="${escapeExpr(id)}"`,
    `public_id="quotes/${escapeExpr(id)}"`,
    `filename="${escapeExpr(basename(id))}"`
  ];
  for (const expr of exprs){
    const m = await searchOne(cloud, auth, expr);
    if (m) return m;
  }
  return null;
}

async function getAdminMeta(cloud, auth, rtype, dtype, publicId){
  const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/${rtype}/${dtype}/${encodeURIComponent(publicId)}`;
  const r = await fetch(url, { headers: { Authorization: auth } });
  if (r.status === 404) return null;
  if (!r.ok) return null;
  return await r.json();
}

async function searchOne(cloud, auth, expr){
  const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/search`;
  const r = await fetch(url, {
    method:"POST",
    headers:{ Authorization: auth, "Content-Type":"application/json", "Cache-Control":"no-store", "Pragma":"no-cache" },
    body: JSON.stringify({ expression: expr, max_results: 1 })
  });
  if (!r.ok) return null;
  const json = await r.json();
  return (json?.resources || [])[0] || null;
}

function basename(s){ const i=s.lastIndexOf("/"); return i>=0?s.slice(i+1):s; }
function escapeExpr(s){ return s.replace(/(["\\])/g,"\\$1"); }

function json(status, obj){
  return {
    statusCode: status,
    headers: {
      "Content-Type":"application/json",
      "Cache-Control":"no-store",
      "Pragma":"no-cache"
    },
    body: JSON.stringify(obj)
  };
}
async function safeText(res){ try{ return await res.text(); }catch{ return "(no body)"; } }
