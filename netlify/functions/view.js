// netlify/functions/view.js
// 依短碼（cid）讀回 Cloudinary 上的 raw/json

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const folder = process.env.CLOUDINARY_FOLDER || "quotes";
    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) return { statusCode: 400, body: "Missing parameters" };

    const url = `https://res.cloudinary.com/dijzndzw2/raw/upload/${folder}/${encodeURIComponent(id)}.json`;

    const r = await fetch(url);
    if (!r.ok) {
      const t = await r.text();
      return { statusCode: r.status, body: t };
    }

    const text = await r.text(); // 原樣轉出
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
