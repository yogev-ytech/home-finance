import { createStore } from './store.js';

const L = window.Ledger;
const VENDOR = new URL('../vendor/', import.meta.url).href;
const BUILTIN_CATS = [...L.EXPENSE_CATS, ...L.INCOME_CATS.filter(c => c.id !== 'internal')];
const cat = id => BUILTIN_CATS.find(c => c.id === id) || (state.cats || []).find(c => c.id === id);
const catOr = id => cat(id) || { name: 'קטגוריה שנמחקה', color: 'var(--muted)' };
const CAT_COLORS = ['#A66DD4', '#E0607E', '#2E9AA8', '#D9773B', '#3B8C5A', '#5470C6', '#C29A2E', '#B85C5C', '#4A9BD9', '#8C6D3B'];
const nextColor = () => CAT_COLORS.find(c => !(state.cats || []).some(x => x.color === c)) || CAT_COLORS[(state.cats || []).length % CAT_COLORS.length];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2) + Date.now().toString(36));
const r2 = n => Math.round(n * 100) / 100;
const nf0 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, d) => '<span class="num">' + (d ? nf2 : nf0).format(n) + '</span>';
const monthName = m => new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m + '-15T00:00:00Z'));
const shortDate = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
const fullDate = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
const issuerName = i => L.ISSUERS[i] || 'כרטיס אשראי';
const isExcluded = id => !!(cat(id) || {}).excluded || id === 'internal';
const $ = s => document.querySelector(s);

let state = { tx: [], statements: [], imports: [], rules: {}, links: {}, cats: [] };
let auth = { status: 'loading' };
let view = 'home', month = null, txFilter = 'all', query = '', openTx = null, lastResults = [], busy = '';
let catDraft = { name: '', kind: 'expense', color: null }, editCat = null, editDraft = null, catErr = '', edErr = '';

// ---------- store ----------
const store = createStore({
  onAuth: a => {
    auth = a.signedIn ? { status: 'loading', email: a.email, name: a.name } : { status: 'signedOut' };
    if (!a.signedIn) { state = { tx: [], statements: [], imports: [], rules: {}, links: {}, cats: [] }; lastResults = []; month = null; }
    render();
  },
  onData: d => { state = d; auth.status = 'ready'; render(); },
  onError: e => { auth.status = e.code === 'denied' ? 'denied' : 'error'; auth.message = e.message; render(); }
});

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
}
function commit(ops) {
  if (!ops.length) return Promise.resolve();
  return store.apply(ops).catch(e => {
    toast(e && e.code === 'permission-denied' ? 'אין הרשאה לשמור. ודא שהחשבון מורשה.' : 'השמירה נכשלה. בדוק את החיבור ונסה שוב.');
    throw e;
  });
}
const settingsOp = (rules, links, cats) => ({ op: 'settings', rules: rules || state.rules, links: links || state.links, cats: cats || state.cats || [] });

// ---------- derived data ----------
function derive() {
  const bankCard = state.tx.filter(t => t.kind === 'card');
  const links = L.reconcile(
    state.statements.map(s => ({ id: s.id, issuer: s.issuer, chargeDate: s.chargeDate, total: s.total })),
    bankCard.map(t => ({ id: t.id, issuer: t.issuer, date: t.date, amount: t.amount })),
    state.links);
  const bankToStmt = new Map(); for (const [s, b] of links) bankToStmt.set(b, s);
  const bankDates = state.tx.filter(t => t.src === 'bank').map(t => t.date).sort();
  return { links, bankToStmt, bankFrom: bankDates[0], bankTo: bankDates[bankDates.length - 1] };
}
const months = () => [...new Set(state.tx.map(t => t.month).filter(Boolean))].sort();
const needsReview = t => (t.kind === 'expense' || t.kind === 'income') && !t.cat;

function totals(m, d) {
  let income = 0, expense = 0; const byCat = {}; const incCat = {};
  for (const t of state.tx) {
    if (t.month !== m) continue;
    if (t.kind === 'income') { if (!isExcluded(t.cat)) { income += t.amount; incCat[t.cat || 'review'] = (incCat[t.cat || 'review'] || 0) + t.amount; } continue; }
    let c = t.cat;
    if (t.kind === 'card') { if (d.bankToStmt.has(t.id)) continue; c = 'unitemized'; }
    if (isExcluded(c)) continue;
    expense += t.amount;
    const k = c || 'review';
    byCat[k] = (byCat[k] || 0) + t.amount;
  }
  return { income: r2(income), expense: r2(expense), byCat, incCat };
}

function pickDefaultMonth() {
  const ms = months(); if (!ms.length) return null;
  for (let i = ms.length - 1; i >= 0; i--) if (state.tx.filter(t => t.month === ms[i]).length >= 5) return ms[i];
  return ms[ms.length - 1];
}

// ---------- library loading (bundled in /vendor, no third-party CDN) ----------
const loaded = {};
function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => { delete loaded[src]; rej(new Error('net')); };
    document.head.appendChild(s);
  });
  return loaded[src];
}
async function needXlsx() { if (!window.XLSX) await loadScript(VENDOR + 'xlsx.full.min.js'); return window.XLSX; }
async function needPdf() {
  if (!window.pdfjsLib) await loadScript(VENDOR + 'pdf.min.js');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js';
  return window.pdfjsLib;
}

// ---------- import ----------
async function importCard(file) {
  const XLSX = await needXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) }));
  const p = L.parseCardWorkbook(sheets);
  const rowsTotal = p.statements.reduce((a, s) => a + s.rows.length, 0);
  if (!rowsTotal) return { ok: false, name: file.name, msg: p.warnings[0] || 'לא נמצאו עסקאות בקובץ.' };
  const importId = uid();
  const issuer = p.issuer || 'unknown';
  const keys = new Set(state.tx.map(t => t.key));
  const ops = [];
  let added = 0, dup = 0, review = 0; const details = [];
  for (const st of p.statements) {
    const total = st.declared != null ? st.declared : st.sum;
    let sid;
    const existing = state.statements.find(s => s.issuer === issuer && s.chargeDate === st.chargeDate && Math.abs(s.total - total) < 0.05);
    if (existing) sid = existing.id;
    else { sid = uid(); ops.push({ op: 'set', col: 'statements', id: sid, data: { importId, issuer, chargeDate: st.chargeDate, total, sum: st.sum, declared: st.declared, sumMatches: st.sumMatches, count: st.rows.length } }); }
    const occ = {};
    for (const r of st.rows) {
      const base = ['c', issuer, r.date, L.norm(r.merchant), r.amount].join('|');
      occ[base] = (occ[base] || 0) + 1;
      const key = base + '|' + occ[base];
      if (keys.has(key)) { dup++; continue; }
      keys.add(key);
      const c = L.categorize(r.merchant, r.sector, state.rules);
      if (!c.cat) review++;
      ops.push({ op: 'set', col: 'tx', id: uid(), data: { key, importId, src: 'card', kind: 'expense', issuer, stmtId: sid, date: r.date, month: L.monthOf(st.chargeDate || r.date), desc: r.merchant, amount: r.amount, cat: c.cat, how: c.how, transfer: !!c.transfer, type: r.type, sector: r.sector, notes: r.notes } });
      added++;
    }
    details.push((st.chargeDate ? 'חיוב ב-' + fullDate(st.chargeDate) : 'ללא תאריך חיוב') + ': ' + st.rows.length + ' עסקאות, ' + nf2.format(total) +
      (st.sumMatches === true ? ' · סכום השורות תואם לסיכום בקובץ' : st.sumMatches === false ? ' · סכום השורות (' + nf2.format(st.sum) + ') שונה מהסיכום בקובץ' : ''));
  }
  const label = 'פירוט ' + issuerName(issuer);
  if (!added) return { ok: true, name: file.name, label, added, dup, review, details: ['הקובץ כבר יובא קודם. לא נוספו תנועות.'] };
  ops.push({ op: 'set', col: 'imports', id: importId, data: { at: Date.now(), label, name: file.name, added, by: auth.email || '' } });
  await commit(ops);
  return { ok: true, importId, name: file.name, label, added, dup, review, details };
}

async function importBank(file) {
  const pdfjsLib = await needPdf();
  let doc;
  try { doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise; }
  catch (e) { if (e && e.name === 'PasswordException') return { ok: false, name: file.name, msg: 'הקובץ מוגן בסיסמה. הורד מהבנק עותק בלי סיסמה ונסה שוב.' }; throw e; }
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push(tc.items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
  }
  const p = L.parseBankPages(pages);
  if (!p.rows.length) return { ok: false, name: file.name, msg: p.warnings[0] || 'לא נמצאו תנועות בקובץ.' };
  const importId = uid();
  const keys = new Set(state.tx.map(t => t.key));
  const salary = L.recurringIncome(p.rows.concat(state.tx.filter(t => t.src === 'bank' && t.kind === 'income').map(t => ({ desc: t.desc, credit: t.amount, date: t.date }))));
  const ops = [];
  let added = 0, dup = 0, review = 0, cards = 0;
  for (const r of p.rows) {
    const key = ['b', r.date, L.norm(r.desc), r.debit, r.credit, r.balance].join('|');
    if (keys.has(key)) { dup++; continue; }
    keys.add(key);
    const c = L.classifyBank(r, state.rules, salary);
    const amount = r.credit > 0 ? r.credit : r.debit;
    if (c.kind === 'card') cards++; else if (!c.cat) review++;
    ops.push({ op: 'set', col: 'tx', id: uid(), data: { key, importId, src: 'bank', kind: c.kind, issuer: c.issuer, date: r.date, month: L.monthOf(r.date), desc: r.desc, amount, cat: c.cat, how: c.how, transfer: c.transfer, type: '', sector: '', notes: '', balance: r.balance } });
    added++;
  }
  const bc = p.balanceCheck;
  const details = [
    p.rows.length + ' תנועות, ' + fullDate(p.from) + ' עד ' + fullDate(p.to),
    bc.checked ? (bc.ok === bc.checked ? 'בדיקת יתרות: כל ' + bc.checked + ' המעברים בין יתרה ליתרה מתאימים' : 'בדיקת יתרות: ' + bc.ok + ' מתוך ' + bc.checked + ' מתאימים. כדאי לעבור על התנועות.') : '',
    cards ? cards + ' חיובי כרטיסי אשראי זוהו ויוצלבו מול קובצי הפירוט' : ''
  ].filter(Boolean);
  const label = 'עו"ש ' + p.bankName;
  if (!added) return { ok: true, name: file.name, label, added, dup, review, details: ['הקובץ כבר יובא קודם. לא נוספו תנועות.'] };
  ops.push({ op: 'set', col: 'imports', id: importId, data: { at: Date.now(), label, name: file.name, added, by: auth.email || '' } });
  await commit(ops);
  return { ok: true, importId, name: file.name, label, added, dup, review, details };
}

async function restoreBackup(file) {
  let b;
  try { b = JSON.parse(await file.text()); } catch (e) { return { ok: false, name: file.name, msg: 'זה לא קובץ גיבוי תקין.' }; }
  if (!b || b.app !== 'home-finance' || !Array.isArray(b.tx)) return { ok: false, name: file.name, msg: 'זה לא קובץ גיבוי של כלכלת הבית.' };
  const have = new Set(state.tx.map(t => t.id));
  const ops = [];
  for (const col of ['tx', 'statements', 'imports']) for (const d of (b[col] || [])) if (d && d.id && !(col === 'tx' && have.has(d.id))) ops.push({ op: 'set', col, id: d.id, data: d });
  const cats = [...state.cats, ...(b.cats || []).filter(c => c && c.id && !state.cats.some(x => x.id === c.id))];
  ops.push(settingsOp({ ...(b.rules || {}), ...state.rules }, { ...(b.links || {}), ...state.links }, cats));
  await commit(ops);
  const added = ops.filter(o => o.col === 'tx').length;
  return { ok: true, name: file.name, label: 'שחזור מגיבוי', added, dup: b.tx.length - added, review: 0, details: ['גיבוי מתאריך ' + fullDate((b.exportedAt || '').slice(0, 10))] };
}

function exportBackup() {
  const data = { app: 'home-finance', version: 1, exportedAt: new Date().toISOString(), tx: state.tx, statements: state.statements, imports: state.imports, rules: state.rules, links: state.links, cats: state.cats };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'home-finance-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('קובץ הגיבוי הורד. שמור אותו במקום בטוח, לא ב-GitHub.');
}

async function handleFiles(list) {
  const files = [...list]; if (!files.length) return;
  busy = 'קורא ' + (files.length > 1 ? files.length + ' קבצים' : 'את הקובץ') + '…'; render();
  const results = [];
  for (const f of files) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'pdf') results.push(await importBank(f));
      else if (['xlsx', 'xls', 'csv'].includes(ext)) results.push(await importCard(f));
      else if (ext === 'json') results.push(await restoreBackup(f));
      else results.push({ ok: false, name: f.name, msg: 'סוג הקובץ לא נתמך. אפשר להעלות Excel ‏(xlsx, xls), ‏CSV, PDF של תנועות עו"ש, או קובץ גיבוי.' });
    } catch (e) {
      results.push({ ok: false, name: f.name, msg: e && e.message === 'net' ? 'לא הצלחתי לטעון את רכיב קריאת הקבצים. בדוק את החיבור לאינטרנט ונסה שוב.' : e && e.code ? 'השמירה בענן נכשלה. בדוק את החיבור ונסה שוב.' : 'לא הצלחתי לקרוא את הקובץ. ודא שזה קובץ הפירוט המקורי שהורדת, בלי שינויים.' });
    }
  }
  busy = ''; lastResults = results;
  render();
}

function undoImport(id) {
  const ops = [];
  for (const t of state.tx) if (t.importId === id) ops.push({ op: 'delete', col: 'tx', id: t.id });
  const gone = new Set();
  for (const s of state.statements) if (s.importId === id) { gone.add(s.id); ops.push({ op: 'delete', col: 'statements', id: s.id }); }
  ops.push({ op: 'delete', col: 'imports', id });
  const links = { ...state.links }; let changed = false;
  for (const k of Object.keys(links)) if (gone.has(k)) { delete links[k]; changed = true; }
  if (changed) ops.push(settingsOp(null, links));
  lastResults = lastResults.filter(r => r.importId !== id);
  commit(ops).catch(() => {});
}

function setCategory(id, c, always, newCat) {
  const t = state.tx.find(x => x.id === id); if (!t) return;
  const ops = [{ op: 'set', col: 'tx', id: t.id, data: { ...t, cat: c || null, how: 'manual' } }];
  let rules = null;
  if (always && c) {
    const k = L.norm(t.desc);
    rules = { ...state.rules, [k]: c };
    for (const o of state.tx) if (o !== t && o.kind === t.kind && L.norm(o.desc) === k && o.how !== 'manual') ops.push({ op: 'set', col: 'tx', id: o.id, data: { ...o, cat: c, how: 'rule' } });
  }
  if (rules || newCat) ops.push(settingsOp(rules, null, newCat ? [...state.cats, newCat] : null));
  commit(ops).catch(() => {});
}

function validateCatName(raw, exceptId) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return { err: 'כתבו שם לקטגוריה.' };
  if (name.length > 30) return { err: 'השם ארוך מדי. עד 30 תווים.' };
  const taken = [...L.EXPENSE_CATS, ...L.INCOME_CATS, ...state.cats].some(c => c.id !== exceptId && L.norm(c.name) === L.norm(name));
  if (taken) return { err: 'כבר יש קטגוריה בשם הזה.' };
  return { name };
}

function deleteCategory(id) {
  const ops = [];
  for (const t of state.tx) if (t.cat === id) ops.push({ op: 'set', col: 'tx', id: t.id, data: { ...t, cat: null, how: 'none' } });
  const rules = Object.fromEntries(Object.entries(state.rules).filter(([, v]) => v !== id));
  ops.push(settingsOp(rules, null, state.cats.filter(c => c.id !== id)));
  if (editCat === id) { editCat = null; editDraft = null; }
  commit(ops).then(() => toast('הקטגוריה נמחקה.')).catch(() => {});
}

// ---------- views ----------
function catOptions(kind, selected, allowNew) {
  const base = kind === 'income' ? L.INCOME_CATS : L.EXPENSE_CATS.filter(c => !c.system);
  const custom = (state.cats || []).filter(c => (c.kind || 'expense') === kind).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const opt = c => '<option value="' + c.id + '"' + (c.id === selected ? ' selected' : '') + '>' + esc(c.name) + '</option>';
  const list = custom.length ? '<optgroup label="הקטגוריות שלכם">' + custom.map(opt).join('') + '</optgroup><optgroup label="קטגוריות קבועות">' + base.map(opt).join('') + '</optgroup>' : base.map(opt).join('');
  return '<option value="">בחר קטגוריה…</option>' + list + (allowNew ? '<option value="__new">+ קטגוריה חדשה…</option>' : '');
}

function swatches(target, selected) {
  return '<div class="swatches" role="group" aria-label="צבע">' + CAT_COLORS.map(c => '<button type="button" class="swatch" data-act="swatch" data-t="' + target + '" data-c="' + c + '" aria-pressed="' + (c === selected) + '" aria-label="צבע" style="background:' + c + '"></button>').join('') + '</div>';
}

function viewCats() {
  const used = {}; for (const t of state.tx) if (t.cat) used[t.cat] = (used[t.cat] || 0) + 1;
  const list = state.cats.slice().sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const color = catDraft.color || nextColor();
  const rows = list.map(c => {
    const n = used[c.id] || 0;
    if (editCat === c.id) return '<div class="cat-row editing"><div class="cat-form">' +
      '<input class="field" id="cat-edit-name" maxlength="30" aria-label="שם הקטגוריה" value="' + esc(editDraft.name) + '">' + swatches('edit', editDraft.color) +
      (catErr ? '<p class="err" role="alert">' + esc(catErr) + '</p>' : '') +
      '<div class="row"><button class="btn primary" data-act="cat-save" data-id="' + c.id + '">שמירה</button><button class="btn ghost" data-act="cat-cancel">ביטול</button></div></div></div>';
    return '<div class="cat-row"><div class="name"><span class="dot" style="background:' + c.color + '"></span><span>' + esc(c.name) + '</span></div>' +
      '<div class="muted small">' + (c.kind === 'income' ? 'הכנסה · ' : '') + n + ' תנועות</div>' +
      '<div class="row"><button class="btn ghost small" data-act="cat-edit" data-id="' + c.id + '">עריכה</button><button class="btn danger small" data-act="cat-del" data-id="' + c.id + '" data-n="' + n + '">מחיקה</button></div></div>';
  }).join('');
  return '<section class="card" id="cats"><h2>קטגוריות <small>' + (list.length ? list.length + ' שהוספתם' : 'הוסיפו משלכם') + '</small></h2>' +
    '<p class="small muted" style="margin:0 0 10px">קטגוריה שתוסיפו כאן תופיע בבחירת קטגוריה ובניתוח, לכל בני המשפחה. אפשר גם להוסיף ישר מתנועה, דרך "+ קטגוריה חדשה".</p>' +
    (rows ? '<div class="cat-list">' + rows + '</div>' : '') +
    '<div class="cat-form add"><div class="row"><input class="field" id="cat-new-name" maxlength="30" placeholder="שם קטגוריה חדשה, למשל: חוגים" aria-label="שם קטגוריה חדשה" value="' + esc(catDraft.name) + '">' +
    '<select class="field" id="cat-new-kind" aria-label="סוג"><option value="expense"' + (catDraft.kind === 'expense' ? ' selected' : '') + '>הוצאה</option><option value="income"' + (catDraft.kind === 'income' ? ' selected' : '') + '>הכנסה</option></select></div>' +
    swatches('new', color) + (catErr && !editCat ? '<p class="err" role="alert">' + esc(catErr) + '</p>' : '') +
    '<div class="row"><button class="btn primary" data-act="cat-add">הוספת קטגוריה</button></div></div></section>';
}

function srcChip(t) {
  if (t.src === 'card') return '<span class="chip src">' + esc(issuerName(t.issuer)) + '</span>';
  if (t.src === 'bank') return '<span class="chip src">עו"ש</span>';
  return '<span class="chip src">ידני</span>';
}

function txRow(t, d) {
  const isCard = t.kind === 'card';
  const linked = isCard && d.bankToStmt.has(t.id);
  let chip;
  if (isCard) chip = linked ? '<span class="chip ok">מוצלב עם הפירוט</span>' : '<span class="chip review">אין פירוט</span>';
  else if (!t.cat) chip = '<span class="chip review">' + (t.transfer ? 'העברה – לבדיקה' : 'לבדיקה') + '</span>';
  else { const c = catOr(t.cat); chip = '<span class="chip"><span class="dot" style="background:' + c.color + '"></span>' + esc(c.name) + '</span>'; }
  const inst = L.installment(t.notes);
  const extra = [t.type && t.type !== 'רגילה' ? esc(t.type) : '', inst ? 'תשלום ' + inst.k + ' מתוך ' + inst.n : ''].filter(Boolean).map(x => '<span>' + x + '</span>').join('');
  const open = openTx === t.id;
  let editor = '';
  if (open && !isCard) {
    editor = '<div class="editor">' +
      '<div class="row"><select class="field" id="ed-cat" aria-label="קטגוריה">' + catOptions(t.kind, t.cat, true) + '</select></div>' +
      '<div class="row" id="ed-new-row" hidden><input class="field" id="ed-new-name" maxlength="30" placeholder="שם הקטגוריה החדשה" aria-label="שם הקטגוריה החדשה"></div>' +
      '<p class="err" id="ed-err" role="alert">' + esc(edErr) + '</p>' +
      '<label class="check"><input type="checkbox" id="ed-always"' + (t.transfer ? '' : ' checked') + '><span>לסווג כך תמיד את "' + esc(t.desc) + '"' + (t.transfer ? ' (לא מומלץ להעברות, כל העברה היא למישהו אחר)' : '') + '</span></label>' +
      '<div class="row"><button class="btn primary" data-act="save-cat" data-id="' + t.id + '">שמירה</button><button class="btn ghost" data-act="close-ed">סגירה</button><button class="btn danger" data-act="del" data-id="' + t.id + '" style="margin-inline-start:auto">מחיקה</button></div></div>';
  } else if (open && isCard) {
    const sid = d.bankToStmt.get(t.id); const st = state.statements.find(s => s.id === sid);
    editor = '<div class="editor small">' + (st ? 'החיוב הזה מכסה ' + st.count + ' עסקאות מפירוט ' + esc(issuerName(st.issuer)) + ' לחיוב ב-' + fullDate(st.chargeDate) + '. הן נספרות בנפרד, לכן החיוב עצמו לא נספר פעמיים.' : 'זה חיוב מרוכז של ' + esc(issuerName(t.issuer)) + '. העלה את קובץ הפירוט של החודש הזה כדי לראות על מה הכסף הלך. עד אז הוא נספר כ"אשראי בלי פירוט".') + '<div class="row"><button class="btn ghost" data-act="close-ed">סגירה</button></div></div>';
  }
  return '<div class="tx"><button class="rowbtn" data-act="open" data-id="' + t.id + '" aria-expanded="' + open + '"><div style="min-width:0"><div class="desc">' + esc(t.desc) + '</div><div class="meta"><span class="num">' + shortDate(t.date) + '</span>' + srcChip(t) + chip + extra + '</div></div><div class="amt ' + (t.kind === 'income' ? 'pos' : '') + '">' + (t.kind === 'income' ? '+' : '') + money(t.amount, true) + '</div></button>' + editor + '</div>';
}

function reconRows(m, d) {
  const out = [];
  const cardRows = state.tx.filter(t => t.kind === 'card' && t.month === m).sort((a, b) => a.date.localeCompare(b.date));
  for (const t of cardRows) {
    const sid = d.bankToStmt.get(t.id); const st = sid && state.statements.find(s => s.id === sid);
    out.push('<div class="recon-row"><div><strong>' + esc(issuerName(t.issuer)) + '</strong> <span class="muted small num">' + shortDate(t.date) + '</span></div><div>' + money(t.amount, true) + '</div><div class="sub">' +
      (st ? '<span class="chip ok">מוצלב</span> ' + st.count + ' עסקאות בפירוט, הסכום זהה לחיוב בבנק' : '<span class="chip review">אין פירוט</span> <button class="linkbtn" data-go="import">העלה את פירוט ' + esc(issuerName(t.issuer)) + '</button>') + '</div></div>');
  }
  const linkedStmts = new Set(d.links.keys());
  for (const st of state.statements.filter(s => L.monthOf(s.chargeDate) === m && !linkedStmts.has(s.id))) {
    const inRange = d.bankFrom && st.chargeDate >= d.bankFrom && st.chargeDate <= d.bankTo;
    const cands = inRange ? state.tx.filter(t => t.kind === 'card' && t.issuer === st.issuer && !d.bankToStmt.has(t.id) && Math.abs(L.daysBetween(st.chargeDate, t.date)) <= 7) : [];
    out.push('<div class="recon-row"><div><strong>פירוט ' + esc(issuerName(st.issuer)) + '</strong> <span class="muted small">לחיוב ב-<span class="num">' + shortDate(st.chargeDate) + '</span></span></div><div>' + money(st.total, true) + '</div><div class="sub">' +
      (!inRange ? 'עוד אין קובץ עו"ש שמכסה את התאריך הזה, אז אין מול מה להצליב.' : cands.length ? '<span class="chip bad">הסכום לא תואם</span> בבנק יש חיוב של ' + cands.map(c => money(c.amount, true) + ' <button class="linkbtn" data-act="link" data-s="' + st.id + '" data-b="' + c.id + '">זה אותו חיוב</button>').join(' · ') : '<span class="chip bad">לא נמצא חיוב תואם בעו"ש</span>') + '</div></div>');
  }
  return out.join('');
}

function viewHome() {
  const d = derive();
  if (!month) return '<section class="card"><h2>מתחילים</h2><ol class="small" style="margin:0 0 14px;padding-inline-start:20px;display:flex;flex-direction:column;gap:8px">' +
    '<li>מורידים את פירוט כרטיסי האשראי (Excel) ואת תנועות העו"ש (PDF) מאתרי החברות והבנק.</li>' +
    '<li>מעלים את כולם יחד במסך הייבוא. חיובי אשראי בעו"ש מוצלבים עם הפירוט שלהם ולא נספרים פעמיים.</li>' +
    '<li>מסווגים פעם אחת את מה שלא זוהה, כמו העברות Bit. משם הסיווג אוטומטי.</li></ol>' +
    '<button class="btn primary" data-go="import">להעלאת קבצים</button></section>' +
    '<p class="muted small" style="margin:0;text-align:center">אפשר גם להוסיף תנועה ידנית בכפתור +.</p>';
  const t = totals(month, d);
  const left = r2(t.income - t.expense);
  const rev = state.tx.filter(needsReview).length;
  const cats = Object.entries(t.byCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;
  const recent = state.tx.filter(x => x.month === month).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recon = reconRows(month, d);
  return (rev ? '<div class="banner review"><p><strong>' + rev + ' תנועות מחכות לסיווג.</strong> בחירה אחת לכל בית עסק, ומשם זה קורה לבד.</p><button class="btn" data-act="review">לסיווג</button></div>' : '') +
    '<div class="stats"><div class="stat"><div class="lbl">הכנסות</div><div class="val pos">' + money(t.income) + '</div></div><div class="stat"><div class="lbl">הוצאות</div><div class="val">' + money(t.expense) + '</div></div><div class="stat left"><div class="lbl">נשאר</div><div class="val">' + money(left) + '</div></div></div>' +
    (recon ? '<section class="card"><h2>חיובי אשראי <small>הצלבה מול העו"ש</small></h2><div class="recon">' + recon + '</div></section>' : '') +
    '<section class="card"><h2>לאן הלך הכסף <small>' + esc(monthName(month)) + '</small></h2>' + (cats.length ? '<div class="bars">' + cats.map(([k, v]) => {
      const c = k === 'review' ? { name: 'לבדיקה', color: 'var(--warn)' } : catOr(k);
      return '<div class="bar-row"><div class="name"><span class="dot" style="background:' + c.color + '"></span><span>' + esc(c.name) + '</span></div><div>' + money(v) + '</div><div class="track"><div class="fill" style="width:' + Math.max(2, v / max * 100) + '%;background:' + c.color + '"></div></div></div>';
    }).join('') + '</div>' : '<p class="muted">אין הוצאות בחודש הזה.</p>') + '<p class="muted small" style="margin:12px 0 0">עסקאות אשראי משויכות לחודש שבו חויבו בבנק.</p></section>' +
    '<section class="card"><h2>אחרונות <button class="linkbtn small" data-go="tx">כל התנועות</button></h2><div class="list">' + recent.map(x => txRow(x, d)).join('') + '</div></section>';
}

function viewTx() {
  const d = derive();
  const q = L.norm(query);
  let list = state.tx.slice();
  if (txFilter === 'review') list = list.filter(needsReview);
  else {
    if (month) list = list.filter(t => t.month === month);
    if (txFilter === 'expense') list = list.filter(t => t.kind === 'expense');
    if (txFilter === 'income') list = list.filter(t => t.kind === 'income');
    if (txFilter === 'card') list = list.filter(t => t.kind === 'card');
  }
  if (q) list = list.filter(t => L.norm(t.desc).includes(q) || (cat(t.cat) && L.norm(cat(t.cat).name).includes(q)));
  list.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
  const rev = state.tx.filter(needsReview).length;
  const f = (id, label) => '<button data-act="filter" data-f="' + id + '" aria-pressed="' + (txFilter === id) + '">' + label + '</button>';
  return '<div class="filters" role="group" aria-label="סינון">' + f('all', 'הכל') + f('review', 'לבדיקה' + (rev ? ' (' + rev + ')' : '')) + f('expense', 'הוצאות') + f('income', 'הכנסות') + f('card', 'חיובי אשראי') + '</div>' +
    '<input class="field search" id="q" type="search" placeholder="חיפוש בית עסק או קטגוריה" value="' + esc(query) + '" aria-label="חיפוש">' +
    (txFilter === 'review' && list.length ? '<p class="muted small" style="margin:0">כל התנועות שעוד לא סווגו, מכל החודשים. לחץ על תנועה כדי לבחור קטגוריה.</p>' : '') +
    '<section class="card"><div class="list">' + (list.length ? list.map(t => txRow(t, d)).join('') : '<div class="empty">' + (txFilter === 'review' ? 'הכל מסווג.' : 'אין תנועות להצגה.') + '</div>') + '</div></section>';
}

function viewImport() {
  const d = derive();
  const res = lastResults.length ? '<section class="card"><h2>תוצאות הייבוא</h2>' + lastResults.map(r => r.ok ?
    '<div class="result"><div class="head"><strong>' + esc(r.label) + '</strong>' + (r.importId ? '<button class="btn ghost small" data-act="undo" data-id="' + r.importId + '">ביטול הייבוא</button>' : '') + '</div><div class="small"><span class="chip ok">' + r.added + ' נוספו</span> ' + (r.dup ? '<span class="chip">' + r.dup + ' כבר היו</span> ' : '') + (r.review ? '<span class="chip review">' + r.review + ' לבדיקה</span>' : '') + '</div><ul>' + r.details.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' :
    '<div class="result"><div class="head"><strong>' + esc(r.name) + '</strong><span class="chip bad">לא יובא</span></div><p class="small" style="margin:0">' + esc(r.msg) + '</p></div>').join('') + '</section>' : '';
  const stm = state.statements.slice().sort((a, b) => (b.chargeDate || '').localeCompare(a.chargeDate || ''));
  const imps = state.imports.slice().sort((a, b) => b.at - a.at);
  return '<label class="drop" id="drop" for="file"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--accent)"><path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4 15v4.5h16V15"/></svg>' +
    '<strong>' + (busy ? '<span class="spin" aria-hidden="true"></span> ' + esc(busy) : 'גרור לכאן קבצים, או לחץ לבחירה') + '</strong>' +
    '<span class="muted small">אפשר כמה קבצים יחד. הקבצים נקראים במכשיר. לענן נשמרות רק התנועות, לא הקבצים.</span>' +
    '<span class="types"><span class="chip">פירוט אשראי · Excel</span><span class="chip">תנועות עו"ש · PDF</span><span class="chip">גיבוי · JSON</span></span>' +
    '<input type="file" id="file" multiple accept=".xlsx,.xls,.csv,.pdf,.json"></label>' + res +
    (stm.length ? '<section class="card"><h2>פירוטי אשראי שיובאו</h2><div class="recon">' + stm.map(s => {
      const linked = d.links.has(s.id);
      return '<div class="recon-row"><div><strong>' + esc(issuerName(s.issuer)) + '</strong> <span class="muted small">לחיוב ב-<span class="num">' + fullDate(s.chargeDate) + '</span></span></div><div>' + money(s.total, true) + '</div><div class="sub">' + s.count + ' עסקאות · ' + (linked ? '<span class="chip ok">מוצלב עם העו"ש</span>' : '<span class="chip">ממתין להצלבה</span>') + (s.sumMatches === false ? ' <span class="chip bad">סכום השורות שונה מהסיכום</span>' : '') + '</div></div>';
    }).join('') + '</div></section>' : '') +
    (imps.length ? '<section class="card"><h2>קבצים שיובאו</h2><div class="recon">' + imps.map(i => '<div class="recon-row"><div><strong>' + esc(i.label) + '</strong><div class="muted small" style="overflow-wrap:anywhere">' + esc(i.name) + ' · ' + i.added + ' תנועות' + (i.by ? ' · ' + esc(i.by) : '') + '</div></div><button class="btn ghost small" data-act="undo" data-id="' + i.id + '">הסרה</button></div>').join('') + '</div></section>' : '') +
    viewCats() +
    '<section class="card"><h2>איך מורידים את הקבצים</h2><ol class="small" style="margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:6px">' +
    '<li><strong>כרטיס אשראי:</strong> באתר של חברת האשראי (כאל, ישראכרט, מקס), במסך פירוט העסקאות, בוחרים ייצוא ל-Excel.</li>' +
    '<li><strong>עו"ש:</strong> באתר הבנק, במסך תנועות בחשבון, בוחרים טווח תאריכים ושומרים כ-PDF.</li>' +
    '<li>מעלים את כולם כאן. חיוב אשראי שמופיע בעו"ש מוצלב עם הפירוט שלו ולא נספר פעמיים.</li></ol></section>' +
    '<section class="card"><h2>גיבוי</h2><p class="small muted" style="margin:0 0 10px">קובץ עם כל התנועות, הסיווגים וההצלבות. כדי לשחזר, מעלים אותו כאן כמו כל קובץ.</p><button class="btn" data-act="export">הורדת גיבוי</button></section>' +
    '<section class="card"><h2>חשבון</h2><div class="account"><span class="small">מחובר כ-<strong style="overflow-wrap:anywhere">' + esc(auth.email || '') + '</strong></span><button class="btn" data-act="signout">התנתקות</button></div><p class="small muted" style="margin:12px 0 10px">הנתונים נשמרים בענן ומשותפים לכל מי שמורשה להיכנס.</p><button class="btn danger" data-act="wipe">מחיקת כל הנתונים</button></section>';
}

function viewInsights() {
  const d = derive();
  if (!month) return '<div class="card empty">אין עדיין נתונים לניתוח.</div>';
  const ms = months(); const idx = ms.indexOf(month);
  const prev = ms.slice(Math.max(0, idx - 3), idx);
  const cur = totals(month, d);
  const prevT = prev.map(m => totals(m, d));
  const avg = k => prevT.length ? prevT.reduce((a, t) => a + (t.byCat[k] || 0), 0) / prevT.length : null;
  const keys = [...new Set([...Object.keys(cur.byCat), ...prevT.flatMap(t => Object.keys(t.byCat))])].filter(k => k !== 'review');
  const rows = keys.map(k => ({ k, v: cur.byCat[k] || 0, a: avg(k) })).filter(r => r.v > 0 || (r.a || 0) > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(1, ...rows.map(r => Math.max(r.v, r.a || 0)));
  const parts = [];

  parts.push('<section class="card"><h2>הוצאות לפי קטגוריה <small>' + esc(monthName(month)) + '</small></h2><div class="bars">' + rows.map(r => {
    const c = catOr(r.k); const diff = r.a ? (r.v - r.a) / r.a : null;
    const tag = diff == null ? '' : diff > 0.3 && r.v - r.a > 100 ? ' <span class="chip bad">+' + Math.round(diff * 100) + '%</span>' : diff < -0.3 && r.a - r.v > 100 ? ' <span class="chip ok">' + Math.round(diff * 100) + '%</span>' : '';
    return '<div class="bar-row"><div class="name"><span class="dot" style="background:' + c.color + '"></span><span>' + esc(c.name) + '</span></div><div>' + money(r.v) + tag + '</div><div class="track"><div class="fill" style="width:' + (r.v / max * 100) + '%;background:' + c.color + '"></div>' + (r.a ? '<div class="tick" style="right:calc(' + (r.a / max * 100) + '% - 1px)"></div>' : '') + '</div></div>';
  }).join('') + '</div>' + (prev.length ? '<div class="legend"><span><i></i>ממוצע ' + (prev.length === 1 ? 'החודש הקודם' : prev.length + ' החודשים הקודמים') + '</span></div>' : '<p class="muted small" style="margin:10px 0 0">כשיהיו נתונים מכמה חודשים, תראה כאן השוואה לממוצע.</p>') + '</section>');

  const groups = new Map();
  for (const t of state.tx) {
    if (t.kind !== 'expense' || t.src !== 'card') continue;
    const k = L.norm(t.desc); if (!groups.has(k)) groups.set(k, { desc: t.desc, months: new Set(), amts: [], standing: false, last: t });
    const g = groups.get(k); g.months.add(t.month); g.amts.push(t.amount); if (/הוראת קבע/.test(t.type || '')) g.standing = true; if (t.date > g.last.date) g.last = t;
  }
  const subs = [...groups.values()].filter(g => { if (needsReview(g.last) || g.last.transfer) return false; const mx = Math.max(...g.amts), mn = Math.min(...g.amts); return g.standing || (g.months.size >= 2 && mn > 0 && (mx - mn) / mx <= 0.15); }).sort((a, b) => b.last.amount - a.last.amount);
  const subTotal = subs.reduce((a, g) => a + g.last.amount, 0);
  parts.push('<section class="card"><h2>הוראות קבע ומנויים <small>' + money(subTotal) + ' בחודש</small></h2>' + (subs.length ? '<div class="list">' + subs.map(g => '<div class="insight"><div>' + esc(g.desc) + '</div><div>' + money(g.last.amount, true) + '</div><div class="sub">' + (g.standing ? 'הוראת קבע' : 'חוזר ' + g.months.size + ' חודשים') + ' · ' + money(g.last.amount * 12) + ' בשנה</div></div>').join('') + '</div><p class="muted small" style="margin:10px 0 0">בדוק אם יש כאן משהו שכבר לא בשימוש.</p>' : '<p class="muted">לא זוהו עדיין חיובים חוזרים.</p>') + '</section>');

  const fees = state.tx.filter(t => t.cat === 'fees' && t.kind === 'expense');
  if (fees.length) {
    const fm = [...new Set(fees.map(t => t.month))];
    const span = Math.max(fm.length, d.bankFrom && d.bankTo ? Math.round(L.daysBetween(d.bankFrom, d.bankTo) / 30.4) : 1);
    const sum = fees.reduce((a, t) => a + t.amount, 0);
    const byDesc = {}; for (const t of fees) byDesc[t.desc] = (byDesc[t.desc] || 0) + t.amount;
    parts.push('<section class="card"><h2>עמלות בנק ואשראי <small>' + span + ' חודשים</small></h2><div class="big-note">' + money(sum, true) + '</div><p class="muted small" style="margin:2px 0 10px">בערך ' + money(sum / span * 12) + ' בשנה, אם הקצב נשמר.</p><div class="list">' +
      Object.entries(byDesc).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => '<div class="insight"><div>' + esc(k) + '</div><div>' + money(v, true) + '</div></div>').join('') + '</div></section>');
  }

  const tm = {};
  for (const t of state.tx) if (t.month === month && t.kind === 'expense' && t.amount > 0 && !isExcluded(t.cat)) { const k = L.norm(t.desc); tm[k] = tm[k] || { desc: t.desc, sum: 0, n: 0 }; tm[k].sum += t.amount; tm[k].n++; }
  const top = Object.values(tm).sort((a, b) => b.sum - a.sum).slice(0, 5);
  if (top.length) parts.push('<section class="card"><h2>לאן הכי הרבה כסף הלך <small>' + esc(monthName(month)) + '</small></h2><div class="list">' + top.map(x => '<div class="insight"><div>' + esc(x.desc) + '</div><div>' + money(x.sum, true) + '</div><div class="sub">' + x.n + (x.n === 1 ? ' חיוב' : ' חיובים') + '</div></div>').join('') + '</div></section>');

  const seen = {}; const dups = [];
  for (const t of state.tx) { if (t.month !== month || t.kind !== 'expense') continue; const k = t.date + '|' + L.norm(t.desc) + '|' + t.amount + '|' + t.src; (seen[k] = seen[k] || []).push(t); }
  for (const g of Object.values(seen)) if (g.length > 1) dups.push(g);
  if (dups.length) parts.push('<section class="card"><h2>חיוב כפול חשוד</h2><div class="list">' + dups.map(g => '<div class="insight"><div>' + esc(g[0].desc) + '</div><div>' + g.length + ' × ' + money(g[0].amount, true) + '</div><div class="sub">באותו יום, <span class="num">' + fullDate(g[0].date) + '</span>. אם זה לא מכוון, פנה לחברת האשראי.</div></div>').join('') + '</div></section>');

  const inst = state.tx.map(t => ({ t, i: L.installment(t.notes) })).filter(x => x.i && x.i.n > x.i.k);
  if (inst.length) { const rest = inst.reduce((a, x) => a + x.t.amount * (x.i.n - x.i.k), 0); parts.push('<section class="card"><h2>תשלומים פתוחים <small>' + money(rest) + ' עוד לחיוב</small></h2><div class="list">' + inst.map(x => '<div class="insight"><div>' + esc(x.t.desc) + '</div><div>' + money(x.t.amount, true) + '</div><div class="sub">תשלום ' + x.i.k + ' מתוך ' + x.i.n + ' · נשארו ' + (x.i.n - x.i.k) + '</div></div>').join('') + '</div></section>'); }

  const inc = Object.entries(cur.incCat).sort((a, b) => b[1] - a[1]);
  if (inc.length) parts.push('<section class="card"><h2>הכנסות <small>' + esc(monthName(month)) + '</small></h2><div class="list">' + inc.map(([k, v]) => '<div class="insight"><div>' + esc(k === 'review' ? 'לא מסווג' : catOr(k).name) + '</div><div class="pos">' + money(v, true) + '</div></div>').join('') + '</div></section>');

  return parts.join('');
}

const G_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

function viewAuth() {
  if (auth.status === 'loading') return '<div class="auth"><span class="spin" aria-label="טוען"></span></div>';
  if (auth.status === 'denied') return '<div class="auth"><section class="card"><h2>אין הרשאה</h2><p>החשבון <strong style="overflow-wrap:anywhere">' + esc(auth.email || '') + '</strong> לא נמצא ברשימת המורשים של משק הבית.</p><p class="small">בקש ממי שמנהל את האפליקציה להוסיף את הכתובת, או התחבר עם חשבון אחר.</p><button class="btn" data-act="signout">התחברות עם חשבון אחר</button></section></div>';
  if (auth.status === 'error') return '<div class="auth"><section class="card"><h2>משהו השתבש</h2><p>לא הצלחתי לטעון את הנתונים. בדוק את החיבור לאינטרנט ונסה שוב.</p><button class="btn" data-act="reload">נסה שוב</button></section></div>';
  return '<div class="auth"><section class="card"><h2>כלכלת הבית</h2><p>הכנסות, הוצאות וחיובי אשראי של משק הבית במקום אחד. הכניסה רק לבני המשפחה.</p><button class="gbtn" data-act="signin">' + G_ICON + 'התחברות עם Google</button></section></div>';
}

// ---------- render & events ----------
function render() {
  const ready = auth.status === 'ready';
  $('#tabs').hidden = !ready; $('#fab').hidden = !ready; $('#month').hidden = !ready;
  document.body.style.paddingBottom = ready ? '' : '0';
  if (!ready) { $('#view').innerHTML = viewAuth(); return; }
  const ms = months();
  if (!month || !ms.includes(month)) month = pickDefaultMonth();
  $('#month').innerHTML = ms.length ? ms.slice().reverse().map(m => '<option value="' + m + '"' + (m === month ? ' selected' : '') + '>' + esc(monthName(m)) + '</option>').join('') : '<option>אין נתונים</option>';
  $('#month').disabled = !ms.length;
  const rev = state.tx.filter(needsReview).length;
  $('#badge').hidden = !rev; $('#badge').textContent = rev;
  document.querySelectorAll('nav.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.v === view ? 'page' : 'false'));
  const html = view === 'tx' ? viewTx() : view === 'import' ? viewImport() : view === 'insights' ? viewInsights() : viewHome();
  const ae = document.activeElement;
  const fid = ae && ae.id && $('#view').contains(ae) && ae.tagName === 'INPUT' ? ae.id : null;
  const pos = fid ? ae.selectionStart : null;
  const edKeep = $('#ed-cat') ? { v: $('#ed-cat').value, n: ($('#ed-new-name') || {}).value || '', a: ($('#ed-always') || {}).checked } : null;
  $('#view').innerHTML = html;
  if (edKeep && $('#ed-cat')) {
    if ([...$('#ed-cat').options].some(o => o.value === edKeep.v)) $('#ed-cat').value = edKeep.v;
    $('#ed-new-row').hidden = $('#ed-cat').value !== '__new'; $('#ed-new-name').value = edKeep.n;
    if ($('#ed-always')) $('#ed-always').checked = edKeep.a;
  }
  if (fid && document.getElementById(fid)) { const el = document.getElementById(fid); el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
}

function go(v) { if (location.hash !== '#' + v) location.hash = v; else { view = v; render(); } }
function fromHash() { const h = (location.hash || '#home').slice(1); view = ['home', 'tx', 'import', 'insights'].includes(h) ? h : 'home'; openTx = null; render(); window.scrollTo(0, 0); }
window.addEventListener('hashchange', fromHash);
$('#month').addEventListener('change', e => { month = e.target.value; openTx = null; render(); });

function armed(b, label, armedLabel) {
  if (b.classList.contains('armed')) return true;
  b.classList.add('armed'); b.textContent = armedLabel;
  setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.textContent = label; } }, 4000);
  return false;
}

document.addEventListener('click', async e => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'signin') {
    try { await store.signIn(); }
    catch (err) {
      const code = err && err.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      toast(code === 'auth/popup-blocked' ? 'הדפדפן חסם את חלון ההתחברות. אפשר חלונות קופצים לאתר הזה ונסה שוב.' : code === 'auth/unauthorized-domain' ? 'הכתובת הזו לא מורשית להתחברות. צריך להוסיף אותה ב-Firebase.' : 'ההתחברות נכשלה. נסה שוב.');
    }
    return;
  }
  if (act === 'signout') { await store.signOut(); return; }
  if (act === 'reload') { location.reload(); return; }
  if (act === 'open') { openTx = openTx === b.dataset.id ? null : b.dataset.id; edErr = ''; render(); return; }
  if (act === 'close-ed') { openTx = null; render(); return; }
  if (act === 'save-cat') {
    const c = $('#ed-cat').value;
    const showErr = m => { edErr = m; $('#ed-err').textContent = m; };
    if (!c) { showErr('בחרו קטגוריה.'); $('#ed-cat').focus(); return; }
    if (c === '__new') {
      const t = state.tx.find(x => x.id === b.dataset.id);
      const v = validateCatName($('#ed-new-name').value);
      if (v.err) { showErr(v.err); $('#ed-new-name').focus(); return; }
      const nc = { id: 'c' + uid().slice(0, 12), name: v.name, color: nextColor(), kind: t && t.kind === 'income' ? 'income' : 'expense' };
      edErr = ''; openTx = null;
      setCategory(b.dataset.id, nc.id, $('#ed-always').checked, nc);
      toast('נוספה קטגוריה: ' + v.name);
      return;
    }
    edErr = ''; setCategory(b.dataset.id, c, $('#ed-always').checked); openTx = null; return;
  }
  if (act === 'swatch') {
    if (b.dataset.t === 'edit' && editDraft) editDraft.color = b.dataset.c; else catDraft.color = b.dataset.c;
    b.parentElement.querySelectorAll('.swatch').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    return;
  }
  if (act === 'cat-add') {
    const v = validateCatName(catDraft.name);
    if (v.err) { catErr = v.err; render(); const el = $('#cat-new-name'); if (el) el.focus(); return; }
    const nc = { id: 'c' + uid().slice(0, 12), name: v.name, color: catDraft.color || nextColor(), kind: catDraft.kind };
    catDraft = { name: '', kind: catDraft.kind, color: null }; catErr = '';
    commit([settingsOp(null, null, [...state.cats, nc])]).then(() => toast('נוספה קטגוריה: ' + nc.name)).catch(() => {});
    return;
  }
  if (act === 'cat-edit') { const c = state.cats.find(x => x.id === b.dataset.id); if (!c) return; editCat = c.id; editDraft = { name: c.name, color: c.color }; catErr = ''; render(); const el = $('#cat-edit-name'); if (el) el.focus(); return; }
  if (act === 'cat-cancel') { editCat = null; editDraft = null; catErr = ''; render(); return; }
  if (act === 'cat-save') {
    const v = validateCatName(editDraft.name, b.dataset.id);
    if (v.err) { catErr = v.err; render(); return; }
    const cats = state.cats.map(c => c.id === b.dataset.id ? { ...c, name: v.name, color: editDraft.color || c.color } : c);
    editCat = null; editDraft = null; catErr = '';
    commit([settingsOp(null, null, cats)]).catch(() => {});
    return;
  }
  if (act === 'cat-del') {
    const n = +b.dataset.n;
    if (!armed(b, 'מחיקה', n ? 'לחצו שוב: ' + n + ' תנועות יחזרו לבדיקה' : 'לחצו שוב למחיקה')) return;
    deleteCategory(b.dataset.id); return;
  }
  if (act === 'del') { if (!armed(b, 'מחיקה', 'לחץ שוב למחיקה')) return; openTx = null; commit([{ op: 'delete', col: 'tx', id: b.dataset.id }]).catch(() => {}); return; }
  if (act === 'wipe') {
    if (!armed(b, 'מחיקת כל הנתונים', 'לחץ שוב למחיקת הכל, לכל בני המשפחה')) return;
    const ops = [];
    for (const col of ['tx', 'statements', 'imports']) for (const d of state[col]) ops.push({ op: 'delete', col, id: d.id });
    ops.push(settingsOp({}, {}));
    lastResults = []; month = null;
    commit(ops).then(() => toast('כל הנתונים נמחקו.')).catch(() => {});
    return;
  }
  if (act === 'undo') { undoImport(b.dataset.id); return; }
  if (act === 'link') { commit([settingsOp(null, { ...state.links, [b.dataset.s]: b.dataset.b })]).catch(() => {}); return; }
  if (act === 'filter') { txFilter = b.dataset.f; openTx = null; render(); return; }
  if (act === 'review') { txFilter = 'review'; go('tx'); return; }
  if (act === 'export') { exportBackup(); return; }
});

document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'q') { query = e.target.value; render(); return; }
  if (id === 'cat-new-name') { catDraft.name = e.target.value; if (catErr) { catErr = ''; const er = e.target.closest('.cat-form').querySelector('.err'); if (er) er.remove(); } return; }
  if (id === 'cat-edit-name' && editDraft) { editDraft.name = e.target.value; return; }
  if (id === 'ed-new-name') { edErr = ''; const er = $('#ed-err'); if (er) er.textContent = ''; }
});
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id === 'file') { handleFiles(e.target.files); e.target.value = ''; return; }
  if (id === 'cat-new-kind') { catDraft.kind = e.target.value; return; }
  if (id === 'ed-cat') {
    const isNew = e.target.value === '__new';
    $('#ed-new-row').hidden = !isNew; edErr = ''; $('#ed-err').textContent = '';
    if (isNew) $('#ed-new-name').focus();
  }
});
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } }));
document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('#drop'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('over'); });
document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.remove('over'); handleFiles(e.dataTransfer.files); } else if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });
document.addEventListener('dragover', e => e.preventDefault());

// manual add
const dlg = $('#addDlg');
function fillAddCats() { const k = document.querySelector('input[name=kind]:checked').value; $('#addCat').innerHTML = catOptions(k, ''); }
$('#fab').addEventListener('click', () => {
  $('#addForm').reset(); $('#addErr').textContent = '';
  const t = new Date(); $('#addDate').value = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  fillAddCats(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); setTimeout(() => $('#addAmount').focus(), 30);
});
document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener('change', fillAddCats));
$('#addCancel').addEventListener('click', () => dlg.close());
['addAmount', 'addDesc', 'addDate', 'addCat'].forEach(id => $('#' + id).addEventListener('input', () => { $('#addErr').textContent = ''; }));
$('#addForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = L.parseAmount($('#addAmount').value);
  const desc = $('#addDesc').value.trim(); const date = $('#addDate').value; const c = $('#addCat').value;
  const kind = document.querySelector('input[name=kind]:checked').value;
  if (!(amount > 0)) { $('#addErr').textContent = 'הזן סכום גדול מאפס.'; $('#addAmount').focus(); return; }
  if (!desc) { $('#addErr').textContent = 'הוסף תיאור קצר.'; $('#addDesc').focus(); return; }
  if (!date) { $('#addErr').textContent = 'בחר תאריך.'; $('#addDate').focus(); return; }
  if (!c) { $('#addErr').textContent = 'בחר קטגוריה.'; $('#addCat').focus(); return; }
  month = date.slice(0, 7);
  commit([{ op: 'set', col: 'tx', id: uid(), data: { key: 'm|' + uid(), importId: 'manual', src: 'manual', kind, date, month, desc, amount: r2(amount), cat: c, how: 'manual', type: '', sector: '', notes: '', transfer: false, by: auth.email || '' } }]).catch(() => {});
  dlg.close();
});

fromHash();
