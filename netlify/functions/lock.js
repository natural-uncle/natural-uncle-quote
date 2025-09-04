// netlify/functions/lock.js
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { id } = JSON.parse(event.body || "{}");
    if (!id) {
      return { statusCode: 400, body: "Missing id" };
    }

    const cloud = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloud || !apiKey || !apiSecret) {
      return { statusCode: 500, body: "Missing Cloudinary config" };
    }

    // 以 Admin API 更新 raw/upload 資源的 context
    const url = `https://api.cloudinary.com/v1_1/${cloud}/resources/raw/upload/${encodeURIComponent(id)}`;

    // Cloudinary 接受 x-www-form-urlencoded；把 context 設為 locked=1
    const form = new URLSearchParams();
    form.set("context", "locked=1");

    const auth = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form
    });

    const j = await r.json();

    if (!r.ok) {
      return {
        statusCode: 500,
        body: `Cloudinary lock error: ${JSON.stringify(j)}`
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, id, locked: true })
    };
  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) };
  }
}
