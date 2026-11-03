const Ledger = (() => {
  const EXPENSE_CATS = [
    { id: 'food', name: 'מזון וסופר', color: '#3B8C5A' },
    { id: 'dining', name: 'אוכל בחוץ ומשלוחים', color: '#D9773B' },
    { id: 'housing', name: 'דיור וחשבונות', color: '#5470C6' },
    { id: 'insurance', name: 'ביטוחים', color: '#7A5BC2' },
    { id: 'subs', name: 'תקשורת ומנויים', color: '#2E9AA8' },
    { id: 'car', name: 'רכב ותחבורה', color: '#8C6D3B' },
    { id: 'health', name: 'בריאות ופארם', color: '#C2477A' },
    { id: 'grooming', name: 'טיפוח', color: '#A66DD4' },
    { id: 'blink', name: 'בלינק', color: '#E0607E' },
    { id: 'home', name: 'בית ומשק בית', color: '#6D8C3B' },
    { id: 'shopping', name: 'קניות וביגוד', color: '#B85C5C' },
    { id: 'leisure', name: 'פנאי ובילוי', color: '#C29A2E' },
    { id: 'gifts', name: 'מתנות', color: '#D45FA0' },
    { id: 'kids', name: 'חינוך וילדים', color: '#4A9BD9' },
    { id: 'fees', name: 'עמלות בנק ואשראי', color: '#7D8291' },
    { id: 'transfers', name: 'העברות ו-Bit', color: '#5E7FA3' },
    { id: 'other', name: 'אחר', color: '#959AA6' },
    { id: 'unitemized', name: 'אשראי בלי פירוט', color: '#A0A4B0', system: true },
    { id: 'internal', name: 'העברה בין חשבונות שלי', color: '#B7BBC6', excluded: true }
  ];
  const INCOME_CATS = [
    { id: 'salary', name: 'משכורת', color: '#2F8F5B' },
    { id: 'business', name: 'הכנסה מעסק', color: '#3A9C8C' },
    { id: 'refund', name: 'החזרים וזיכויים', color: '#5C9C3A' },
    { id: 'invest', name: 'השקעות ודיבידנדים', color: '#6F8F2F' },
    { id: 'other_inc', name: 'הכנסה אחרת', color: '#7FA38F' },
    { id: 'internal', name: 'העברה בין חשבונות שלי', color: '#B7BBC6', excluded: true }
  ];
  const ISSUERS = { cal: 'כאל', isracard: 'ישראכרט', max: 'מקס', amex: 'אמריקן אקספרס', diners: 'דיינרס' };

  const SECTOR_MAP = [
    ['קוסמטיק', 'grooming'], ['טיפוח', 'grooming'],
    ['מסעד', 'dining'], ['מזון', 'food'], ['סופרמרקט', 'food'], ['רפואה', 'health'], ['בריאות', 'health'], ['פארם', 'health'],
    ['ריהוט', 'home'], ['בית וגן', 'home'], ['ביטוח', 'insurance'], ['תקשורת', 'subs'], ['מחשב', 'subs'],
    ['רכב', 'car'], ['תחבורה', 'car'], ['דלק', 'car'], ['פנאי', 'leisure'], ['בילוי', 'leisure'], ['תיירות', 'leisure'],
    ['אופנה', 'shopping'], ['הלבשה', 'shopping'], ['תעשיה', 'shopping'], ['מכירות', 'shopping'], ['חשמל', 'housing'],
    ['גז', 'housing'], ['עירי', 'housing'], ['מוסדות', 'housing'], ['חינוך', 'kids'], ['שונות', 'other']
  ];

  const DICT = [
    ['transfers', ['bit', 'ביט', 'paybox', 'פייבוקס', 'paypal', 'פייפאל']],
    ['gifts', ['שובר', 'שוברי מתנה', 'buyme', 'ביי-מי', 'ביי מי', 'תו הזהב', 'גיפטכארד']],
    ['dining', ['wolt', 'וולט', 'תן ביס', '10bis', 'cibus', 'סיבוס', 'מקדונלד', 'שייק שאק', 'ארומה', 'קפה', 'פיצה', 'בורגר', 'מסעד', 'סושי']],
    ['food', ['שופרסל', 'רמי לוי', 'יוחננוף', 'ויקטורי', 'אושר עד', 'חצי חינם', 'יינות ביתן', 'טיב טעם', 'קרפור', 'am:pm', 'פרש מרקט', 'מחסני השוק', 'סופר יודה', 'מעדני']],
    ['housing', ['ועד הבית', 'ארנונה', 'חברת החשמל', 'חשמל לישראל', 'מקורות', 'תאגיד', 'עיריית', 'מועצה', 'שכר דירה', 'אמישראגז', 'סופרגז', 'פזגז']],
    ['insurance', ['ביטוח', 'כלל ', 'הראל', 'מגדל', 'הפניקס', 'מנורה', 'איילון', 'הכשרה']],
    ['subs', ['netflix', 'yes', 'hot', 'spotify', 'disney', 'adobe', 'apple', 'google', 'microsoft', 'youtube', 'icloud', 'openai', 'chatgpt', 'בזק', 'פרטנר', 'סלקום', 'גולן טלקום', 'הוט מובייל', 'פלאפון']],
    ['car', ['פז ', 'סונול', 'דור אלון', 'דלק ', 'yellow', 'חניון', 'חניה', 'פנגו', 'סלופארק', 'cellopark', 'כביש 6', 'רב קו', 'רכבת', 'וואש', 'wash', 'מוסך', 'gett', 'uber', 'yango']],
    ['grooming', ['מספרה', 'מספרת', 'ציפורנ', 'קוסמטיק', 'מניקור', 'פדיקור', 'barber', 'nails', 'beauty']],
    ['health', ['סופר פארם', 'סופרפארם', 'super-pharm', 'superpharm', 'גוד פארם', 'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'בית מרקחת', 'אופטיק']],
    ['home', ['איקאה', 'ikea', 'הום סנטר', 'אייס', 'נעמן', 'ורדינון', 'שטראוס מים', 'תמי4']],
    ['shopping', ['aliexpress', 'עלי אקספרס', 'amazon', 'אמזון', 'shein', 'קסטרו', 'זארה', 'zara', 'טרמינל x', 'ksp', 'באג', 'מחסני חשמל', 'איבורי']],
    ['leisure', ['סינמה', 'cinema', 'איוונטר', 'eventer', 'תיאטרון', 'הופע', 'לאן ']],
    ['fees', ['דמי כרטיס', 'עמלה', 'דמי חבר']]
  ];

  const norm = s => String(s == null ? '' : s)
    .replace(/[‎‏‪-‮]/g, '')
    .replace(/[״”“]/g, '"').replace(/[׳’‘]/g, "'")
    .replace(/\s+/g, ' ').trim().toLowerCase();

  const isLatin = p => /^[a-z0-9:&. -]+$/.test(p.trim());
  const hasPattern = (text, pat) => {
    if (isLatin(pat)) {
      const p = pat.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-z])' + p + '([^a-z]|$)').test(text);
    }
    if (pat.trim().length <= 3) {
      const p = pat.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[\\s\\-\'"])' + p + '($|[\\s\\-\'"])').test(text);
    }
    return (' ' + text + ' ').includes(pat);
  };

  const parseAmount = v => {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    let s = String(v).replace(/[‎‏‪-‮₪\s]/g, '').replace(/,/g, '');
    if (!/^-?\d*\.?\d+-?$/.test(s)) return null;
    if (s.endsWith('-')) s = '-' + s.slice(0, -1);
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  const pad = n => String(n).padStart(2, '0');
  const parseDate = v => {
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
      return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
    }
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    const m = String(v == null ? '' : v).match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (!m) return null;
    let y = +m[3]; if (y < 100) y += 2000;
    const mo = +m[2], d = +m[1];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return y + '-' + pad(mo) + '-' + pad(d);
  };
  const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  const detectIssuer = text => {
    const t = norm(text);
    if (/ישראכרט|isracard/.test(t)) return 'isracard';
    if (/כאל|כרטיסי אשראי לישראל|\bcal\b/.test(t)) return 'cal';
    if (/מקס איט|max it|לאומי קארד|\bmax\b/.test(t)) return 'max';
    if (/אמריקן אקספרס|amex|american express/.test(t)) return 'amex';
    if (/דיינרס|diners/.test(t)) return 'diners';
    return null;
  };

  const categorize = (merchant, sector, rules) => {
    const n = norm(merchant);
    if (rules) {
      for (const key of Object.keys(rules)) if (key && n.includes(key)) return { cat: rules[key], how: 'rule' };
    }
    for (const [cat, pats] of DICT) if (pats.some(p => hasPattern(n, p))) return { cat: cat === 'transfers' ? null : cat, how: cat === 'transfers' ? 'transfer' : 'dict', transfer: cat === 'transfers' };
    const s = norm(sector);
    if (s) for (const [k, cat] of SECTOR_MAP) if (s.includes(k)) return { cat, how: 'sector' };
    return { cat: null, how: 'none' };
  };

  const HEADER_RX = {
    merchant: /שם ?בית ה?עסק|^בית עסק$|תיאור/,
    date: /תאריך ?(ה?עסקה|רכישה)?$/,
    chargeDate: /תאריך ?חיוב/,
    chargeAmount: /סכום ?ה?חיוב/,
    txAmount: /סכום ?(ה?עסקה|מקורי)|^סכום$/,
    type: /סוג ?(ה?עסקה)?$/,
    sector: /ענף|קטגוריה/,
    notes: /הערות|פירוט ?נוסף/
  };

  function mapHeader(row) {
    const cells = row.map(c => norm(c));
    if (!cells.some(c => HEADER_RX.merchant.test(c))) return null;
    const map = {};
    cells.forEach((c, i) => {
      if (!c) return;
      for (const [k, rx] of Object.entries(HEADER_RX)) {
        if (map[k] != null) continue;
        if (k === 'date' && /חיוב/.test(c)) continue;
        if (k === 'txAmount' && /חיוב/.test(c)) continue;
        if (rx.test(c)) { map[k] = i; break; }
      }
    });
    if (map.date == null || (map.chargeAmount == null && map.txAmount == null)) return null;
    return map;
  }

  // sheets: [{ name, rows: any[][] }]
  function parseCardWorkbook(sheets) {
    const allText = sheets.map(s => s.rows.flat().filter(v => typeof v === 'string').join(' ')).join(' ');
    const footerText = sheets.map(s => s.rows.slice(-6).flat().filter(v => typeof v === 'string').join(' ')).join(' ');
    const issuer = detectIssuer(footerText) || detectIssuer(allText);
    const statements = new Map();
    const warnings = [];
    let found = false;
    for (const sh of sheets) {
      let map = null, chargeDate = null, declared = null;
      for (const row of sh.rows) {
        if (!row || !row.length) continue;
        const joined = row.filter(v => v != null).map(String).join(' ');
        const cm = norm(joined).match(/לחיוב ?ב?-? ?(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})(.*)/);
        if (cm) { chargeDate = parseDate(cm[1]); const am = cm[2].match(/-?[\d,]+\.?\d*/); declared = am ? parseAmount(am[0]) : null; map = null; continue; }
        const hm = mapHeader(row);
        if (hm) { map = hm; found = true; continue; }
        if (!map) continue;
        const date = parseDate(row[map.date]);
        const merchant = row[map.merchant] != null ? String(row[map.merchant]).trim() : '';
        let amount = map.chargeAmount != null ? parseAmount(row[map.chargeAmount]) : null;
        if (amount == null && map.txAmount != null) amount = parseAmount(row[map.txAmount]);
        if (!date || !merchant || amount == null) continue;
        const rowCharge = map.chargeDate != null ? parseDate(row[map.chargeDate]) : null;
        const cd = rowCharge || chargeDate || null;
        const key = cd || 'none';
        if (!statements.has(key)) statements.set(key, { chargeDate: cd, declared: rowCharge ? null : declared, rows: [] });
        statements.get(key).rows.push({
          date, merchant,
          amount,
          txAmount: map.txAmount != null ? parseAmount(row[map.txAmount]) : amount,
          type: map.type != null && row[map.type] != null ? String(row[map.type]).trim() : '',
          sector: map.sector != null && row[map.sector] != null ? String(row[map.sector]).trim() : '',
          notes: map.notes != null && row[map.notes] != null ? String(row[map.notes]).trim() : ''
        });
      }
    }
    if (!found) warnings.push('לא מצאתי בקובץ טבלה עם עמודת "שם בית עסק". ודא שזה קובץ פירוט עסקאות מחברת האשראי.');
    const list = [...statements.values()].map(s => {
      const sum = Math.round(s.rows.reduce((a, r) => a + r.amount, 0) * 100) / 100;
      return { ...s, sum, sumMatches: s.declared == null ? null : Math.abs(sum - s.declared) < 0.05 };
    });
    return { kind: 'card', issuer, statements: list, warnings };
  }

  // pages: [[{ s, x, y, w }]]  (pdf.js text items, y grows upward)
  function parseBankPages(pages) {
    const DATE = /^\d{2}\/\d{2}\/\d{4}$/;
    const AMT = /^-?₪?-?(\d{1,3}(,\d{3})*|\d+)?\.\d{1,2}$|^-?₪?-?\d{1,3}(,\d{3})+$/;
    let header = null, bankName = null;
    const rows = [];
    const firstText = pages.length ? pages[0].map(i => i.s).join(' ') : '';
    if (/bankhapoalim|הפועלים/i.test(firstText)) bankName = 'בנק הפועלים';
    else if (/leumi|לאומי/i.test(firstText)) bankName = 'בנק לאומי';
    else if (/discount|דיסקונט/i.test(firstText)) bankName = 'בנק דיסקונט';
    else if (/mizrahi|מזרחי/i.test(firstText)) bankName = 'בנק מזרחי טפחות';
    for (const items of pages) {
      const byY = new Map();
      for (const it of items) {
        if (!it.s || !it.s.trim()) continue;
        const y = Math.round(it.y / 2) * 2;
        if (!byY.has(y)) byY.set(y, []);
        byY.get(y).push({ ...it, s: it.s.trim(), c: it.x + (it.w || 0) / 2 });
      }
      const lines = [...byY.entries()].sort((a, b) => b[0] - a[0]).map(e => e[1].sort((a, b) => b.x - a.x));
      for (const line of lines) {
        const texts = line.map(i => norm(i.s));
        if (texts.includes('חובה') && texts.includes('זכות')) {
          const at = w => line.find(i => norm(i.s) === w || norm(i.s).startsWith(w));
          header = { debit: at('חובה').c, credit: at('זכות').c, balance: (at('יתרה') || {}).c };
          continue;
        }
        if (!header) continue;
        const dateItem = line.find(i => DATE.test(i.s));
        if (!dateItem) continue;
        const amounts = line.filter(i => i !== dateItem && AMT.test(i.s.replace(/\s/g, '')));
        if (!amounts.length) continue;
        let balItem = amounts.find(i => i.s.includes('₪'));
        if (!balItem && header.balance != null && amounts.length > 1) balItem = amounts.reduce((a, b) => Math.abs(a.c - header.balance) < Math.abs(b.c - header.balance) ? a : b);
        const others = amounts.filter(i => i !== balItem);
        let debit = 0, credit = 0;
        for (const a of others) {
          const v = Math.abs(parseAmount(a.s));
          if (Math.abs(a.c - header.debit) <= Math.abs(a.c - header.credit)) debit += v; else credit += v;
        }
        if (!debit && !credit) continue;
        const desc = line.filter(i => i !== dateItem && !amounts.includes(i)).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim();
        rows.push({ date: parseDate(dateItem.s), desc, debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100, balance: balItem ? parseAmount(balItem.s) : null });
      }
    }
    // verify running balance (statement lists newest first) and fix a flipped side when that makes the chain consistent
    let checked = 0, ok = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if (a.balance == null || b.balance == null) continue;
      checked++;
      const fits = r => Math.abs(b.balance + r.credit - r.debit - a.balance) < 0.02;
      if (fits(a)) { ok++; continue; }
      const swapped = { ...a, debit: a.credit, credit: a.debit };
      if (fits(swapped)) { rows[i] = swapped; ok++; }
    }
    const dates = rows.map(r => r.date).sort();
    return { kind: 'bank', bankName: bankName || 'עו"ש', rows, balanceCheck: { checked, ok }, from: dates[0] || null, to: dates[dates.length - 1] || null, warnings: rows.length ? [] : ['לא מצאתי בקובץ טבלת תנועות עם עמודות "חובה" ו"זכות".'] };
  }

  // descriptions credited in 3+ different months with 1,000 ₪ or more each: likely salary
  const recurringIncome = rows => {
    const months = new Map();
    for (const r of rows) {
      if (!(r.credit >= 1000)) continue;
      const k = norm(r.desc);
      if (!months.has(k)) months.set(k, new Set());
      months.get(k).add(r.date.slice(0, 7));
    }
    return new Set([...months.entries()].filter(([, m]) => m.size >= 3).map(([k]) => k));
  };

  const classifyBank = (row, rules, salarySet) => {
    const n = norm(row.desc);
    const isCredit = row.credit > 0;
    const out = { issuer: null, kind: isCredit ? 'income' : 'expense', cat: null, how: 'none', transfer: false };
    if (!isCredit) {
      const iss = detectIssuer(n);
      if (iss) return { ...out, kind: 'card', issuer: iss, cat: 'unitemized', how: 'card' };
    }
    if (rules) for (const key of Object.keys(rules)) if (key && n.includes(key)) return { ...out, cat: rules[key], how: 'rule' };
    if (/^עמ'|עמ' |עמלה|ע\.מפעולות|הקצאת אשראי|דמי ניהול|השלמה למינ|ontime/.test(n)) return { ...out, cat: isCredit ? 'refund' : 'fees', how: 'dict' };
    if (/דיבידנד|ריבית זכות|ני"ע/.test(n)) return { ...out, cat: isCredit ? 'invest' : 'other', how: 'dict' };
    if (/(^|[^a-z])bit([^a-z]|$)|(^|\s)ביט(\s|$)|העב'|העברה|זיכוי מ|פייבוקס|paybox|הפקדה/.test(n)) return { ...out, transfer: true, how: 'transfer' };
    if (isCredit && salarySet && salarySet.has(n)) return { ...out, cat: 'salary', how: 'pattern' };
    if (!isCredit) { const c = categorize(row.desc, '', null); if (c.cat) return { ...out, cat: c.cat, how: c.how }; }
    return out;
  };

  // statements: [{id, issuer, chargeDate, total}], bankRows: [{id, issuer, date, amount}] (card kind only)
  function reconcile(statements, bankRows, manualLinks) {
    const links = new Map();
    const usedBank = new Set();
    for (const [sid, bid] of Object.entries(manualLinks || {})) { links.set(sid, bid); usedBank.add(bid); }
    for (const st of statements) {
      if (links.has(st.id) || !st.chargeDate) continue;
      const cand = bankRows.find(b => !usedBank.has(b.id) && b.issuer === st.issuer && Math.abs(b.amount - st.total) < 0.05 && daysBetween(st.chargeDate, b.date) >= -2 && daysBetween(st.chargeDate, b.date) <= 7);
      if (cand) { links.set(st.id, cand.id); usedBank.add(cand.id); }
    }
    return links;
  }

  const monthOf = d => d ? d.slice(0, 7) : null;
  const installment = notes => { const m = norm(notes).match(/תשלום ?(\d+) ?מתוך ?(\d+)/); return m ? { k: +m[1], n: +m[2] } : null; };

  return { EXPENSE_CATS, INCOME_CATS, ISSUERS, norm, parseAmount, parseDate, daysBetween, detectIssuer, categorize, parseCardWorkbook, parseBankPages, classifyBank, recurringIncome, reconcile, monthOf, installment };
})();
if (typeof window !== 'undefined') window.Ledger = Ledger;
if (typeof module !== 'undefined') module.exports = Ledger;
