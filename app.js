import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc }
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
let editingTask = null, editDraft = { title: "", detail: "" };
let guestSort = { k: null, d: 1 };
let costSort  = { k: null, d: 1 };
let ready = false;

/* ---------- gate ---------- */
const KEY = "kmp.unlocked";
function unlock() {
  $("gate").remove();
  $("app").hidden = false;
  requestAnimationFrame(moveTabIndicator);
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
  const taskPct = tasks.length ? done / tasks.length * 100 : 0;
  $("s-task-ring").style.strokeDashoffset = (100 - taskPct);

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
  const costRemain = est - act;
  const remainEl = $("s-cost-remain");
  remainEl.textContent = "คงเหลือที่ต้องจ่าย " + money(Math.max(0, costRemain)) + " บาท";
  remainEl.style.color = costRemain > 0 ? "var(--warn)" : "var(--ok)";

  $("c-tasks").textContent = tasks.length ? `(${done}/${tasks.length})` : "";
  $("c-guests").textContent = guests.length ? `(${guests.length})` : "";
  $("c-budget").textContent = costs.length ? `(${costs.length})` : "";
}

/* ---------- checklist ---------- */
const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6.2 4.4 9 10.5 2.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderTasks() {
  const host = $("taskList");
  if (!tasks.length) { host.innerHTML = `<div class="phase"><div class="empty">${ready ? "ยังไม่มีรายการ" : '<span class="spin"></span>กำลังโหลด…'}</div></div>`; return; }
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
      <span class="phase-prog num${d === p.items.length && p.items.length ? " done" : ""}">${d}/${p.items.length}</span></div>`;
    for (const t of shown) {
      if (editingTask === t.id) {
        html += `<div class="task editing">
        <button class="task-check" style="visibility:hidden" tabindex="-1"></button>
        <div class="task-body">
          <input class="editin" id="et-${t.id}" data-draft="title" value="${esc(editDraft.title)}" placeholder="หัวข้อรายการ">
          <textarea class="editin" id="ed-${t.id}" data-draft="detail" rows="3" placeholder="รายละเอียดเพิ่มเติม เช่น ต้องเตรียมอะไร ติดต่อใคร ราคาเท่าไร">${esc(editDraft.detail)}</textarea>
          <div class="editbar">
            <button class="btn primary" data-savetask="${t.id}">บันทึก</button>
            <button class="btn" data-canceledit="1">ยกเลิก</button>
            <span class="hint">Ctrl+Enter บันทึก · Esc ยกเลิก</span>
          </div>
        </div></div>`;
        continue;
      }
      html += `<div class="task${t.done ? " done" : ""}">
        <button class="task-check" role="checkbox" aria-checked="${t.done ? "true" : "false"}" data-toggle="${t.id}" aria-label="${esc(t.title)}">${CHECK}</button>
        <div class="task-body"><div class="task-title">${esc(t.title)}</div>
        ${t.detail ? `<div class="task-detail">${esc(t.detail)}</div>` : ""}</div>
        <button class="iconbtn" data-edit="${t.id}" aria-label="แก้ไขรายการ" title="แก้ไข">\u270E</button>
        <button class="del" data-del="tasks:${t.id}" aria-label="ลบรายการ">&times;</button></div>`;
    }
    html += `<div class="task"><button class="task-check" style="visibility:hidden"></button>
      <div class="task-body"><input class="cell" id="add-${esc(p.name)}" data-addtask="${esc(p.name)}" placeholder="+ เพิ่มรายการในช่วงนี้ แล้วกด Enter" style="font-size:13.5px"></div></div></section>`;
  }
  host.innerHTML = html || '<div class="phase"><div class="empty">ไม่มีรายการในตัวกรองนี้</div></div>';
}

/* ---------- การเรียงลำดับตามหัวคอลัมน์ ---------- */
const collator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
const NUM_KEYS = ["seats", "gift", "estimate", "deposit", "actual", "order"];
const RSVP_RANK = { "มา": 0, "รอตอบ": 1, "ไม่มา": 2 };

function sortRows(list, sort) {
  if (!sort.k) return list;
  return list.slice().sort((x, y) => {
    let r;
    if (sort.k === "rsvp") r = (RSVP_RANK[x.rsvp] ?? 9) - (RSVP_RANK[y.rsvp] ?? 9);
    else if (sort.k === "remain") r = (n(x.estimate) - n(x.actual)) - (n(y.estimate) - n(y.actual));
    else if (NUM_KEYS.includes(sort.k)) r = n(x[sort.k]) - n(y[sort.k]);
    else r = collator.compare(String(x[sort.k] ?? ""), String(y[sort.k] ?? ""));
    return r * sort.d;
  });
}
function paintHeaders(tableId, sort) {
  document.querySelectorAll("#" + tableId + " th[data-sort]").forEach(th => {
    const on = th.dataset.sort === sort.k;
    th.classList.toggle("sorted", on);
    const a = th.querySelector(".arw");
    if (a) a.textContent = on ? (sort.d === 1 ? "\u25B2" : "\u25BC") : "\u2195";
    th.setAttribute("aria-sort", on ? (sort.d === 1 ? "ascending" : "descending") : "none");
  });
}

/* ---------- guests ---------- */
const RSVP = ["รอตอบ", "มา", "ไม่มา"];

/* คีย์เทียบชื่อซ้ำ: ตัดช่องว่างเกิน วงเล็บท้ายชื่อ และ x ท้ายชื่อออก
   ทำให้ "พี่เอ๋" กับ "พี่เอ๋ (2)" หรือ "พี่ขวัญ x" ถูกจับเป็นชื่อเดียวกัน
   แต่ "ญาติพ่อ 1" กับ "ญาติพ่อ 2" ยังถือว่าคนละคน */
const dupKey = (s) => String(s ?? "").trim().toLowerCase()
  .replace(/\s+/g, " ")
  .replace(/\s*\([^)]*\)\s*$/, "")
  .replace(/\s+x$/, "");

function dupInfo() {
  const count = {}, where = {};
  guests.forEach(g => {
    const k = dupKey(g.name); if (!k) return;
    count[k] = (count[k] || 0) + 1;
    (where[k] = where[k] || []).push(g.group || "ไม่ระบุกลุ่ม");
  });
  const ids = new Set(guests.filter(g => count[dupKey(g.name)] > 1).map(g => g.id));
  return { count, where, ids };
}
function warnDup(name, selfId) {
  const k = dupKey(name); if (!k) return;
  const others = guests.filter(g => g.id !== selfId && dupKey(g.name) === k);
  if (!others.length) return;
  const groups = [...new Set(others.map(o => o.group || "ไม่ระบุกลุ่ม"))].join(", ");
  toast("ชื่อ “" + name + "” ซ้ำกับที่มีอยู่แล้วใน " + groups);
}
function renderGuests() {
  const dup = dupInfo();

  let seatsYes = 0, seatsWait = 0, seatsNo = 0;
  guests.forEach(g => { const s = n(g.seats);
    if (g.rsvp === "มา") seatsYes += s; else if (g.rsvp === "ไม่มา") seatsNo += s; else seatsWait += s; });
  const totalSeats = seatsYes + seatsWait + seatsNo;
  $("rsvpChart").innerHTML = totalSeats ? `
    <div class="rsvpbar">
      <span class="yes" style="width:${seatsYes / totalSeats * 100}%"></span>
      <span class="wait" style="width:${seatsWait / totalSeats * 100}%"></span>
      <span class="no" style="width:${seatsNo / totalSeats * 100}%"></span>
    </div>
    <div class="rsvplegend">
      <span class="lg"><i style="background:var(--ok)"></i>มา ${THB.format(seatsYes)} ที่นั่ง</span>
      <span class="lg"><i style="background:var(--warn)"></i>รอตอบ ${THB.format(seatsWait)} ที่นั่ง</span>
      <span class="lg"><i style="background:var(--ink-3)"></i>ไม่มา ${THB.format(seatsNo)} ที่นั่ง</span>
    </div>` : "";

  const groups = [...new Set(guests.map(g => g.group).filter(Boolean))].sort();
  $("guestGroups").innerHTML =
    `<button class="chip" data-grp="__all" aria-pressed="${guestGroup === "__all"}">ทั้งหมด</button>` +
    (dup.ids.size ? `<button class="chip warn" data-grp="__dup" aria-pressed="${guestGroup === "__dup"}">⚠ ชื่อซ้ำ <span class="num">${dup.ids.size}</span></button>` : "") +
    groups.map(g => `<button class="chip" data-grp="${esc(g)}" aria-pressed="${guestGroup === g}">${esc(g)} <span class="num">${guests.filter(x => x.group === g).length}</span></button>`).join("");

  const q = guestQuery.trim().toLowerCase();
  const list = guests.filter(g =>
    (guestGroup === "__all" || (guestGroup === "__dup" ? dup.ids.has(g.id) : g.group === guestGroup)) &&
    (!q || (g.name || "").toLowerCase().includes(q) || (g.group || "").toLowerCase().includes(q)));
  const shown = sortRows(list, guestSort);
  paintHeaders("guestTable", guestSort);

  const body = $("guestBody");
  body.innerHTML = shown.length ? shown.map(g => `<tr class="${dup.ids.has(g.id) ? "dup" : ""}">
    <td><div class="namecell"><input class="cell" id="gn-${g.id}" data-f="guests:${g.id}:name" value="${esc(g.name)}" placeholder="ชื่อ">${
      dup.ids.has(g.id) ? `<span class="dupbadge" title="ชื่อนี้ปรากฏใน ${esc([...new Set(dup.where[dupKey(g.name)])].join(", "))}">ซ้ำ ${dup.count[dupKey(g.name)]}</span>` : ""}</div></td>
    <td><select class="cell" id="gs-${g.id}" data-f="guests:${g.id}:side">
      ${["เจ้าบ่าว","เจ้าสาว"].map(s => `<option${g.side === s ? " selected" : ""}>${s}</option>`).join("")}</select></td>
    <td><input class="cell" id="gg-${g.id}" data-f="guests:${g.id}:group" value="${esc(g.group)}" placeholder="กลุ่ม"></td>
    <td class="r"><input class="cell r num" id="gt-${g.id}" type="number" min="0" data-f="guests:${g.id}:seats#" value="${n(g.seats)}"></td>
    <td><button class="rsvp" data-rsvp="${g.id}" data-v="${esc(g.rsvp || "รอตอบ")}">${esc(g.rsvp || "รอตอบ")}</button></td>
    <td class="r"><input class="cell r num" id="gf-${g.id}" type="number" min="0" step="100" data-f="guests:${g.id}:gift#" value="${n(g.gift)}"></td>
    <td><button class="del" data-del="guests:${g.id}" aria-label="ลบรายชื่อ">&times;</button></td></tr>`).join("")
    : `<tr><td colspan="7"><div class="empty">${ready ? "ไม่พบรายชื่อในมุมมองนี้" : '<span class="spin"></span>กำลังโหลด…'}</div></div></td></tr>`;

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
  const byCat = {};
  costs.forEach(c => { const k = c.category || "อื่น ๆ"; const v = n(c.actual) || n(c.estimate); byCat[k] = (byCat[k] || 0) + v; });
  const catRows = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const catMax = catRows.length ? catRows[0][1] : 1;
  $("budgetChart").innerHTML = catRows.length ? catRows.map(([k, v]) => `
    <div class="budgetrow">
      <div class="lbl">${esc(k)}</div>
      <div class="track"><i style="width:${Math.max(3, v / catMax * 100)}%"></i></div>
      <div class="amt num">${money(v)}</div>
    </div>`).join("") : "";

  const list = costSort.k
    ? sortRows(costs, costSort)
    : costs.slice().sort((a, b) => n(a.order) - n(b.order));
  paintHeaders("costTable", costSort);
  $("costBody").innerHTML = list.length ? list.map(c => `<tr>
    <td><input class="cell" id="cc-${c.id}" data-f="costs:${c.id}:category" value="${esc(c.category)}" style="font-size:12.5px"></td>
    <td><input class="cell" id="ci-${c.id}" data-f="costs:${c.id}:item" value="${esc(c.item)}"></td>
    <td><input class="cell" id="cv-${c.id}" data-f="costs:${c.id}:vendor" value="${esc(c.vendor)}" placeholder="—" style="font-size:13px"></td>
    <td class="r"><input class="cell r num" id="ce-${c.id}" type="number" step="500" data-f="costs:${c.id}:estimate#" value="${n(c.estimate)}"></td>
    <td class="r"><input class="cell r num" id="cd-${c.id}" type="number" step="500" data-f="costs:${c.id}:deposit#" value="${n(c.deposit)}"></td>
    <td class="r"><input class="cell r num" id="ca-${c.id}" type="number" step="500" data-f="costs:${c.id}:actual#" value="${n(c.actual)}"></td>
    <td class="r num" style="color:${(n(c.estimate) - n(c.actual)) > 0 ? "var(--warn)" : "var(--ok)"}">${money(n(c.estimate) - n(c.actual))}</td>
    <td><button class="del" data-del="costs:${c.id}" aria-label="ลบรายการ">&times;</button></td></tr>`).join("")
    : `<tr><td colspan="8"><div class="empty">${ready ? "ยังไม่มีรายการ" : '<span class="spin"></span>กำลังโหลด…'}</div></td></tr>`;

  let est = 0, dep = 0, act = 0;
  costs.forEach(c => { est += n(c.estimate); dep += n(c.deposit); act += n(c.actual); });
  $("b-est").textContent = money(est); $("b-dep").textContent = money(dep); $("b-act").textContent = money(act);
  $("b-remain").textContent = money(est - act);
  $("budgetNote").textContent =
    `คงเหลือจากงบ ${money(cfg.budget - act)} บาท · ยอดที่ยังต้องจ่ายตามประมาณการอีกราว ${money(Math.max(0, est - act))} บาท` +
    (est > cfg.budget ? ` — ประมาณการรวมสูงกว่างบที่ตั้งไว้ ${money(est - cfg.budget)} บาท` : "");
}

function renderAll() {
  const f = snapFocus();
  renderHead(); renderStats(); renderTasks(); renderGuests(); renderCosts();
  restoreFocus(f);
}

/* ---------- แก้ไขรายการเช็คลิสต์ ---------- */
function startEdit(id, focusDetail) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  editingTask = id;
  editDraft = { title: t.title || "", detail: t.detail || "" };
  renderTasks();
  const el = $(focusDetail ? "ed-" + id : "et-" + id);
  if (el) { el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); }
}
function saveEdit(id) {
  const title = editDraft.title.trim();
  if (!title) { toast("ใส่หัวข้อรายการก่อนนะครับ"); $("et-" + id)?.focus(); return; }
  editingTask = null;
  put("tasks", id, { title, detail: editDraft.detail.trim() });
}

/* ---------- events ---------- */
document.addEventListener("click", (e) => {
  const th = e.target.closest("th[data-sort]");
  if (th) {
    const k = th.dataset.sort;
    const isGuest = !!th.closest("#guestTable");
    const sort = isGuest ? guestSort : costSort;
    if (sort.k === k) { if (sort.d === 1) sort.d = -1; else { sort.k = null; sort.d = 1; } }
    else { sort.k = k; sort.d = 1; }
    isGuest ? renderGuests() : renderCosts();
    return;
  }
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.edit) { startEdit(t.dataset.edit); return; }
  if (t.dataset.savetask) { saveEdit(t.dataset.savetask); return; }
  if (t.dataset.canceledit) { editingTask = null; renderTasks(); return; }
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
    if (c === "guests" && field === "name") warnDup(el.value, id);
  }
});
$("guestSearch")?.addEventListener("input", (e) => { guestQuery = e.target.value; renderGuests(); });
document.addEventListener("input", (e) => {
  const k = e.target?.dataset?.draft;
  if (k) editDraft[k] = e.target.value;
});

document.addEventListener("keydown", (e) => {
  if (editingTask) {
    if (e.key === "Escape") { editingTask = null; renderTasks(); e.preventDefault(); return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { saveEdit(editingTask); e.preventDefault(); return; }
  }
  if (e.key !== "Enter") return;
  const el = e.target;
  if (el.dataset?.addtask) {
    const v = el.value.trim(); if (!v) return;
    const phase = el.dataset.addtask;
    const ref = tasks.find(t => t.phase === phase) || {};
    let mx = 0; tasks.forEach(t => { if (t.phase === phase) mx = Math.max(mx, n(t.order)); });
    const newId = create("tasks", { phase, when: ref.when || "", phaseOrder: n(ref.phaseOrder), order: mx + 1, title: v, detail: "", done: false });
    el.value = ""; e.preventDefault();
    startEdit(newId, true);
  } else if (el.dataset?.f) el.blur();
});

function moveTabIndicator() {
  const on = document.querySelector('.tab[aria-selected="true"]');
  const ind = $("tabInd");
  if (!on || !ind) return;
  ind.style.left = on.offsetLeft + "px";
  ind.style.width = on.offsetWidth + "px";
}
function selectTab(id) {
  ["tasks", "guests", "budget"].forEach(k => {
    const tb = $("tab-" + k), pn = $("panel-" + k);
    const on = tb.id === id;
    tb.setAttribute("aria-selected", String(on));
    if (on) {
      pn.hidden = false;
      pn.classList.add("enter");
      requestAnimationFrame(() => requestAnimationFrame(() => pn.classList.remove("enter")));
    } else pn.hidden = true;
  });
  moveTabIndicator();
}
window.addEventListener("resize", () => moveTabIndicator());

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
  const csv = "﻿" + rows.map(r => r.map(q).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
