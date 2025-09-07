/* =====================
   公用工具
===================== */
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return document.querySelectorAll(sel); }
function getParam(name){ try{ return new URL(location.href).searchParams.get(name) || ""; }catch(_){ return ""; } }
function getCid(){
  const q = getParam('cid'); if (q) return q;
  const m = (location.hash||"").match(/[#&?]cid=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}
function isAdmin(){ return getParam('admin') === '1' || /[?&]admin=1/.test(location.hash||""); }
function setText(el, s){ if (el) el.textContent = String(s); }
function addClass(el, c){ if (el) el.classList.add(c); }
function removeClass(el, c){ if (el) el.classList.remove(c); }
function toggle(el, show){ if (el) el.classList.toggle('d-none', !show); }

function wantShowCancel(){ return true; }


/* 取消狀態全域旗標 */
window.__QUOTE_CANCELLED__ = false;

/* =====================
   Header 初始化
===================== */
(function initHeader(){
  const el = qs("#quoteInfo");
  if (!el) return;
  const d = new Date();
  const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  el.innerHTML = `<span class="qi-proj">承辦項目：家電清洗服務</span><span class="qi-sep"> ｜ </span><span class="qi-date">報價日期：${dateStr}</span>`;
})();

/* =====================
   預約時間合成
===================== */
function updateCleanFull(){
  const dv = qs("#cleanDate")?.value;
  const tv = qs("#cleanTime")?.value;
  if(!dv || !tv) return;
  const dt = new Date(`${dv}T${tv}`);
  const wd = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][dt.getDay()];
  const yyyy = dt.getFullYear(); const mm = String(dt.getMonth()+1).padStart(2,'0'); const dd = String(dt.getDate()).padStart(2,'0');
  const hh = String(dt.getHours()).padStart(2,'0'); const mi = String(dt.getMinutes()).padStart(2,'0');
  const ampm = dt.getHours() < 12 ? "上午" : "下午";
  qs("#cleanFull").innerHTML = `<span class="cf-date">${yyyy}/${mm}/${dd}（${wd}）</span><span class="cf-time">${ampm} ${hh}:${mi} 開始</span>`;
}
qs("#cleanDate")?.addEventListener("change", updateCleanFull);
qs("#cleanTime")?.addEventListener("change", updateCleanFull);

/* =====================
   自動帶價 + 合計
===================== */
function updateTotals(){
  let total = 0, hasAC=false, hasPipe=false;
  qsa("#quoteTable tbody tr").forEach(tr=>{
    const s = tr.querySelector(".service")?.value || "";
    if(s === "冷氣清洗") hasAC = true;
    if(s === "自來水管清洗") hasPipe = true;
  });
  qsa("#quoteTable tbody tr").forEach(tr=>{
    const service = tr.querySelector(".service")?.value || "";
    const option  = tr.querySelector(".option")?.value  || "";
    const qtyEl   = tr.querySelector(".qty");
    const priceEl = tr.querySelector(".price");
    const noteEl  = tr.querySelector(".discount-note");
    const subEl   = tr.querySelector(".subtotal");
    const qty = Math.max(1, Number(qtyEl?.value || 1));
    let price = Number(priceEl?.value || 0);
    if(noteEl) noteEl.textContent = "";
    const overridden = priceEl?.dataset.override === "true";
    if(!overridden){
      if(service === "冷氣清洗" && option.includes("分離式")){
        price = (qty >= 3) ? 1500 : 1800;
        if(qty >= 3 && noteEl) noteEl.textContent = "已套用三台以上優惠價";
      } else if(service === "冷氣清洗" && option.includes("吊隱式")){
        price = 2800;
      } else if(service === "洗衣機清洗" && option.includes("直立式")){
        price = hasAC ? 1800 : 2000;
        if(hasAC && noteEl) noteEl.textContent = "已套用冷氣清洗優惠價";
      } else if(service === "防霉處理"){
        price = (qty >= 5) ? 250 : 300;
        if(qty >= 5 && noteEl) noteEl.textContent = "已套用五台以上優惠價";
      } else if(service === "臭氧殺菌"){
        price = (qty >= 5) ? 150 : 200;
        if(qty >= 5 && noteEl) noteEl.textContent = "已套用五台以上優惠價";
      } else if(service === "變形金剛機型"){ price = 500; }
      else if(service === "一體式水盤機型"){ price = 500; }
      else if(service === "超長費用"){ price = 300; }
      else if(service === "水塔清洗"){
        price = hasPipe ? 800 : 1000;
        if(hasPipe && noteEl) noteEl.textContent = "已套用自來水管清洗優惠價";
      }
      priceEl.value = price;
    }
    const subtotal = qty * (Number(priceEl?.value || price) || 0);
    subEl.textContent = String(subtotal);
    total += subtotal;
  });
  setText(qs("#total"), total);
  setText(qs("#totalMobile"), total);
}
function applyMobileLabels(){
  const labels = Array.from(qsa('#quoteTable thead th')).map(th => th.textContent.trim());
  qsa('#quoteTable tbody tr').forEach(tr=>{
    Array.from(tr.children).forEach((td, i)=> td.setAttribute('data-label', labels[i] || '') );
  });
}
qs("#quoteTable tbody")?.addEventListener("change", (e)=>{
  const t = e.target;
  if(t.classList.contains("service") || t.classList.contains("option") || t.classList.contains("qty")){
    const rowPrice = t.closest("tr").querySelector(".price");
    if(rowPrice && rowPrice.dataset.override) delete rowPrice.dataset.override;
    updateTotals();
  }
});
qs("#quoteTable tbody")?.addEventListener("input", (e)=>{
  const t = e.target;
  if(t.classList.contains("price")){ t.dataset.override = "true"; updateTotals(); }
  else if(t.classList.contains("qty")){ updateTotals(); }
});
qs("#addRow")?.addEventListener("click", ()=>{
  const tbody = qs("#quoteTable tbody");
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <select class="form-select service">
        <option value="">請選擇</option>
        <option value="冷氣清洗">冷氣清洗</option>
        <option value="洗衣機清洗">洗衣機清洗</option>
        <option value="防霉處理">防霉處理</option>
        <option value="臭氧殺菌">臭氧殺菌</option>
        <option value="變形金剛機型">變形金剛機型</option>
        <option value="一體式水盤機型">一體式水盤機型</option>
        <option value="超長費用">超長費用</option>
        <option value="自來水管清洗">自來水管清洗</option>
        <option value="水塔清洗">水塔清洗</option>
      </select>
    </td>
    <td>
      <select class="form-select option">
        <option value="">請選擇</option>
        <option>分離式（壁掛式）</option>
        <option>吊隱式（隱藏式）</option>
        <option>直立式</option>
        <option>家用</option>
        <option>特殊機型額外加收費</option>
        <option>冷氣防霉處理（抑菌噴劑）</option>
        <option>高臭氧殺菌30分鐘</option>
        <option>加購價</option>
        <option>無廚一衛</option>
        <option>一廚一衛</option>
        <option>一廚兩衛</option>
        <option>一廚三衛</option>
        <option>一廚四衛</option>
      </select>
    </td>
    <td><input type="number" class="form-control qty" value="1" min="1" /></td>
    <td><input type="number" class="form-control price" value="0" /><small class="discount-note"></small></td>
    <td class="subtotal">0</td>
    <td><button class="btn btn-danger btn-sm removeRow">刪除</button></td>`;
  tbody.appendChild(tr);
  updateTotals(); applyMobileLabels();
});
qs("#quoteTable tbody")?.addEventListener("click",(e)=>{
  const t = e.target;
  if(t.classList.contains("removeRow")){
    t.closest("tr").remove();
    updateTotals(); applyMobileLabels();
  }
});

/* =====================
   本機保險（舊 #data 連結）
===================== */
function markLocallyLocked(key){ try{ localStorage.setItem(key, "1"); }catch(_){} }
function isLocallyLocked(key){ try{ return localStorage.getItem(key)==="1"; }catch(_){ return false; } }

/* =====================
   送出「我同意此報價」
===================== */
async function handleConfirmSubmit(clickedBtn){
  if (clickedBtn && clickedBtn.disabled) return;
  const originalText = clickedBtn ? clickedBtn.textContent : "";
  try{
    if (clickedBtn){ clickedBtn.disabled = true; clickedBtn.textContent = "送出中…"; }

    const payload = collectShareData();
    let cid = null;
    const hash = location.hash || "";
    const cidFromHash = hash.startsWith("#cid=") ? decodeURIComponent(hash.replace("#cid=","")) : "";
    if (cidFromHash) { cid = cidFromHash; payload.cloudinaryId = cid; }

    const res = await fetch("/.netlify/functions/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if(!res.ok){
      const t = await res.text(); alert("送出失敗：" + t);
      if (clickedBtn){ clickedBtn.disabled = false; clickedBtn.textContent = originalText; }
      return;
    }
    await res.json();

    alert(`✅ 感謝您的確認，我們明日見囉！😊

為確保清洗順利進行，煩請提前清出冷氣室內機下方空間，以便擺放 A 字梯。

若下方為以下家具，將由現場人員視情況協助判斷是否可移動，敬請見諒：
・大型衣櫃、書櫃等重物
・無法移動之床或沙發
・其他無法暫移之家具

如有異動也歡迎提前與我們聯繫，謝謝您配合！

— 自然大叔 敬上`);

    if (cid) {
      try{
        await fetch("/.netlify/functions/lock", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ id: cid })
        });
      }catch(_){}
      setTimeout(()=>{ location.href = location.pathname + "#cid=" + encodeURIComponent(cid); location.reload(); }, 300);
      markLocallyLocked("locked:cid:"+cid);
    } else if (hash.startsWith("#data=")) {
      markLocallyLocked("locked:data:"+hash);
      const btn = qs("#confirmBtnDesktop");
      if (btn){ btn.textContent = "已送出同意"; btn.disabled = true; }
    }

  }catch(err){
    console.error(err);
    alert("送出失敗，請稍後再試。");
    if (clickedBtn){ clickedBtn.disabled = false; clickedBtn.textContent = originalText; }
  }
}
qs('#confirmBtnDesktop')?.addEventListener('click', function(){ handleConfirmSubmit(this); });
qs('#confirmBtnMobile')?.addEventListener('click', function(){ handleConfirmSubmit(this); });

/* =====================
   產生分享連結
===================== */
async function handleShareClick(){
  try{
    const payload = collectShareData();
    const res = await fetch("/.netlify/functions/share", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if(!res.ok){ const t = await res.text(); alert("產生連結失敗：" + t); return; }
    const data = await res.json();
    const href = data.share_url || data.pdf_url || "#";
    const box = qs("#shareLinkBox");
    removeClass(box, "d-none");
    box.innerHTML = `
      <div class="mb-1 fw-bold">專屬報價單網址</div>
      <div class="input-group">
        <input type="text" class="form-control" id="shareLinkInput" value="${href}" readonly>
        <button class="btn btn-primary" id="copyLinkBtn" type="button">📋 一鍵複製</button>
      </div>
      <div class="mt-2"><a href="${href}" target="_blank">${href}</a></div>`;
    qs('#copyLinkBtn')?.addEventListener('click', async ()=>{
      const link = qs('#shareLinkInput')?.value || href;
      try{
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
        else { const ta=document.createElement('textarea'); ta.value=link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
        const el=qs('#copyLinkBtn'); const orig=el.textContent; el.textContent="✅ 已複製"; setTimeout(()=> el.textContent=orig,1500);
      }catch(_){ alert("複製失敗，請手動選取複製"); }
    });
  }catch(err){ console.error(err); alert("產生連結失敗，請稍後再試。"); }
}
qs("#shareLinkBtn")?.addEventListener("click", handleShareClick);
qs('#shareLinkBtnMobile')?.addEventListener('click', handleShareClick);

/* =====================
   序列化
===================== */
function collectShareData(){
  const items = [];
  qsa("#quoteTable tbody tr").forEach(tr=>{
    items.push({
      service: tr.querySelector(".service")?.value || "",
      option:  tr.querySelector(".option")?.value  || "",
      qty:     tr.querySelector(".qty")?.value     || "1",
      price:   tr.querySelector(".price")?.value   || "0",
      subtotal:tr.querySelector(".subtotal")?.textContent || "0",
      overridden: tr.querySelector(".price")?.dataset.override === "true"
    });
  });
  return {
    quoteInfo: qs("#quoteInfo").textContent.replace(/\s+/g,' ').trim(),
    customer:  qs("#customerName").value,
    phone:     qs("#customerPhone").value,
    address:   qs("#customerAddress").value,
    technician:qs("#technicianName").value,
    techPhone: qs("#technicianPhone").value,
    cleanTime: qs("#cleanFull").textContent,
    otherNotes:qs("#otherNotes").value,
    items, total: qs("#total").textContent
  };
}

/* =====================
   可見性（考慮取消狀態）
===================== */
function setReadonlyButtonsVisibility(canConfirm){
  const admin = isAdmin();
  const cancelled = !!window.__QUOTE_CANCELLED__;
  const effectiveConfirm = canConfirm && !cancelled;

  const shareDesk = qs("#shareLinkBtn"); if (shareDesk) shareDesk.style.display = "none";
  const shareM   = qs("#shareLinkBtnMobile"); if (shareM) shareM.style.display = "none";

  const ro = qs("#readonlyActions");
  if (ro) ro.classList.toggle("d-none", !(effectiveConfirm || admin));

  // 確認按鈕永遠不在 cancelled 顯示
  const mConfirm = qs("#confirmBtnMobile");
  const dConfirm = qs("#confirmBtnDesktop");
  if (mConfirm) mConfirm.classList.toggle("d-none", !effectiveConfirm);
  if (dConfirm) dConfirm.classList.toggle("d-none", !effectiveConfirm);
}

/* =====================
   套用唯讀資料
===================== */
function applyReadOnlyData(data){
  if(data.quoteInfo){
    const qi = qs("#quoteInfo");
    const m = data.quoteInfo.match(/承辦項目：([^｜\s]+).*?報價日期：(\d{4}\/\d{2}\/\d{2})/);
    qi.innerHTML = m ? `<span class="qi-proj">承辦項目：${m[1]}</span><span class="qi-sep"> ｜ </span><span class="qi-date">報價日期：${m[2]}</span>` : data.quoteInfo;
  }
  qs("#customerName").value   = data.customer  || "";
  qs("#customerPhone").value  = data.phone     || "";
  qs("#customerAddress").value= data.address   || "";
  qs("#technicianName").value = data.technician|| "";
  qs("#technicianPhone").value= data.techPhone || "";
  (function(){
    const cf = qs("#cleanFull");
    const s = data.cleanTime || "尚未選擇";
    const m = s.match(/^(\d{4}\/\d{2}\/\d{2}（[^）]+）)\s*(上午|下午)?\s*([0-2]\d:[0-5]\d)/);
    if (m) {
      const datePart = m[1];
      const timePart = `${m[2] ? m[2] + ' ' : ''}${m[3]} 開始`;
      cf.innerHTML = `<span class="cf-date">${datePart}</span><span class="cf-time">${timePart}</span>`;
    } else {
      cf.textContent = s;
    }
  })();
  (function(){
    const row = document.querySelector('#cleanFullBox .row');
    if (row) row.style.display = 'none';
    const cd = qs('#cleanDate'); const ct = qs('#cleanTime');
    if (cd) cd.style.display = 'none';
    if (ct) ct.style.display = 'none';
  })();
  qs("#otherNotes").value     = data.otherNotes|| "";
  const tbody = qs("#quoteTable tbody"); tbody.innerHTML = "";
  (data.items || []).forEach(it=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><select class="form-select service" disabled><option>${it.service||""}</option></select></td>
      <td><select class="form-select option" disabled><option>${it.option||""}</option></select></td>
      <td><input type="number" class="form-control qty" value="${it.qty||1}" readonly /></td>
      <td><input type="number" class="form-control price" value="${it.price||0}" readonly /><small class="discount-note"></small></td>
      <td class="subtotal">${it.subtotal||0}</td>
      <td></td>`;
    tbody.appendChild(tr);
  });
  qsa("input, textarea").forEach(el=>el.setAttribute("readonly", true));
  qsa("select").forEach(el=>el.setAttribute("disabled", true));
  ["addRow","shareLinkBtn","shareLinkBtnMobile"].forEach(id=>{ const el = qs("#"+id); if(el) el.style.display="none"; });
  updateTotals();
}

/* =====================
   取消狀態（含 payload.resource）
===================== */
function extractResource(p){
  if (!p) return null;
  if (p.resource) return p.resource;
  return p;
}
function applyCancelStatus(payload){
  try{
    const resource = extractResource(payload);
    let cancelled = false;
    if (resource?.resource_type === "raw") {
      const tags = resource?.tags || [];
      if (Array.isArray(tags) && tags.includes("cancelled")) cancelled = true;
    } else {
      const status = resource?.context?.custom?.status;
      if (status === "cancelled") cancelled = true;
    }
    window.__QUOTE_CANCELLED__ = cancelled;

    if (cancelled) {
      const banner = qs("#cancelBanner");
      if (banner) {
        removeClass(banner, "d-none");
        const reason = resource?.context?.custom?.cancel_reason || "";
        const time = resource?.context?.custom?.cancel_time || "";
        banner.textContent = `⚠️ 本報價單已作廢${time ? `（${new Date(time).toLocaleString()}）` : ""}${reason ? `，原因：${reason}` : ""}`;
      }
      // 無論是否 admin，都隱藏「我同意」
      addClass(qs("#confirmBtnDesktop"), "d-none");
      addClass(qs("#confirmBtnMobile"), "d-none");
    }
  }catch(e){ console.warn("applyCancelStatus error:", e); }
}

/* =====================
   顯示/綁定取消按鈕（admin）
===================== */
function setupCancelButtonsVisibility(payload){
  const resource = extractResource(payload);
  const isCancelled =
    (resource?.resource_type === 'raw' && Array.isArray(resource?.tags) && resource.tags.includes('cancelled')) ||
    (resource?.context?.custom?.status === 'cancelled');
  const show = !isCancelled; // always show unless already cancelled

  console.debug('[quote] cancel visibility', {admin:isAdmin(), want: wantShowCancel(), isCancelled});
  toggle(qs('#cancelBtnDesktop'), show);
  toggle(qs('#cancelBtnMobile'), show);

  if (show){
    if (!qs('#cancelBtnDesktop')?.dataset.bound){
      qs('#cancelBtnDesktop')?.addEventListener('click', ()=>{
        const _input = prompt('請輸入取消/作廢原因（可留空）：');
        if (_input === null) { return; }
        const reason = _input || '';
        callCancel(reason);
      });
      if (qs('#cancelBtnDesktop')) qs('#cancelBtnDesktop').dataset.bound = '1';
    }
    if (!qs('#cancelBtnMobile')?.dataset.bound){
      qs('#cancelBtnMobile')?.addEventListener('click', ()=>{
        const _input = prompt('請輸入取消/作廢原因（可留空）：');
        if (_input === null) { return; }
        const reason = _input || '';
        callCancel(reason);
      });
      if (qs('#cancelBtnMobile')) qs('#cancelBtnMobile').dataset.bound = '1';
    }
  }
}

/* =====================
   付款：顯示/隱藏 + 一鍵複製（代理）
===================== */
document.addEventListener('click', function(e){
  const t = e.target;
  if (!t) return;
  if (t.id === 'toggleAccountBtn'){
    const box = qs('#bankBox');
    if (!box) return;
    box.classList.toggle('d-none');
    t.textContent = box.classList.contains('d-none') ? '查看匯款資訊' : '🙈 隱藏匯款資訊';
    if (!box.classList.contains('d-none')){
      try{ box.scrollIntoView({behavior:'smooth', block:'center'}); }catch(_){}
    }
  }
  if (t.id === 'copyAccountBtn'){
    const acct = qs('#bankAccount');
    if (!acct) return;
    try{
      navigator.clipboard.writeText(acct.value).then(function(){
        const orig = t.textContent;
        t.textContent = '✅ 已複製';
        setTimeout(function(){ t.textContent = orig; }, 1200);
      });
    }catch(_){}
  }
});

/* =====================
   初始：若 admin，預先顯示取消鈕與唯讀動作區（避免晚一步載入）
===================== */
document.addEventListener('DOMContentLoaded', function(){
  removeClass(qs('#readonlyActions'), 'd-none');
  removeClass(qs('#cancelBtnDesktop'), 'd-none');
  removeClass(qs('#cancelBtnMobile'), 'd-none');
});

/* =====================
   載入（view）
===================== */
(async function loadReadOnlyIfHash(){
  const cidQ = getCid();

  if (cidQ) {
    if (isLocallyLocked("locked:cid:"+cidQ)) { 
      addClass(qs("#confirmBtnDesktop"), "d-none");
      addClass(qs("#confirmBtnMobile"), "d-none");
    }
    try{
      const r = await fetch(`/.netlify/functions/view?id=${encodeURIComponent(cidQ)}&ts=${Date.now()}`, { cache:"no-store" });
      if(!r.ok) throw new Error(await r.text());
      const payload = await r.json();
      const data = payload?.data || {};
      const locked = !!payload?.locked;

      applyCancelStatus(payload);
      setupCancelButtonsVisibility(payload);
      applyReadOnlyData(data); 
      applyMobileLabels();
      setReadonlyButtonsVisibility(!locked);

      if (locked){
        const notice = document.createElement('div');
        notice.className = 'alert alert-success mt-2';
        notice.innerHTML = '此報價單已<span class="fw-bold">完成確認並封存</span>，僅供查看。';
        qs('.container-quote').prepend(notice);
        addClass(qs("#confirmBtnDesktop"), "d-none");
        addClass(qs("#confirmBtnMobile"), "d-none");
        if (!isAdmin()) addClass(qs("#readonlyActions"), "d-none");
      }
      return;
    }catch(e){
      console.error("讀取分享資料失敗：", e);
      alert("此連結已失效或資料讀取失敗。");
      forceReadOnlyBlank();
      addClass(qs("#confirmBtnDesktop"), "d-none");
      addClass(qs("#confirmBtnMobile"), "d-none");
      if (!isAdmin()) addClass(qs("#readonlyActions"), "d-none");
      return;
    }
  }

  const hash = location.hash || "";
  if (hash.startsWith("#data=")) {
    try{
      const data = JSON.parse(decodeURIComponent(hash.replace("#data=","")));
      applyReadOnlyData(data); applyMobileLabels();
      if (isLocallyLocked("locked:data:"+hash)) { 
        addClass(qs("#confirmBtnDesktop"), "d-none");
        addClass(qs("#confirmBtnMobile"), "d-none");
        if (!isAdmin()) addClass(qs("#readonlyActions"), "d-none");
        const notice = document.createElement('div');
        notice.className = 'alert alert-success mt-2';
        notice.innerHTML = '此報價單已<span class="fw-bold">完成確認並封存</span>，僅供查看。';
        qs('.container-quote').prepend(notice);
      } else { 
        setReadonlyButtonsVisibility(true); 
      }
      return;
    }catch(err){ 
      console.error("讀取分享資料失敗：", err); 
      updateTotals(); applyMobileLabels(); 
      return; 
    }
  }

  // 無 cid：編輯模式
  updateTotals(); applyMobileLabels();
})();


// ========== 補上取消動作（ChatGPT Patch） ==========
async function callCancel(reason) {
  const id = getCid();
  if (!id) {
    alert("找不到報價單 ID，無法作廢。");
    return;
  }
  const dBtn = qs('#cancelBtnDesktop');
  const mBtn = qs('#cancelBtnMobile');
  const origD = dBtn ? dBtn.textContent : "";
  const origM = mBtn ? mBtn.textContent : "";
  [dBtn, mBtn].forEach(b => { if (b) { b.disabled = true; b.textContent = "作廢中…"; } });

  try {
    const res = await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reason: reason || "" })
    });
    let data = null;
    try { data = await res.json(); } catch(_) {}
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : ("HTTP " + res.status);
      throw new Error(msg);
    }

    const banner = qs('#cancelBanner');
    if (banner) {
      const when = (data && (data.cancelledAt || data.updatedAt)) || Date.now();
      const timeStr = new Date(when).toLocaleString();
      banner.classList.remove('d-none');
      banner.textContent = `⚠️ 本報價單已作廢（${timeStr}）${reason ? `，原因：${reason}` : ""}`;
    }
    window.__QUOTE_CANCELLED__ = true;
    if (dBtn) dBtn.classList.add('d-none');
    if (mBtn) mBtn.classList.add('d-none');
    alert("已作廢。");
  } catch (err) {
    console.error("取消/作廢失敗：", err);
    alert("作廢失敗：" + (err.message || err));
    if (dBtn) dBtn.textContent = origD;
    if (mBtn) mBtn.textContent = origM;
    [dBtn, mBtn].forEach(b => { if (b) b.disabled = false; });
    return;
  }
}
// ========== End Patch ==========
