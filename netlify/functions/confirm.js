// netlify/functions/confirm.js
// 1) 產 Markdown 報價內容 → 建 GitHub Issue（可選）
// 2) 寄 Email（優先 Resend；其次 Brevo；兩者都沒設就略過郵件）
// 必要環境變數：
//   GITHUB_TOKEN (可選)    GITHUB_REPO="owner/repo" (可選)
//   RESEND_API_KEY (可選)  或  BREVO_API_KEY (可選)
//   FROM_EMAIL (寄件人),   TO_EMAIL (收件人)
//   SITE_BASE_URL (可選，用於信件中的查看連結)

export async function handler(event){
  try{
    if (event.httpMethod !== "POST") return resp(405, "Method Not Allowed");
    const data = JSON.parse(event.body || "{}");

    const SITE_BASE_URL = process.env.SITE_BASE_URL || "";
    const { issueUrl } = await maybeCreateIssue(data);
    await maybeSendEmail(data, issueUrl, SITE_BASE_URL);

    return json(200, { ok:true, issue_url: issueUrl || null });
  }catch(e){
    return json(500, { error: String(e?.message || e) });
  }
}

/* ---------- GitHub Issue ---------- */
async function maybeCreateIssue(payload){
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // "owner/name"
  if (!token || !repo) return { issueUrl: null };

  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/issues`;

  const md = toMarkdown(payload);
  const title = `[同意報價] ${payload.customer || "未填姓名"}｜合計 ${payload.total || 0} 元`;

  const r = await fetch(url, {
    method:"POST",
    headers:{
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ title, body: md, labels: ["quote","confirmed"] })
  });

  if (!r.ok) {
    const t = await r.text();
    console.warn("[confirm] GitHub issue failed:", t);
    return { issueUrl: null };
  }

  const j = await r.json();
  return { issueUrl: j.html_url };
}

function toMarkdown(p){
  const items = (p.items||[]).map((it,i)=>`| ${i+1} | ${it.service||""} | ${it.option||""} | ${it.qty||""} | ${it.price||""} | ${it.subtotal||""} |`).join("\n");
  return `# 線上報價單確認
**客戶名稱**：${p.customer||""}  
**電話**：${p.phone||""}  
**地址**：${p.address||""}  
**預約時間**：${p.cleanTime||""}  
**技師**：${p.technician||""}（${p.techPhone||""}）  

## 服務項目
| # | 項目名稱 | 補充說明 | 數量 | 單價 | 小計 |
|---|---|---:|---:|---:|---:|
${items}

**其他事項**：  
${p.otherNotes||""}

## 合計
**${p.total||0} 元**

> 承辦 / 報價：${p.quoteInfo||""}
`;
}

/* ---------- Email ---------- */
async function maybeSendEmail(payload, issueUrl, siteBase){
  const FROM = process.env.FROM_EMAIL;
  const TO = process.env.TO_EMAIL;
  if (!FROM || !TO) return;

  const subject = `客戶同意報價｜${payload.customer||"未填"}｜合計 ${payload.total||0} 元`;
  const md = toMarkdown(payload);
  const html = mdToHtml(md, issueUrl, siteBase);

  if (process.env.RESEND_API_KEY) {
    try{
      const r = await fetch("https://api.resend.com/emails", {
        method:"POST",
        headers:{ "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type":"application/json" },
        body: JSON.stringify({ from: FROM, to: [TO], subject, html })
      });
      if (!r.ok) console.warn("[confirm] Resend failed:", await r.text());
      return;
    }catch(e){ console.warn("[confirm] Resend error:", e); }
  }

  if (process.env.BREVO_API_KEY) {
    try{
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method:"POST",
        headers:{ "api-key": process.env.BREVO_API_KEY, "Content-Type":"application/json" },
        body: JSON.stringify({
          sender: { email: FROM },
          to: [{ email: TO }],
          subject, htmlContent: html
        })
      });
      if (!r.ok) console.warn("[confirm] Brevo failed:", await r.text());
      return;
    }catch(e){ console.warn("[confirm] Brevo error:", e); }
  }
  // 若都沒設，就不寄信
}

function mdToHtml(md, issueUrl, siteBase){
  const esc = s => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br/>");
  const viewLink = siteBase ? `<p><a href="${siteBase}" target="_blank">開啟網站</a></p>` : "";
  const issueLink = issueUrl ? `<p>GitHub Issue：<a href="${issueUrl}">${issueUrl}</a></p>` : "";
  return `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap;">${esc(md)}</pre>${viewLink}${issueLink}`;
}

function resp(status, text){ return { statusCode: status, body: text }; }
function json(status, obj){ return { statusCode: status, headers:{ "Content-Type":"application/json" }, body: JSON.stringify(obj) }; }
