// netlify/functions/cancel.js (v2)
// 以 Cloudinary Admin「context 專用 API」更新單一 resource 的 context
// 重點：使用 application/x-www-form-urlencoded，避免 JSON 錯誤

const RTYPES = ["raw", "image", "video"];
const DTYPES = ["upload", "authenticated", "private"];

export async function handler(event){
  try{
    if (event.httpMethod !== "POST") return resp(405, "Method Not Allowed");

    const body = JSON.parse(event.body || "{}");
    let id = (body.id || "").trim();
    const reason = String(body.reason || "").slice(0, 500); // 最多 500 字
    if (!id) return json(400, { error: "Missing id" });

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud || !apiKey || !apiSecret) {
      return json(500, { error: "Missing Cloudinary env (CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET)" });
    }
    const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    id = normalizeId(id);

    // 找到目標檔案（先 Admin API，再 Search API）
    const meta = await findResourceMeta(cloud, auth, id);
    if (!meta) return json(404, { error: "Resource not found", id });

    const now = new Date().toISOString();
    // Cloudinary context API 需要「key=value|key2=value2」格式
    const contextKV = [
      ["locked","1"],
      ["status","cancelled"],
      ["cancel_reason", reason],
      ["cancel_time", now],
    ].map(([k,v]) => `${k}=${escapeContextValue(String(v||""))}`).join("|");

    // 🔑 使用 context 專用 endpoint（並用 x-www-form-urlencoded）
    const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/${meta.resource_type}/${meta.type}/context`;
    const form = new URLSearchParams();
    form.append("context", contextKV);
    form.append("public_ids[]", meta.public_id);
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const txt = await safeText(r);
    if (!r.ok) return json(502, { error: "Failed to update context", response: txt });

    return json(200, {
      ok: true,
      id: meta.public_id,
      resource_type: meta.resource_type,
      type: meta.type,
      context: { locked:"1", status:"cancelled", cancel_reason:reason, cancel_time:now },
      raw: tryParseJSON(txt) || txt
    });
  }catch(e){
    return json(500, { error: String(e?.message || e) });
  }
}

function tryParseJSON(s){ try{ return JSON.parse(s); }catch{ return null; } }

function escapeContextValue(v){
  // Cloudinary context kv 的 value 不可包含管線符號；做簡單轉義
  return v.replace(/\|/g, "/");
}

function normalizeId(id){
  try{ id = decodeURIComponent(id); }catch{}
  id = String(id).trim().replace(/^#+/, "").replace(/[?#].*$/, "");
  return id.replace(/\.(json|txt|bin|pdf|xml|csv|yaml|yml)$/i, "");
}

async function findResourceMeta(cloud, auth, id){
  for (const rtype of RTYPES){
    for (const dtype of DTYPES){
      const m = await getAdminMeta(cloud, auth, rtype, dtype, id);
      if (m) return m;
    }
  }
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
  const hit = (json?.resources || [])[0];
  if (!hit) return null;
  // 回傳統一欄位
  return {
    resource_type: hit.resource_type,
    type: hit.type,
    public_id: hit.public_id,
    context: hit.context,
  };
}

function basename(s){ const i=s.lastIndexOf("/"); return i>=0?s.slice(i+1):s; }
function escapeExpr(s){ return s.replace(/(["\\])/g,"\\$1"); }

function json(status, obj){
  return {
    statusCode: status,
    headers: { "Content-Type":"application/json", "Cache-Control":"no-store", "Pragma":"no-cache" },
    body: JSON.stringify(obj)
  };
}
function resp(status, text){ return { statusCode: status, body: text }; }
async function safeText(res){ try{ return await res.text(); }catch{ return "(no body)"; } }
