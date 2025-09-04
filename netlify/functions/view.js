// netlify/functions/view.js
// 依短碼（cid）讀回 Cloudinary 上的 raw/json（含雙層 quotes 備援）

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const folder = process.env.CLOUDINARY_FOLDER || "quotes";
    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) return { statusCode: 400, body: "Missing parameters" };

    const base = "https://res.cloudinary.com/dijzndzw2/raw/upload";
    const url1 = `${base}/${folder}/${encodeURIComponent(id)}.json`;            // 正確：quotes/q-xxx.json
    const url2 = `${base}/${folder}/${folder}/${encodeURIComponent(id)}.json`;  // 備援：quotes/quotes/q-xxx.json

    // 先試正常路徑
    let r = await fetch(url1);
    if (!r.ok) {
      // 若 404，再試舊的雙層路徑
      const t1 = await r.text();
      r = await fetch(url2);
      if (!r.ok) return { statusCode: r.status, body: `${t1}\n${await r.text()}` };
    }

    const text = await r.text();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300"
      },
      body: text
    };
  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) };
  }
}
