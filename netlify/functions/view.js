// netlify/functions/view.js
// 讀取 Cloudinary 上儲存的 JSON（raw/upload/<public_id>）並回報 locked 狀態
export async function handler(event) {
  try{
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode:400, body:"Missing id" };

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloud || !apiKey || !apiSecret) {
      return { statusCode: 500, body: "Missing Cloudinary config" };
    }

    // 1) 先查資源細節（拿 context 與 secure_url）
    const detailUrl = `https://api.cloudinary.com/v1_1/${cloud}/resources/raw/upload/${encodeURIComponent(id)}`;
    const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const dres = await fetch(detailUrl, { headers: { Authorization: auth } });
    const djson = await dres.json();
    if (!dres.ok) {
      return { statusCode: dres.status, body: `Cloudinary detail error: ${JSON.stringify(djson)}` };
    }

    const locked = !!(djson?.context?.custom?.locked === "1" || djson?.context?.locked === "1");

    // 2) 下載 JSON 內容（即你當初上傳的報價 JSON）
    let data = {};
    try{
      const raw = await fetch(djson.secure_url);
      data = await raw.json();
    }catch(_){ /* 若不是 JSON 或抓不到，就回空物件 */ }

    return {
      statusCode: 200,
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ ...data, locked })
    };
  }catch(e){
    return { statusCode: 500, body: String(e?.message || e) };
  }
}
