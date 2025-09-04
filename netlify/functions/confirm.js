// netlify/functions/confirm.js
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    if (!body || !body.total || !Array.isArray(body.items)) {
      return { statusCode: 400, body: "Invalid payload" };
    }

    const repo = process.env.GITHUB_REPO;   // 例： natural-uncle/quotes-ledger
    const token = process.env.GITHUB_TOKEN; // 你的 GitHub PAT
    if (!repo || !token) {
      return { statusCode: 500, body: "Missing server config" };
    }

    const title = `✅ 客戶同意報價 - ${body.customer || "未填姓名"} - ${body.total}元 - ${new Date().toISOString().slice(0,10)}`;

    const lines = [
      `**承辦項目 / 報價日期**: ${body.quoteInfo || ""}`,
      `**客戶**: ${body.customer || ""}`,
      `**電話**: ${body.phone || ""}`,
      `**地址**: ${body.address || ""}`,
      `**預約時間**: ${body.cleanTime || ""}`,
      `**技師**: ${body.technician || ""} (${body.techPhone || ""})`,
      `**其他事項**: ${body.otherNotes || ""}`,
      `**合計**: ${body.total} 元`,
      body.cloudinaryId ? `**Cloudinary ID**: ${body.cloudinaryId}` : "",
      "",
      "### 項目明細",
      "```json",
      JSON.stringify(body.items, null, 2),
      "```"
    ].filter(Boolean);

    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
      },
      body: JSON.stringify({
        title,
        body: lines.join("\n"),
        labels: ["quote-confirmed"]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return { statusCode: 500, body: `GitHub API error: ${errText}` };
    }

    const json = await res.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, issue_url: json.html_url })
    };

  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) };
  }
}
