// netlify/functions/cancel.js (v3 - use Upload API 'context' method with signature)
import crypto from "crypto";

const RTYPES = ["raw","image","video"];
const DTYPES = ["upload","authenticated","private"];

export async function handler(event){
  try{
    if(event.httpMethod!=="POST") return json(405,{error:"Method Not Allowed"});
    const body = JSON.parse(event.body||"{}");
    let id = (body.id||"").trim();
    const reason = String(body.reason||"").slice(0,500);
    if(!id) return json(400,{error:"Missing id"});

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if(!cloud || !apiKey || !apiSecret){
      return json(500,{error:"Missing Cloudinary env (CLOUDINARY_CLOUD_NAME/_API_KEY/_API_SECRET)"});
    }

    id = normalizeId(id);

    // 先找出 resource_type（image / video / raw）與 public_id
    const meta = await findResourceMeta(cloud, apiKey, apiSecret, id);
    if(!meta) return json(404, {error:"Resource not found", id});

    const nowISO = new Date().toISOString();
    const contextKV = [
      ["locked","1"],
      ["status","cancelled"],
      ["cancel_reason", reason],
      ["cancel_time", nowISO],
    ].map(([k,v])=> `${k}=${escapePipe(String(v||""))}`).join("|");

    // 使用 Upload API 的 context 方法：POST /v1_1/<cloud>/<resource_type>/context（需簽名）
    const timestamp = Math.floor(Date.now()/1000);
    const paramsToSign = {
      command: "add",
      context: contextKV,
      "public_ids[]": meta.public_id,
      timestamp: String(timestamp)
    };
    const signature = signParams(paramsToSign, apiSecret);

    const form = new URLSearchParams();
    form.append("command","add");
    form.append("context", contextKV);
    form.append("public_ids[]", meta.public_id);
    form.append("timestamp", String(timestamp));
    form.append("api_key", apiKey);
    form.append("signature", signature);

    const url = `https://api.cloudinary.com/v1_1/${cloud}/${meta.resource_type}/context`;
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded" },
      body: form.toString()
    });
    const txt = await r.text();
    if(!r.ok){
      return json(502, { error: "Failed to update context (upload API)", status:r.status, response: txt });
    }
    let parsed = null; try{ parsed = JSON.parse(txt); }catch{}

    return json(200, { 
      ok:true, id: meta.public_id, resource_type: meta.resource_type,
      context: { locked:"1", status:"cancelled", cancel_reason:reason, cancel_time:nowISO },
      raw: parsed || txt
    });

  }catch(e){
    return json(500,{error:String(e?.message||e)});
  }
}

function signParams(params, apiSecret){
  // 依 Cloudinary 規則：參數（不含 api_key/signature）按鍵名排序後，以 & 串接，再加上 apiSecret 做 SHA1
  const entries = Object.entries(params)
    .filter(([k,v]) => v!==undefined && v!==null && v!=="")
    .sort((a,b)=> a[0].localeCompare(b[0]))
    .map(([k,v])=> `${k}=${v}`)
    .join("&");
  const toSign = entries + apiSecret;
  return crypto.createHash("sha1").update(toSign).digest("hex");
}

function escapePipe(v){ return v.replace(/\|/g,"/"); }

function normalizeId(id){
  try{ id = decodeURIComponent(id); }catch{}
  id = id.replace(/^#+/,"").replace(/[?#].*$/,"");
  return id.replace(/\.(json|txt|bin|pdf|xml|csv|yaml|yml)$/i,"");
}

async function findResourceMeta(cloud, apiKey, apiSecret, id){
  const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  // 先用 Admin API（需 delivery type）
  for(const rtype of RTYPES){
    for(const dtype of DTYPES){
      const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/${rtype}/${dtype}/${encodeURIComponent(id)}`;
      const r = await fetch(url, { headers:{ Authorization: auth, "Cache-Control":"no-store" } });
      if(r.status===404) continue;
      if(!r.ok) continue;
      const j = await r.json();
      if(j && j.public_id) return { resource_type: j.resource_type, public_id: j.public_id };
    }
  }
  // 找不到就用 Search API 多路徑嘗試
  const s = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/search`, {
    method:"POST",
    headers:{ Authorization: auth, "Content-Type":"application/json" },
    body: JSON.stringify({ expression: `public_id="${id}" OR public_id="quotes/${id}"`, max_results: 1 })
  });
  if(!s.ok) return null;
  const js = await s.json();
  const hit = (js.resources||[])[0];
  return hit ? { resource_type: hit.resource_type, public_id: hit.public_id } : null;
}

function json(status, obj){
  return { statusCode: status, headers:{ "Content-Type":"application/json","Cache-Control":"no-store" }, body: JSON.stringify(obj) };
}
