// netlify/functions/confirm.js
// 建 GitHub Issue（Markdown 報價表）＋ 用 Brevo( Sendinblue ) 發通知信

// ----- 小工具：數字千分位、文字轉義 -----
function ntw(n){ const v=Number(n||0); return isNaN(v)?String(n):v.toLocaleString("zh-TW"); }
function esc(s){ return String(s ?? "").replaceAll("|","\\|").replaceAll("\n"," "); }

// ----- 組 Markdown（用在 GitHub Issue 與純文字信件） -----
function asMarkdown(payload, issueUrl){
  const { quoteInfo, customer, phone, address, technician, techPhone, cleanTime, otherNotes, total, items=[] } = payload;
  const today = new Date().toISOString().slice(0,10);

  const header = `# 🧾 報價單確認（${customer || "未填姓名"}）\n`;
  const meta = [
    `**承辦項目 / 報價日期**：${quoteInfo || ""}`,
    `**客戶**：${customer || ""}`,
    `**電話**：${phone || ""}`,
    `**地址**：${address || ""}`,
    `**預約時間**：${cleanTime || ""}`,
    `**技師**：${technician || ""}（${techPhone || ""}）`,
    `**建立日期**：${today}`
  ].join("\n");

  const tableHead = `\n## 服務項目\n\n| 項目 | 補充說明 | 數量 | 單價(元) | 小計(元) |\n|---|---|---:|---:|---:|\n`;
  const tableRows = items.map(it =>
    `| ${esc(it.service)} | ${esc(it.option)} | ${ntw(it.qty)} | ${ntw(it.price)} | ${ntw(it.subtotal)} |`
  ).join("\n") || "| （無） |  | 0 | 0 | 0 |";

  const totalLine = `\n**合計：NT$ ${ntw(total)}**\n`;
  const notes = `\n## 其他事項\n${otherNotes || "（無）"}\n`;
  const link = issueUrl ? `\n> 記錄連結：${issueUrl}\n` : "";

  return `${header}\n${meta}\n${tableHead}${tableRows}\n${totalLine}${notes}${link}`;
}

// ----- 組 Email HTML（較好閱讀的信件版本） -----
function toEmailHTML(payload, issueUrl){
  const { quoteInfo, customer, phone, address, technician, techPhone, cleanTime, otherNotes, total, items=[] } = payload;
  const rows = items.map(it=>`
    <tr>
      <td>${esc(it.service)}</td>
      <td>${esc(it.option)}</td>
      <td style="text-align:right;">${ntw(it.qty)}</td>
      <td style="text-align:right;">${ntw(it.price)}</td>
      <td style="text-align:right;">${ntw(it.subtotal)}</td>
    </tr>`
  ).join("") || `<tr><td colspan="5">（無）</td></tr>`;

  return `<!doctype html>
  <html><body style="font-family:Arial,Helvetica,'Microsoft JhengHei',sans-serif;line-height:1.6;">
    <h2>🧾 報價單確認 - ${customer || "未填姓名"}</h2>
    <p>
      <b>承辦項目 / 報價日期：</b>${quoteInfo || ""}<br>
      <b>客戶：</b>${customer || ""}　<b>電話：</b>${phone || ""}<br>
      <b>地址：</b>${address || ""}<br>
      <b>預約時間：</b>${cleanTime || ""}<br>
      <b>技師：</b>${technician || ""}（${techPhone || ""}）
    </p>

    <h3>服務項目</h3>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;">
      <thead>
        <tr>
          <th>項目</th><th>補充說明</th>
          <th style="text-align:right;">數量</th>
          <th style="text-align:right;">單價(元)</th>
          <th style="text-align:right;">小計(元)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="font-size:18px;margin-top:12px;"><b>合計：NT$ ${ntw(total)}</b></p>

    <h3>其他事項</h3>
    <p>${(otherNotes || "（無）").replace(/\n/g,"<br>")}</p>

    ${issueUrl ? `<p>記錄連結：<a href="${issueUrl}">${issueUrl}</a></p>` : ""}

    <hr>
    <small>本郵件為系統通知，請勿直接回覆。</small>
  </body></html>`;
}

// ----- 建立 GitHub Issue，並把內容改為 Markdown 報價表 -----
async function createGithubIssue(payload){
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if(!repo || !token) throw new Error("Missing server config: GITHUB_REPO / GITHUB_TOKEN");

  const title = `🧾 報價單確認 - ${payload.customer || "未填姓名"} - NT$${ntw(payload.total)} - ${new Date().toISOString().slice(0,10)}`;

  // 先開 Issue（暫時 body）
  const r1 = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json" },
    body: JSON.stringify({ title, body: "建立中…", labels: ["quote-confirmed","報價單"] })
  });
  if(!r1.ok){ throw new Error(`GitHub API error: ${await r1.text()}`); }
  const issue = await r1.json();

  // 用完整 Markdown 更新 Issue 內容
  const md = asMarkdown(payload, issue.html_url);
  const r2 = await fetch(`https://api.github.com/repos/${repo}/issues/${issue.number}`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github+json" },
    body: JSON.stringify({ body: md })
  });
  if(!r2.ok){ throw new Error(`GitHub API error: ${await r2.text()}`); }

  return issue.html_url;
}

// ----- 用 Brevo API 寄信 -----
async function sendViaBrevo(payload, issueUrl){
  const key = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM;         // 寄件者（需在 Brevo 驗證）
  const toValue = process.env.EMAIL_TO;        // 收件者，可逗號分隔
  const prefix = process.env.EMAIL_SUBJECT_PREFIX || "報價單確認";

  if(!key || !from || !toValue) return { skipped: true };

  const subject = `${prefix}｜${payload.customer || "未填姓名"}｜NT$${ntw(payload.total)}`;
  const text = asMarkdown(payload, issueUrl);
  const html = toEmailHTML(payload, issueUrl);

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender: { email: from },
      to: toValue.split(",").map(e => ({ email: e.trim() })).filter(x=>x.email),
      subject,
      textContent: text,
      htmlContent: html
    })
  });

  if(!r.ok){
    throw new Error(`Brevo error: ${await r.text()}`);
  }
  return { ok: true };
}

// ----- Netlify Function 入口 -----
export async function handler(event){
  if(event.httpMethod !== "POST"){ return { statusCode:405, body:"Method Not Allowed" }; }

  try{
    const body = JSON.parse(event.body || "{}");
    if(!body || !body.total || !Array.isArray(body.items)){
      return { statusCode:400, body:"Invalid payload" };
    }

    // 1) 建 Issue（Markdown）
    const issueUrl = await createGithubIssue(body);

    // 2) 寄 Email（若未設定必需變數則略過，不當作錯誤）
    try{
      await sendViaBrevo(body, issueUrl);
    }catch(e){
      console.error(e);
      // 郵件失敗不阻擋主流程：仍回成功，但附帶 email_error
      return { statusCode:200, body: JSON.stringify({ ok:true, issue_url: issueUrl, email_error: String(e?.message || e) }) };
    }

    return { statusCode:200, body: JSON.stringify({ ok:true, issue_url: issueUrl }) };

  }catch(e){
    return { statusCode:500, body: String(e?.message || e) };
  }
}
