import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, ACCESS_CODE } from "./firebase-config.js";

/* ---------- boot ---------- */
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const col = (n) => collection(db, "wedding", "main", n);
const one = (n, id) => doc(db, "wedding", "main", n, id);

const $ = (id) => document.getElementById(id);
const THB = new Intl.NumberFormat("th-TH");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const money = (v) => THB.format(Math.round(n(v)));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let cfg = { groom:"เจ้าบ่าว", bride:"เจ้าสาว", date:"", venue:"", budget:0, target:0 };
let tasks = [], guests = [], costs = [];
let taskFilter = "all", guestGroup = "__all", guestQuery = "";
let ready = false;

/* ---------- gate ---------- */
const KEY = "kmp.unlocked";
function unlock() {
  $("gate").remove();
  $("app").hidden = false;
  start();
}
try { if (localStorage.getItem(KEY) === ACCESS_CODE) unlock(); } catch {}
$("gateForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  if ($("gateCode").value.trim() === ACCESS_CODE) {
    try { localStorage.setItem(KEY, ACCESS_CODE); } catch {}
    unlock();
  } else {
    $("gateErr").textContent = "รหัสไม่ถูกต้อง ลองอีกครั้งนะครับ";
  }
});

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
}

/* ---------- firestore ---------- */
async function start() {
  try { await signInAnonymously(auth); }
  catch (e) { toast("เข้าสู่ระบบ Firebase ไม่สำเร็จ: " + e.code); return; }
  onAuthStateChanged(auth, (u) => { if (u) $("who").textContent = "ซิงก์อัตโนมัติ"; });

  onSnapshot(doc(db, "wedding", "main"), (s) => {
    if (s.exists()) { cfg = { ...cfg, ...s.data() }; renderAll(); }
  }, err => toast("อ่านข้อมูลไม่ได้: " + err.code));

  const bind = (name, set) => onSnapshot(col(name), (s) => {
    set(s.docs.map(d => ({ id: d.id, ...d.data() })));
    ready = true; renderAll();
  }, err => toast("อ่าน " + name + " ไม่ได้: " + err.code));

  bind("tasks",  v => tasks  = v);
  bind("guests", v => guests = v);
  bind("costs",  v => costs  = v);
}

function arr(c) { return c === "tasks" ? tasks : c === "guests" ? guests : costs; }
function put(c, id, patch) {
  const row = arr(c).find(r => r.id === id);
  if (row) Object.assign(row, patch);
  renderAll();
  updateDoc(one(c, id), patch).catch(e => toast("บันทึกไม่สำเร็จ: " + e.code));
}
function create(c, data) {
  const id = uid();
  arr(c).push({ id, ...data });
  renderAll();
  setDoc(one(c, id), data).catch(e => toast("เพิ่มไม่สำเร็จ: " + e.code));
  return id;
}
function remove(c, id) {
  const a = arr(c); const i = a.findIndex(r => r.id === id);
  if (i >= 0) a.splice(i, 1);
  renderAll();
  deleteDoc(one(c, id)).catch(e => toast("ลบไม่สำเร็จ: " + e.code));
}
function saveCfg() {
  renderAll();
  setDoc(doc(db, "wedding", "main"), cfg, { merge: true }).catch(e => toast("บันทึกไม่สำเร็จ: " + e.code));
}

/* ---------- focus keeping ---------- */
function snapFocus() {
  const el = document.activeElement;
  if (!el || !el.id) return null;
  const o = { id: el.id };
  try { if (el.selectionStart != null) { o.s = el.selectionStart; o.e = el.selectionEnd; } } catch {}
  return o;
}
function restoreFocus(f) {
  if (!f) return;
  const el = $(f.id); if (!el) return;
  el.focus();
  try { if (f.s != null && el.setSelectionRange) el.setSelectionRange(f.s, f.e); } catch {}
}

/* ---------- header + stats ---------- */
function daysLeft() {
  if (!cfg.date) return null;
  const t = new Date(cfg.date + "T00:00:00").getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((t - now.getTime()) / 86400000);
}
function renderHead() {
  $("couple").innerHTML = esc(cfg.groom) + '<span class="amp">&amp;</span>' + esc(cfg.bride);
  $("dateline").textContent = cfg.date
    ? new Date(cfg.date + "T00:00:00").toLocaleDateString("th-TH", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
    : "ยังไม่ได้กำหนดวัน";
  $("venueline").textContent = cfg.venue || "ยังไม่ได้เลือกสถานที่";
}
function renderStats() {
  const dl = daysLeft();
  if (dl == null) { $("s-days").textContent = "—"; $("s-days-sub").textContent = "กำหนดวันจัดงานก่อน"; }
  else if (dl > 0) { $("s-days").textContent = THB.format(dl); $("s-days-sub").textContent = "วัน ก่อนถึงวันงาน"; }
  else if (dl === 0) { $("s-days").textContent = "วันนี้"; $("s-days-sub").textContent = "ขอให้เป็นวันที่ดีที่สุด"; }
  else { $("s-days").textContent = THB.format(-dl); $("s-days-sub").textContent = "วัน หลังวันงาน"; }

  const done = tasks.filter(t => t.done).length;
  $("s-task").innerHTML = done + ' <small>/ ' + tasks.length + '</small>';
  $("s-task-bar").style.width = (tasks.length ? done / tasks.length * 100 : 0) + "%";

  let conf = 0, inv = 0;
  guests.forEach(g => { inv += n(g.seats); if (g.rsvp === "มา") conf += n(g.seats); });
  const target = cfg.target || inv;
  $("s-guest").innerHTML = THB.format(conf) + ' <small>/ ' + THB.format(target) + '</small>';
  $("s-guest-sub").textContent = "ยืนยันแล้ว / เป้าหมาย · เชิญ " + THB.format(inv) + " ที่นั่ง";
  $("s-guest-bar").style.width = Math.min(100, target ? conf / target * 100 : 0) + "%";

  let act = 0, est = 0;
  costs.forEach(c => { act += n(c.actual); est += n(c.estimate); });
  $("s-cost").innerHTML = money(act) + ' <small>/ ' + money(cfg.budget) + '</small>';
  $("s-cost-bar").style.width = Math.min(100, cfg.budget ? act / cfg.budget * 100 : 0) + "%";
  $("s-cost-barwrap").className = "bar" + (act > cfg.budget ? " over" : "");
  $("s-cost-sub").textContent = "จ่ายจริง / งบรวม · ประมาณการ " + money(est);

  $("c-tasks").textContent = tasks.length ? `(${done}/${tasks.length})` : "";
  $("c-guests").textContent = guests.length ? `(${guests.length})` : "";
  $("c-budget").textContent = costs.length ? `(${costs.length})` : "";
}

/* ---------- checklist ---------- */
const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6.2 4.4 9 10.5 2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderTasks() {
  const host = $("taskList");
  if (!tasks.length) { host.innerHTML = `<div class="phase"><div class="empty">${ready ? "ยังไม่มีรายการ" : "กำลังโหลด…"}</div></div>`; return; }
  const phases = [], map = {};
  tasks.slice().sort((a, b) => (n(a.phaseOrder) - n(b.phaseOrder)) || (n(a.order) - n(b.order)))
    .forEach(t => {
      const k = t.phase || "อื่น ๆ";
      if (!map[k]) { map[k] = { name: k, when: t.when || "", items: [] }; phases.push(map[k]); }
      map[k].items.push(t);
    });
  let html = "";
  for (const p of phases) {
    const shown = p.items.filter(t => taskFilter === "all" || (taskFilter === "done" ? t.done : !t.done));
    if (!shown.length) continue;
    const d = p.items.filter(t => t.done).length;
    html += `<section class="phase"><div class="phase-head">
      <span class="phase-when">${esc(p.when)}</span>
      <span class="phase-name">${esc(p.name)}</span>
      <span class="phase-prog num">${d}/${p.items.length}</span></div>`;
    for (const t of shown) {
      html += `<div class="task${t.done ? " done" : ""}">
        <button class="task-check" role="checkbox" aria-checked="${t.done ? "true" : "false"}" data-toggle="${t.id}" aria-label="${esc(t.title)}">${CHECK}</button>
        <div class="task-body"><div class="task-title">${esc(t.title)}</div>
        ${t.detail ? `<div class="task-detail">${esc(t.detail)}</div>` : ""}</div>
        <button class="del" data-del="tasks:${t.id}" aria-label="ลบรายการ">&times;</button></div>`;
    }
    html += `<div class="task"><button class="task-check" style="visibility:hidden"></button>
      <div class="task-body"><input class="cell" id="add-${esc(p.name)}" data-addtask="${esc(p.name)}" placeholder="+ เพิ่มรายการในช่วงนี้ แล้วกด Enter" style="font-size:13.5px"></div></div></section>`;
  }
  host.innerHTML = html || '<div class="phase"><div class="empty">ไม่มีรายการในตัวกรองนี้</div></div>';
}

/* ---------- guests ---------- */
const RSVP = ["รอตอบ", "มา", "ไม่มา"];
function renderGuests() {
  const groups = [...new Set(guests.map(g => g.group).filter(Boolean))].sort();
  $("guestGroups").innerHTML =
    `<button class="chip" data-grp="__all" aria-pressed="${guestGroup === "__all"}">ทั้งหมด</button>` +
    groups.map(g => `<button class="chip" data-grp="${esc(g)}" aria-pressed="${guestGroup === g}">${esc(g)} <span class="num">${guests.filter(x => x.group === g).length}</span></button>`).join("");

  const q = guestQuery.trim().toLowerCase();
  const list = guests.filter(g =>
    (guestGroup === "__all" || g.group === guestGroup) &&
    (!q || (g.name || "").toLowerCase().includes(q) || (g.group || "").toLowerCase().includes(q)));

  const body = $("guestBody");
  body.innerHTML = list.length ? list.map(g => `<tr>
    <td><input class="cell" id="gn-${g.id}" data-f="guests:${g.id}:name" value="${esc(g.name)}" placeholder="ชื่อ"></td>
    <td><select class="cell" id="gs-${g.id}" data-f="guests:${g.id}:side">
      ${["เจ้าบ่าว","เจ้าสาว"].map(s => `<option${g.side === s ? " selected" : ""}>${s}</option>`).join("")}</select></td>
    <td><input class="cell" id="gg-${g.id}" data-f="guests:${g.id}:group" value="${esc(g.group)}" placeholder="กลุ่ม"></td>
    <td class="r"><input class="cell r num" id="gt-${g.id}" type="number" min="0" data-f="guests:${g.id}:seats#" value="${n(g.seats)}"></td>
    <td><button class="rsvp" data-rsvp="${g.id}" data-v="${esc(g.rsvp || "รอตอบ")}">${esc(g.rsvp || "รอตอบ")}</button></td>
    <td class="r"><input class="cell r num" id="gf-${g.id}" type="number" min="0" step="100" data-f="guests:${g.id}:gift#" value="${n(g.gift)}"></td>
    <td><button class="del" data-del="guests:${g.id}" aria-label="ลบรายชื่อ">&times;</button></td></tr>`).join("")
    : `<tr><td colspan="7"><div class="empty">${ready ? "ไม่พบรายชื่อในมุมมองนี้" : "กำลังโหลด…"}</div></td></tr>`;

  let seats = 0, gift = 0, yes = 0, no = 0, wait = 0;
  guests.forEach(g => { seats += n(g.seats); gift += n(g.gift);
    if (g.rsvp === "มา") yes++; else if (g.rsvp === "ไม่มา") no++; else wait++; });
  $("g-shown").textContent = list.length;
  $("g-count").textContent = guests.length;
  $("g-seats").textContent = THB.format(seats);
  $("g-rsvp").textContent = `มา ${yes} · รอ ${wait} · ไม่มา ${no}`;
  $("g-gift").textContent = money(gift);
}

/* ---------- budget ---------- */
function renderCosts() {
  const list = costs.slice().sort((a, b) => n(a.order) - n(b.order));
  $("costBody").innerHTML = list.length ? list.map(c => `<tr>
    <td><input class="cell" id="cc-${c.id}" data-f="costs:${c.id}:category" value="${esc(c.category)}" style="font-size:12.5px"></td>
    <td><input class="cell" id="ci-${c.id}" data-f="costs:${c.id}:item" value="${esc(c.item)}"></td>
    <td><input class="cell" id="cv-${c.id}" data-f="costs:${c.id}:vendor" value="${esc(c.vendor)}" placeholder="—" style="font-size:13px"></td>
    <td class="r"><input class="cell r num" id="ce-${c.id}" type="number" step="500" data-f="costs:${c.id}:estimate#" value="${n(c.estimate)}"></td>
    <td class="r"><input class="cell r num" id="cd-${c.id}" type="number" step="500" data-f="costs:${c.id}:deposit#" value="${n(c.deposit)}"></td>
    <td class="r"><input class="cell r num" id="ca-${c.id}" type="number" step="500" data-f="costs:${c.id}:actual#" value="${n(c.actual)}"></td>
    <td><button class="del" data-del="costs:${c.id}" aria-label="ลบรายการ">&times;</button></td></tr>`).join("")
    : `<tr><td colspan="7"><div class="empty">${ready ? "ยังไม่มีรายการ" : "กำลังโหลด…"}</div></td></tr>`;

  let est = 0, dep = 0, act = 0;
  costs.forEach(c => { est += n(c.estimate); dep += n(c.deposit); act += n(c.actual); });
  $("b-est").textContent = money(est); $("b-dep").textContent = money(dep); $("b-act").textContent = money(act);
  $("budgetNote").textContent =
    `คงเหลือจากงบ ${money(cfg.budget - act)} บาท · ยอดที่ยังต้องจ่ายตามประมาณการอีกราว ${money(Math.max(0, est - act))} บาท` +
    (est > cfg.budget ? ` — ประมาณการรวมสูงกว่างบที่ตั้งไว้ ${money(est - cfg.budget)} บาท` : "");
}

function renderAll() {
  const f = snapFocus();
  renderHead(); renderStats(); renderTasks(); renderGuests(); renderCosts();
  restoreFocus(f);
}

/* ---------- events ---------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.toggle) { const r = tasks.find(x => x.id === t.dataset.toggle); if (r) put("tasks", r.id, { done: !r.done }); return; }
  if (t.dataset.del) { const [c, id] = t.dataset.del.split(":"); if (confirm("ลบรายการนี้?")) remove(c, id); return; }
  if (t.dataset.rsvp) { const g = guests.find(x => x.id === t.dataset.rsvp);
    if (g) put("guests", g.id, { rsvp: RSVP[(RSVP.indexOf(g.rsvp || "รอตอบ") + 1) % 3] }); return; }
  if (t.dataset.grp) { guestGroup = t.dataset.grp; renderGuests(); return; }
  if (t.dataset.export) { exportCsv(t.dataset.export); return; }
  if (t.classList.contains("tab")) { selectTab(t.id); return; }
  if (t.parentElement?.id === "taskFilter") {
    taskFilter = t.dataset.f;
    [...t.parentElement.children].forEach(b => b.setAttribute("aria-pressed", String(b === t)));
    renderTasks(); return;
  }
  if (t.id === "addGuest") {
    const id = create("guests", { name:"", side:"เจ้าบ่าว", group: guestGroup === "__all" ? "" : guestGroup, seats:1, rsvp:"รอตอบ", gift:0 });
    $("gn-" + id)?.focus(); return;
  }
  if (t.id === "addCost") {
    let m = 0; costs.forEach(c => m = Math.max(m, n(c.order)));
    const id = create("costs", { category:"อื่น ๆ", item:"", vendor:"", estimate:0, deposit:0, actual:0, order:m + 1 });
    $("ci-" + id)?.focus(); return;
  }
  if (t.id === "editBtn") { openCfg(); return; }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.id === "guestSearch") return;
  if (el.dataset?.f) {
    const [c, id, rawField] = el.dataset.f.split(":");
    const numeric = rawField.endsWith("#");
    const field = numeric ? rawField.slice(0, -1) : rawField;
    put(c, id, { [field]: numeric ? n(el.value) : el.value });
  }
});
$("guestSearch")?.addEventListener("input", (e) => { guestQuery = e.target.value; renderGuests(); });

document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const el = e.target;
  if (el.dataset?.addtask) {
    const v = el.value.trim(); if (!v) return;
    const phase = el.dataset.addtask;
    const ref = tasks.find(t => t.phase === phase) || {};
    let mx = 0; tasks.forEach(t => { if (t.phase === phase) mx = Math.max(mx, n(t.order)); });
    create("tasks", { phase, when: ref.when || "", phaseOrder: n(ref.phaseOrder), order: mx + 1, title: v, detail: "", done: false });
    el.value = ""; e.preventDefault();
    $("add-" + phase)?.focus();
  } else if (el.dataset?.f) el.blur();
});

function selectTab(id) {
  ["tasks", "guests", "budget"].forEach(k => {
    const tb = $("tab-" + k), pn = $("panel-" + k);
    const on = tb.id === id;
    tb.setAttribute("aria-selected", String(on)); pn.hidden = !on;
  });
}

/* ---------- config dialog ---------- */
const dlg = $("cfgDlg");
function openCfg() {
  $("f-groom").value = cfg.groom; $("f-bride").value = cfg.bride;
  $("f-date").value = cfg.date || ""; $("f-venue").value = cfg.venue || "";
  $("f-budget").value = n(cfg.budget); $("f-target").value = n(cfg.target);
  dlg.showModal();
}
dlg.addEventListener("close", () => {
  if (dlg.returnValue !== "save") return;
  cfg = {
    groom: $("f-groom").value || "เจ้าบ่าว",
    bride: $("f-bride").value || "เจ้าสาว",
    date:  $("f-date").value,
    venue: $("f-venue").value,
    budget: n($("f-budget").value),
    target: n($("f-target").value)
  };
  saveCfg();
});

/* ---------- CSV ---------- */
const q = (v) => { v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
function exportCsv(kind) {
  let rows, name;
  if (kind === "tasks") {
    name = "checklist.csv";
    rows = [["ช่วงเวลา","หมวด","รายการ","รายละเอียด","สถานะ"]].concat(
      tasks.slice().sort((a, b) => (n(a.phaseOrder) - n(b.phaseOrder)) || (n(a.order) - n(b.order)))
        .map(t => [t.when || "", t.phase || "", t.title || "", t.detail || "", t.done ? "เสร็จแล้ว" : "ยังไม่เสร็จ"]));
  } else if (kind === "guests") {
    name = "guests.csv";
    rows = [["ชื่อ","ฝ่าย","กลุ่ม","ที่นั่ง","ตอบรับ","ซอง"]].concat(
      guests.map(g => [g.name || "", g.side || "", g.group || "", n(g.seats), g.rsvp || "รอตอบ", n(g.gift)]));
  } else {
    name = "budget.csv";
    rows = [["หมวด","รายการ","ผู้ให้บริการ","ประมาณการ","มัดจำแล้ว","จ่ายจริง"]].concat(
      costs.slice().sort((a, b) => n(a.order) - n(b.order))
        .map(c => [c.category || "", c.item || "", c.vendor || "", n(c.estimate), n(c.deposit), n(c.actual)]));
  }
  const csv = "\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
