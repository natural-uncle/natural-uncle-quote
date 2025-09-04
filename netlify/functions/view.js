// netlify/functions/view.js
export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const folder = process.env.CLOUDINARY_FOLDER || "quotes";
    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) return { statusCode: 400, body: "Missing parameters" };

    // 直接用你的 Cloud name 組 URL
    const url = `https://res.cloudinary.com/dijzndzw2/raw/upload/${folder}/${encodeURIComponent(id)}.json`;

    const r = await fetch(url);
    if (!r.ok) return { statusCode: r.status, body: await r.text() };

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
