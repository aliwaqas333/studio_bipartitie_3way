const canvas = document.getElementById('sk');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('sktip');
const {
  TOOLTIPS_ENABLED,
  BASE_W,
  bg,
  txtP,
  headerC,
  catColors,
  midCatColors,
  criteria,
  altTxtC,
  weights,
} = window.BIPARTITE_CONSTS;

const title = {
  text:"",
}

// Throttled scroll save
let scrollTimeout;
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    sessionStorage.setItem('scrollY', window.scrollY);
  }, 150);
});

// Restore — call this AFTER your visualization renders
function restoreScroll() {
  const saved = sessionStorage.getItem('scrollY');
  if (saved) window.scrollTo(0, parseInt(saved));
}

// Also restore when tab becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    restoreScroll();
  }
});



const columnHeader = {
  left: 'Methods',
  middle: 'Learning outcomes',
  right: 'Critiques'
};

// These start from consts but are overwritten at runtime from Excel
let midItems             = window.BIPARTITE_CONSTS.midItems.map(x => ({ ...x }));
let alternatives         = window.BIPARTITE_CONSTS.alternatives.map(x => ({ ...x }));
let midToAltLinks        = window.BIPARTITE_CONSTS.midToAltLinks;
let midToAltStrengths    = []; // parallel to midToAltLinks — strength per (mid, alt) pair
let midCategoryHeightPcts = { ...window.BIPARTITE_CONSTS.midCategoryHeightPcts };

// These are populated dynamically from the Excel file at runtime
let subToMidLinks = [];
let subToMidStrengths = [];

// ── Excel loader ──────────────────────────────────────────────────────────────
function pickExcelFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    };
    input.click();
  });
}

async function loadExcelData() {
  let buf;
  try {
    const resp = await fetch('./Required weights.xlsx?t=' + Date.now());
    buf = await resp.arrayBuffer();
  } catch (e) {
    // file:// blocked — ask user to pick the file
    buf = await pickExcelFile();
  }
  const wb   = XLSX.read(buf, { type: 'array' });
  const ws   = wb.Sheets['Relationship Matrix'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // first update title which is rows[0][0]
  if (rows[0] && rows[0][0]) title.text = rows[0][0].toString().trim();


  const wMap = { S: weights.S, M: weights.M, W: weights.W, N: 0 };
  // get cat names from D4, H4, L4, O4 without using find.
  // value at D4 cell fetch
  // idx_jump is based on number of items in category
  const idx_jump = [2,6,10,13];
  const catNameToId = {}; // mid cols
  ['res', 'des', 'tech', 'comm'].forEach((id, i) => {
    const val = (rows[1][idx_jump[i]] || '').toString().trim();
    if (val) catNameToId[val] = id;
  });

  const criterJumpIndex = [3, 6, 10, 14]; // based on number of items in each category
  const criteriacatNameToId = {};
  ['res', 'des', 'tech', 'comm'].forEach((id, i) => {
    const val = (rows[criterJumpIndex[i]][0] || '').toString().trim();
    if (val) criteriacatNameToId[val] = id;
  });

  const findkey = Object.keys(catNameToId).find(k => catNameToId[k] === 'res');

  // Dynamically find the category header row
  let catRowIdx = rows.findIndex(r => r.some(c => c.toString().trim() === findkey));
  if (catRowIdx === -1) catRowIdx = 3; // fallback
  const midLabelRowIdx = catRowIdx + 1;
  const SUB_ROW_START  = catRowIdx + 2;

  const catRow      = rows[catRowIdx] || [];
  const midLabelRow = rows[midLabelRowIdx] || [];
  const MID_COL_START = catRow.findIndex(c => c.toString().trim() === findkey);
  const MID_COUNT = midLabelRow.slice(MID_COL_START).filter(c => { const v = c.toString().replace(/\s+/g,'').toLowerCase(); return v !== '' && v !== '%' && v !== 'individual%'; }).length || 15;
  let currentCatId = 'res';

  midItems = Array.from({ length: MID_COUNT }, (_, i) => {
    const catCell = (catRow[MID_COL_START + i] || '').toString().trim();
    if (catCell && catNameToId[catCell]) currentCatId = catNameToId[catCell];
    const label = (midLabelRow[MID_COL_START + i] || '').toString().trim();
    const existing = window.BIPARTITE_CONSTS.midItems[i];
    return { id: existing ? existing.id : 'm_' + i, label, catId: currentCatId, w: existing ? existing.w : 25 };
  });

  // need to update midCatColors labels based on catNameToId keys
  Object.keys(midCatColors).forEach(catId => {
    const catName = Object.keys(catNameToId).find(k => catNameToId[k] === catId);
    if (catName) midCatColors[catId].label = catName;
  });

  // ── 2. Criteria pcts from "%" col in Relationship Matrix ─────────────────
  const pctColIdx = midLabelRow.findIndex(c => c.toString().trim() === '%');
  if (pctColIdx !== -1) {
    let ci = 0;
    criteria.forEach(c => {
      // The pct value is in the first sub row of each category group
      const firstSubRow = rows[SUB_ROW_START + criteria.slice(0, criteria.indexOf(c)).reduce((s, cr) => s + cr.subs.length, 0)] || [];
      const val = parseFloat(firstSubRow[pctColIdx]);
      if (!isNaN(val)) c.pct = val + '%';
    });
  }

  // update criter labels using the catnameToId keys
  criteria.forEach(c => {
    const catName = Object.keys(criteriacatNameToId).find(k => criteriacatNameToId[k] === c.id);
    if (catName) c.label = catName;
  });

  // ── 3. Sub-criteria labels + individual% + S/M/W/N values ───────────────
  // Find "individual %" column (col 19 in Relationship Matrix) — normalize spaces when matching
  let indPctColIdxLeft = -1;
  for (let ri = 0; ri < rows.length && indPctColIdxLeft === -1; ri++) {
    indPctColIdxLeft = (rows[ri] || []).findIndex(c => c.toString().replace(/\s+/g, '').toLowerCase() === 'individual%');
  }

  const allSubs = criteria.flatMap(c => c.subs);
  const newLinks = [], newStrengths = [];

  allSubs.forEach((sub, si) => {
    const row = rows[SUB_ROW_START + si] || [];
    const subLabel = (row[MID_COL_START - 1] || '').toString().trim();  // col just before first mid col
    if (subLabel) sub.label = subLabel;

    // Individual height % within its category
    if (indPctColIdxLeft !== -1) {
      const val = parseFloat(row[indPctColIdxLeft]);
      if (!isNaN(val)) sub.w = val;
    }

    const rowLinks = [], rowStrengths = [];
    for (let i = 0; i < MID_COUNT; i++) {
      const val = (row[MID_COL_START + i] || '').toString().trim().toUpperCase();
      if (val && val !== 'N') {
        rowLinks.push(i);
        rowStrengths.push(wMap[val] ?? weights.W);
      }
    }
    newLinks.push(rowLinks);
    newStrengths.push(rowStrengths);
  });

  subToMidLinks     = newLinks;
  subToMidStrengths = newStrengths;

  // ── 3. mid2right sheet → alternative labels + midToAltLinks ──────────────
  const ws2 = wb.Sheets['mid2right'];
  if (ws2) {
    const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
    // Dynamically find the first alt row (col A = '0')
    let ALT_ROW_START = rows2.findIndex(r => r[0] != null && r[0].toString().trim() === '0');
    if (ALT_ROW_START === -1) ALT_ROW_START = 3;
    const MID2_COL_START = 2; // col C (0-based)
    const ALT_COUNT      = alternatives.length;

    // Find pct column: scan header row for "%" or "R2"; fallback = last non-empty numeric col in alt rows
    const _hdrRow2 = rows2[ALT_ROW_START - 1] || [];
    let pctColIdx2 = _hdrRow2.findIndex(c => { const v = c.toString().trim(); return v === '%' || v === 'R2'; });
    if (pctColIdx2 === -1) {
      // Fallback: find the last column across alt rows that contains numeric values summing to ~100
      const altRows = Array.from({ length: ALT_COUNT }, (_, i) => rows2[ALT_ROW_START + i] || []);
      const maxCol = Math.max(...altRows.map(r => r.length));
      for (let col = maxCol - 1; col >= MID2_COL_START + MID_COUNT; col--) {
        const vals = altRows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
        if (vals.length === ALT_COUNT) { pctColIdx2 = col; break; }
      }
    }
    // Update alternative labels + pcts
    for (let ai = 0; ai < ALT_COUNT; ai++) {
      const row = rows2[ALT_ROW_START + ai] || [];
      const label = (row[1] || '').toString().trim();
      const pct   = pctColIdx2 !== -1 ? parseFloat(row[pctColIdx2]) : NaN;
      alternatives[ai] = {
        ...alternatives[ai],
        ...(label ? { label } : {}),
        ...(isNaN(pct) ? {} : { pct: pct + '%' })
      };
    }

    // configs
    const ws3 = wb.Sheets['configs'];
    const rows3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: '' });

    // first update title which is rows[0][0]
    if (rows3[0][1]) title.text = rows3[0][1].toString().trim();

    // colors for catColors
    Object.keys(catColors).forEach((id, i) => {
      let val = (rows3[2][i + 1] || '').toString().trim();
      if (val) catColors[id].base = `#${val}`;
    });

    // colors for midCatColors
    ['res', 'des', 'tech', 'comm'].forEach((id, i) => {
      let val = (rows3[3][i + 1] || '').toString().trim();
      if (val) midCatColors[id].base = `#${val}`;
    });

    // colors for alternatives
    Object.keys(alternatives).forEach((key, i) => {
      let val = (rows3[4][i + 1] || '').toString().trim();
      if (val) alternatives[key].color = `#${val}`;
    });

    // columnHeader values from configs sheet (row where col A = 'columnHeader')
    const colHdrRowIdx = 1;
    columnHeader.left = (rows3[colHdrRowIdx][1] || '').toString().trim();
    columnHeader.middle = (rows3[colHdrRowIdx][2] || '').toString().trim();
    columnHeader.right = (rows3[colHdrRowIdx][3] || '').toString().trim();

    // individual% for mid items — row where col B = 'individual%'
    const indPctRowIdx2 = rows2.findIndex(r => (r[1] || '').toString().replace(/\s+/g, '').toLowerCase() === 'individual%');
    if (indPctRowIdx2 !== -1) {
      const indRow = rows2[indPctRowIdx2];
      midItems.forEach((item, mi) => {
        const val = parseFloat(indRow[MID2_COL_START + mi]);
        if (!isNaN(val)) item.w = val;
      });
    }

    // midCategoryHeightPcts from "%" row (col B = '%')
    const pctRowIdx2 = rows2.findIndex(r => (r[1] || '').toString().trim() === '%');
    if (pctRowIdx2 !== -1) {
      const pctRow2 = rows2[pctRowIdx2];
      const catIds  = ['res', 'des', 'tech', 'comm'];
      // Find first mi of each category in the rebuilt midItems
      catIds.forEach(catId => {
        const firstMi = midItems.findIndex(m => m.catId === catId);
        if (firstMi !== -1) {
          const val = parseFloat(pctRow2[MID2_COL_START + firstMi]);
          if (!isNaN(val)) midCategoryHeightPcts[catId] = val / 100;
        }
      });
      // Normalize so they sum to 1
      const total = Object.values(midCategoryHeightPcts).reduce((s, v) => s + v, 0);
      if (total > 0) Object.keys(midCategoryHeightPcts).forEach(k => midCategoryHeightPcts[k] /= total);
    }

    // Build midIdx → [altIdx, …] and midIdx → [strength, …]
    const newMidToAlt = midItems.map(() => []);
    const newMidToAltStr = midItems.map(() => []);
    for (let ai = 0; ai < ALT_COUNT; ai++) {
      const row = rows2[ALT_ROW_START + ai] || [];
      for (let mi = 0; mi < MID_COUNT; mi++) {
        const val = (row[MID2_COL_START + mi] || '').toString().trim().toUpperCase();
        if (val && val !== 'N') {
          newMidToAlt[mi].push(ai);
          newMidToAltStr[mi].push(wMap[val] ?? weights.W);
        }
      }
    }
    midToAltLinks     = newMidToAlt;
    midToAltStrengths = newMidToAltStr;
  }
}

async function loadAndRender() {
  try {
    await loadExcelData();
  } catch (e) {
    console.warn('Excel load failed (likely file:// CORS). Using default data.', e);
  }
  render();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function wrapLabel(label, maxLen) {
  const words = label.trim().split(/\s+/);
  const lines = [];
  words.forEach((word) => {
    if (!lines.length) { lines.push(word); return; }
    const next = lines[lines.length - 1] + ' ' + word;
    if (next.length <= maxLen) { lines[lines.length - 1] = next; } else { lines.push(word); }
  });
  return lines;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

let layout = null;
let subNodes = [];   // left column
let midNodes = [];   // middle column
let altNodes = [];   // right column
let flows1 = [];     // sub → mid
let flows2 = [];     // mid → alt
let hoverTarget = { type: null, idx: null };

function getLayout() {
  const container = canvas.closest('.sk');
  const width  = container.clientWidth || BASE_W;
  const height = window.innerHeight; // fill full viewport height

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width  = width + 'px';
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const margin     = window.screen.width < 800 ? height * 0.082 : height * 0.082;                 // equal whitespace above title and below legend
  const titleFontH = height * 0.022;                 // cap-height offset (~70% of em) for baseline
  const titleY     = window.screen.width < 800 ? margin + titleFontH - height * 0.06 : margin + titleFontH - height * 0.029;       // adjust multiplier (1=highest, 2=lowest) to move title up/down
  const topPad     = window.screen.width < 800 ? height * 0.04 : height * 0.06;                 // figure starts here
  const headerY    = topPad - height * 0.01;        // column headers tight above figure
  const bottomPad  = window.screen.width < 800 ? height * 0.08 : height * 0.11;                  // space for single footer row
  const usableH   = height - topPad - bottomPad;

  const isMobile = width < 800;
  const defaultGap = window.BIPARTITE_CONSTS.layout.col2X - window.BIPARTITE_CONSTS.layout.col1X;
  const col1Start = isMobile ? 0.45 : window.BIPARTITE_CONSTS.layout.col1X;  // 20% panel + 1% gap
  const colsgap   = width < 500 ? 0.195 : (isMobile ? 0.2 : defaultGap);
  return {
    W: width, H: height, topPad, bottomPad, usableH,
    col1X: width * col1Start,                                  // sub-criteria  — labels LEFT
    col2X: width * (col1Start + colsgap),                      // middle items  — labels RIGHT
    col3X: width * (col1Start + 2 * colsgap),                  // alternatives  — labels RIGHT
    nodeW: clamp(width * 0.00875, 8, 10),
    labelPad: clamp(width * 0.003, 6, 12),

    // vertical gaps
    subGap: 1,    // gap between sub-criteria within a category (left column)
    subCatGap: 1, // gap between sub-criteria categories (left column)
    midGap: 1,    // gap between mid items within a category (middle column)
    midCatGap: 1, // gap between mid item categories (middle column)
    altGap: 1, // gap between alternatives (right column)
    fonts: {
      header: clamp(width * 0.014, 11, 14),
      legend: clamp(width * 0.012, 11, 14),
      sub:    clamp(width * 0.011,  9, 12),
      mid:    clamp(width * 0.010,  9, 12),
      alt:    clamp(width * 0.0115, 9, 12),
      pct:    clamp(width * 0.0095,  9, 12)
    },
    lineGap: clamp(height * 0.017, 6, 16),
    footerY: height - margin,           // visual bottom of legend sits at margin from bottom
    titleY,
    headerY,
  };
}

function buildGeometry() {
  const L = layout;

  // ── Sub-criteria nodes (left, col1X) ─────────────────────────────────────
  subNodes = [];
  let sy = L.topPad;
  
  const totalCatGaps = (criteria.length - 1) * L.subCatGap;
  const availableLeftH = L.usableH - totalCatGaps;

  // Compute left category height proportions from live criteria.pct values
  const totalCatPct = criteria.reduce((s, c) => s + parseFloat(c.pct), 0);
  const leftCategoryHeightPcts = Object.fromEntries(criteria.map(c => [c.id, parseFloat(c.pct) / totalCatPct]));

  let gsi = 0;
  criteria.forEach((c, ci) => {
    let blockH = availableLeftH * (leftCategoryHeightPcts[c.id] || 1 / criteria.length);
    
    const catSubGaps = (c.subs.length - 1) * L.subGap;
    const catNetH = Math.max(0, blockH - catSubGaps);
    const equalSubW = 100 / c.subs.length;
    const catTotalW = c.subs.reduce((s, sub) => s + (parseFloat(sub.w) || equalSubW), 0);
    const catScale = catNetH / Math.max(catTotalW, 1);

    c.subs.forEach((sub) => {
      const wNum = parseFloat(sub.w) || equalSubW;
      const h = Math.max(wNum * catScale, 2);
      subNodes.push({ ...sub, catId: c.id, y: sy, h, midY: sy + h / 2, catIdx: ci, globalIdx: gsi, wNum });
      sy += h + L.subGap;
      gsi++;
    });
    sy += L.subCatGap - L.subGap;
  });

  // ── Middle item incoming weights (proportional to sub flows reaching each item) ──
  // For each sub si connecting to N mids, it contributes (sn.h / N) to each connected mid.
  const midInW = new Array(midItems.length).fill(0);
  subNodes.forEach((sn, si) => {
    const mids = subToMidLinks[si];
    mids.forEach(mi => { midInW[mi] += sn.h / mids.length; });
  });

  // Group middle items by category to apply percentage-based heights
  const midCats = [];
  let currentCat = null;
  midItems.forEach((item, mi) => {
    if (!currentCat || currentCat.id !== item.catId) {
      if (currentCat) midCats.push(currentCat);
      currentCat = { id: item.catId, items: [], totalW: 0 };
    }
    currentCat.items.push({ ...item, mi });
    currentCat.totalW += midInW[mi];
  });
  if (currentCat) midCats.push(currentCat);

  const availableMidH = L.usableH - (midCats.length - 1) * L.midCatGap;
  const grandTotalMidW = midInW.reduce((s, w) => s + w, 0);

  midNodes = new Array(midItems.length);
  let my = L.topPad;

  midCats.forEach(cat => {
    let blockH = 0;
    if (midCategoryHeightPcts && midCategoryHeightPcts[cat.id]) {
      blockH = availableMidH * midCategoryHeightPcts[cat.id];
    } else {
      blockH = availableMidH * (cat.totalW / Math.max(grandTotalMidW, 1));
    }

    const catItemGaps = (cat.items.length - 1) * L.midGap;
    const catNetH = Math.max(0, blockH - catItemGaps);
    const catExplicitW = cat.items.reduce((s, it) => s + (it.w || 0), 0);
    const catScaleBase = catExplicitW > 0 ? catExplicitW : Math.max(cat.totalW, 1);
    const catScale = catNetH / catScaleBase;

    cat.items.forEach(item => {
      const wNum = item.w || midInW[item.mi];
      const h = Math.max(wNum * catScale, 2);
      midNodes[item.mi] = { ...item, y: my, h, midY: my + h / 2, globalIdx: item.mi };
      my += h + L.midGap;
    });
    my += L.midCatGap - L.midGap;
  });

  // ── Flows1: sub → mid ─────────────────────────────────────────────────────
  flows1 = [];
  const midInOff1 = new Array(midItems.length).fill(0);
  const subOutOff = new Array(subNodes.length).fill(0);

  subNodes.forEach((sn, si) => {
    const mids = subToMidLinks[si] || [];
    mids.forEach((mi, mii) => {
      const srcH = sn.h / mids.length;
      // dstH proportional: mid node height * this sub's share of total incoming to that mid
      const dstH = midInW[mi] > 0 ? midNodes[mi].h * (srcH / midInW[mi]) : 0;
      const strength = subToMidStrengths ? ((subToMidStrengths[si] || [])[mii] || 2) : 2;
      flows1.push({ srcY: sn.y + subOutOff[si], srcH, dstY: midNodes[mi].y + midInOff1[mi], dstH, catId: sn.catId, midCatId: midItems[mi].catId, subIdx: si, midIdx: mi, strength });
      subOutOff[si] += srcH;
      midInOff1[mi] += dstH;
    });
  });

  // ── Alternative incoming weights (from mid flows) ─────────────────────────
  const altInW = new Array(alternatives.length).fill(0);
  midNodes.forEach((mn, mi) => {
    const alts = midToAltLinks[mi] || [];
    alts.forEach(ai => { altInW[ai] += mn.h / alts.length; });
  });

  const totalAltPct = alternatives.reduce((s, a) => s + parseFloat(a.pct), 0);
  const altTotalGap = (alternatives.length - 1) * L.altGap;
  const altScale = (L.usableH - altTotalGap) / Math.max(totalAltPct, 1);

  altNodes = [];
  let ay = L.topPad;
  alternatives.forEach((a, i) => {
    const h = parseFloat(a.pct) * altScale;
    altNodes.push({ ...a, y: ay, h, midY: ay + h / 2 });
    ay += h + L.altGap;
  });

  // ── Flows2: mid → alt ─────────────────────────────────────────────────────
  flows2 = [];
  const altInOff2 = new Array(alternatives.length).fill(0);
  const midOutOff = new Array(midItems.length).fill(0);

  midNodes.forEach((mn, mi) => {
    const alts = midToAltLinks[mi] || [];
    const strs = midToAltStrengths[mi] || [];
    alts.forEach((ai, aii) => {
      const srcH = mn.h / alts.length;
      const dstH = altInW[ai] > 0 ? altNodes[ai].h * (srcH / altInW[ai]) : 0;
      const strength = strs[aii] ?? weights.W;
      flows2.push({ srcY: mn.y + midOutOff[mi], srcH, dstY: altNodes[ai].y + altInOff2[ai], dstH, catId: mn.catId, midIdx: mi, altIdx: ai, strength });
      midOutOff[mi] += srcH;
      altInOff2[ai] += dstH;
    });
  });
}

function resolveActiveSets() {
  const all = {
    subs:   new Set(subNodes.map((_, i) => i)),
    mids:   new Set(midNodes.map((_, i) => i)),
    alts:   new Set(altNodes.map((_, i) => i)),
    flows1: new Set(flows1.map((_, i) => i)),
    flows2: new Set(flows2.map((_, i) => i)),
    focused: false
  };
  if (!hoverTarget.type) return all;

  const active = { subs: new Set(), mids: new Set(), alts: new Set(), flows1: new Set(), flows2: new Set(), focused: true };

  if (hoverTarget.type === 'sub') {
    // Left hover: show flows1 only (left → mid), no cascade to right
    const si = hoverTarget.idx;
    active.subs.add(si);
    flows1.forEach((f, i) => {
      if (f.subIdx === si) { active.flows1.add(i); active.mids.add(f.midIdx); }
    });

  } else if (hoverTarget.type === 'mid') {
    // Mid hover: show both directions
    const mi = hoverTarget.idx;
    active.mids.add(mi);
    flows1.forEach((f, i) => { if (f.midIdx === mi) { active.flows1.add(i); active.subs.add(f.subIdx); } });
    flows2.forEach((f, i) => { if (f.midIdx === mi) { active.flows2.add(i); active.alts.add(f.altIdx); } });

  } else if (hoverTarget.type === 'alt') {
    // Right hover: show flows2 only (mid → right), no cascade to left
    const ai = hoverTarget.idx;
    active.alts.add(ai);
    flows2.forEach((f, i) => { if (f.altIdx === ai) { active.flows2.add(i); active.mids.add(f.midIdx); } });

  } else if (hoverTarget.type === 'cat') {
    const { catId, colType } = hoverTarget;
    if (colType === 'left') {
      // Left legend: flows1 only
      subNodes.forEach((sn, si) => { if (sn.catId === catId) active.subs.add(si); });
      flows1.forEach((f, i)     => { if (f.catId === catId)  { active.flows1.add(i); active.mids.add(f.midIdx); } });
    } else {
      // Mid legend: flows2 only
      midNodes.forEach((mn, mi) => { if (mn.catId === catId) active.mids.add(mi); });
      flows2.forEach((f, i)     => { if (f.catId === catId)  { active.flows2.add(i); active.alts.add(f.altIdx); } });
    }
  }

  return active;
}

// Gradient ribbon: transparent at left/right edges, solid at center.
// colorL = left node color, colorR = right node color.
// Gradient: transparent at left edge → colorL → blend to colorR → transparent at right edge.
function drawRibbon(x1, y1, h1, x2, y2, h2, colorL, colorR, alpha) {
  ctx.beginPath();
  const mx = (x1 + x2) / 2;
  ctx.moveTo(x1, y1);
  ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
  ctx.lineTo(x2, y2 + h2);
  ctx.bezierCurveTo(mx, y2 + h2, mx, y1 + h1, x1, y1 + h1);
  ctx.closePath();

  const [rL, gL, bL] = hexToRgb(colorL);
  const [rR, gR, bR] = hexToRgb(colorR);
  const rM = Math.round((rL + rR) / 2);
  const gM = Math.round((gL + gR) / 2);
  const bM = Math.round((bL + bR) / 2);

  const grad = ctx.createLinearGradient(x1, 0, x2, 0);
  grad.addColorStop(0,   'rgba(' + rL + ',' + gL + ',' + bL + ',' + alpha + ')');
  grad.addColorStop(0.5, 'rgba(' + rM + ',' + gM + ',' + bM + ',' + alpha + ')');
  grad.addColorStop(1,   'rgba(' + rR + ',' + gR + ',' + bR + ',' + alpha + ')');
  ctx.fillStyle = grad;
  ctx.fill();
}

// ── Left-side stats panel ────────────────────────────────────────────────
// Works for hover on any column:
//   • left sub   → flows1 (sub→mid), ranked among all subs
//   • middle mid → flows1 (sub→mid) + flows2 (mid→alt), ranked among all mids
//   • right alt  → flows2 (mid→alt), ranked among all alts
// Score per item: 3·S + 2·M + 1·W over its attached links.
// "No" = (max possible links on that node) − links of any strength.
// Default (nothing hovered): shows totals across the LEFT column.
function computeStatsData() {
  const S = weights.S, M = weights.M, W = weights.W;

  function bucket(strength, a) {
    if      (strength === S) a.sC++;
    else if (strength === M) a.mC++;
    else if (strength === W) a.wC++;
  }
  const scoreOf = a => 3 * a.sC + 2 * a.mC + 1 * a.wC;

  // Standard competition ranking (ties share a rank)
  function rankItems(items) {
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const byIdx = {};
    let lastScore = null, lastRank = 0;
    sorted.forEach((r, i) => {
      if (r.score !== lastScore) { lastRank = i + 1; lastScore = r.score; }
      byIdx[r.idx] = lastRank;
    });
    return byIdx;
  }

  // Per-sub (left column)
  const perSub = subNodes.map((sn, si) => {
    const a = { sC: 0, mC: 0, wC: 0 };
    flows1.forEach(f => { if (f.subIdx === si) bucket(f.strength, a); });
    const nC = Math.max(0, midNodes.length - (a.sC + a.mC + a.wC));
    return { idx: si, ...a, nC, score: scoreOf(a) };
  });
  const subRank = rankItems(perSub);

  // Per-mid (middle column) — combines inbound (from subs) and outbound (to alts)
  const perMid = midNodes.map((mn, mi) => {
    const a = { sC: 0, mC: 0, wC: 0 };
    flows1.forEach(f => { if (f.midIdx === mi) bucket(f.strength, a); });
    flows2.forEach(f => { if (f.midIdx === mi) bucket(f.strength ?? W, a); });
    const maxLinks = subNodes.length + altNodes.length;
    const nC = Math.max(0, maxLinks - (a.sC + a.mC + a.wC));
    return { idx: mi, ...a, nC, score: scoreOf(a) };
  });
  const midRank = rankItems(perMid);

  // Per-alt (right column)
  const perAlt = altNodes.map((an, ai) => {
    const a = { sC: 0, mC: 0, wC: 0 };
    flows2.forEach(f => { if (f.altIdx === ai) bucket(f.strength ?? W, a); });
    const nC = Math.max(0, midNodes.length - (a.sC + a.mC + a.wC));
    return { idx: ai, ...a, nC, score: scoreOf(a) };
  });
  const altRank = rankItems(perAlt);

  const sumB = arr => arr.reduce(
    (acc, r) => ({ sC: acc.sC + r.sC, mC: acc.mC + r.mC, wC: acc.wC + r.wC, nC: acc.nC + r.nC }),
    { sC: 0, mC: 0, wC: 0, nC: 0 }
  );

  // Pick the active column / record / rank based on hoverTarget
  let column = 'sub';
  let record = null;
  let rank   = null;
  let totalRanks = perSub.length;
  let nodes  = subNodes;

  let isCatHover = false;

  if (hoverTarget.type === 'sub' && perSub[hoverTarget.idx]) {
    column = 'sub'; record = perSub[hoverTarget.idx]; rank = subRank[record.idx];
    totalRanks = perSub.length; nodes = subNodes;
  } else if (hoverTarget.type === 'mid' && perMid[hoverTarget.idx]) {
    column = 'mid'; record = perMid[hoverTarget.idx]; rank = midRank[record.idx];
    totalRanks = perMid.length; nodes = midNodes;
  } else if (hoverTarget.type === 'alt' && perAlt[hoverTarget.idx]) {
    column = 'alt'; record = perAlt[hoverTarget.idx]; rank = altRank[record.idx];
    totalRanks = perAlt.length; nodes = altNodes;
  } else if (hoverTarget.type === 'cat') {
    isCatHover = true;
    const { catId, colType } = hoverTarget;
    if (colType === 'left') {
      column = 'sub'; nodes = subNodes;
      // Aggregate all subs in this category
      const matching = perSub.filter((_, si) => subNodes[si].catId === catId);
      record = matching.reduce((acc, r) => ({ idx: -1, sC: acc.sC + r.sC, mC: acc.mC + r.mC, wC: acc.wC + r.wC, score: acc.score + r.score }), { idx: -1, sC: 0, mC: 0, wC: 0, score: 0 });
      totalRanks = perSub.length;
    } else {
      column = 'mid'; nodes = midNodes;
      // Aggregate all mids in this category
      const matching = perMid.filter((_, mi) => midNodes[mi].catId === catId);
      record = matching.reduce((acc, r) => ({ idx: -1, sC: acc.sC + r.sC, mC: acc.mC + r.mC, wC: acc.wC + r.wC, score: acc.score + r.score }), { idx: -1, sC: 0, mC: 0, wC: 0, score: 0 });
      totalRanks = perMid.length;
    }
    rank = null; // no single rank for a category
  }

  // Category % = hovered node's height / total column height
  let categoryPct = 100;
  if (record && !isCatHover) {
    const node = nodes[record.idx];
    const totalH = nodes.reduce((s, n) => s + n.h, 0);
    categoryPct = totalH > 0 ? (node.h / totalH) * 100 : 0;
  } else if (isCatHover) {
    const catId = hoverTarget.catId;
    const colType = hoverTarget.colType;
    const catNodes = colType === 'left'
      ? subNodes.filter(sn => sn.catId === catId)
      : midNodes.filter(mn => mn.catId === catId);
    const totalH = nodes.reduce((s, n) => s + n.h, 0);
    const catH = catNodes.reduce((s, n) => s + n.h, 0);
    categoryPct = totalH > 0 ? (catH / totalH) * 100 : 0;
  }

  // Totals for the active column (denominators for radial charts)
  const totals = record
    ? (column === 'mid' ? sumB(perMid) : column === 'alt' ? sumB(perAlt) : sumB(perSub))
    : null;

  // Grand totals across all connections (shown when not hovering)
  const allSub = sumB(perSub);
  const allAlt = sumB(perAlt);
  const grandTotal = {
    sC: allSub.sC + allAlt.sC,
    mC: allSub.mC + allAlt.mC,
    wC: allSub.wC + allAlt.wC,
  };

  // Connections: Strong (S) and Moderate (M+W) only — no "No" bucket
  const conn = record
    ? { strong: record.sC, moderate: record.mC + record.wC }
    : { strong: grandTotal.sC, moderate: grandTotal.mC + grandTotal.wC };
  const connTotals = totals
    ? { strong: totals.sC, moderate: totals.mC + totals.wC }
    : { strong: grandTotal.sC, moderate: grandTotal.mC + grandTotal.wC };

  // "of Methods / Learning outcomes / Critiques"
  const colLabel = column === 'mid' ? columnHeader.middle
                 : column === 'alt' ? columnHeader.right
                 : columnHeader.left;

  // Color of the hovered item
  let hoveredColor = '#8B7BB5'; // default
  if (isCatHover) {
    const catId = hoverTarget.catId;
    if (hoverTarget.colType === 'left') hoveredColor = catColors[catId]?.base || hoveredColor;
    else                                 hoveredColor = midCatColors[catId]?.base || hoveredColor;
  } else if (record) {
    if (column === 'sub')      hoveredColor = catColors[subNodes[record.idx].catId]?.base || hoveredColor;
    else if (column === 'mid') hoveredColor = midCatColors[midNodes[record.idx].catId]?.base || hoveredColor;
    else if (column === 'alt') hoveredColor = alternatives[record.idx]?.color || hoveredColor;
  }

  return { hovered: record, categoryPct, rank, totalRanks, conn, connTotals, colLabel, hoveredColor };
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function drawStatsPanel(L, fontFamily, outlineText) {
  const cfg = window.BIPARTITE_CONSTS.layout;
  const px = L.W * (L.W < 800 ? 0.025 : (cfg.statsPanelX ?? 0.04));
  const pw = L.W * (L.W < 800 ? 0.26 : (cfg.statsPanelW ?? 0.26));
  const data = computeStatsData();

  // ── Equal visual gaps: measure each section's content height, derive sectionGap ──
  const totalH     = L.footerY - L.headerY - L.titleY; // total height between header and footer, minus gap above footer
  const _titleFsz  = clamp(L.W * 0.03, 20, 50);
  const titleH     = L.W < 800 ? _titleFsz * 1.4 : _titleFsz * 0.75; // 2 lines on mobile
  const _bigF      = clamp(L.W * 0.055, 32, 62);
  const catH       = clamp(L.W * 0.052, 48, 80) + _bigF * 0.78;
  const impH       = clamp(L.W * 0.052, 48, 72) + _bigF * 0.6;
  const _cRad      = L.W < 800 ? Math.max((pw * 0.66 - 24) / 2.396, 14) : Math.max((pw * 0.92 - 48) / 4.88, 14);
  const _cLW       = clamp(_cRad * 0.198, 2.7, 9);
  const _oneChartH = clamp(L.W * 0.016, 12, 24) + _cLW + 2 * _cRad + _cLW + clamp(_cRad * 0.35, 8, 16) + 8;
  const connH      = L.W < 800 ? _oneChartH * 2 : _oneChartH;
  const descH      = L.W < 800 ? clamp(L.W * 0.032, 150, 220) : clamp(L.W * 0.022, 12, 28) + clamp(L.W * 0.011, 9, 11) * 1.3;
  const rawGap     = (totalH - titleH - catH - impH - connH - descH) / 5;
  const sectionGap = Math.max(L.W < 800 ? Math.min(rawGap, 42) : rawGap, 8);
  const fullGap    = connH + sectionGap;           // kept for connections chart sizing

  const slot1Y = L.titleY + titleH + sectionGap; // CATEGORY  — starts below title cap-height
  let slot2Y = slot1Y + catH  + sectionGap;     // IMPACT RANK
  let slot3Y = slot2Y + impH + sectionGap;     // CONNECTIONS
  let slot4Y = slot3Y + connH + sectionGap;     // DESCRIPTION

  if (L.W < 555) {
    slot4Y += 25;
    slot2Y += 25;
  }
  


  // Clip entire stats panel so no text bleeds into the figure area
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, px + pw + 2, L.H); ctx.clip();

  // Fonts
  const labelFont = '300 ' + clamp(L.W * 0.0105, 11, 14) + 'px ' + fontFamily;
  const bigFont   = '300 ' + clamp(L.W * 0.055, 32, 62) + 'px ' + fontFamily;
  const subFont   = '300 ' + clamp(L.W * 0.011, 9, 11) + 'px ' + fontFamily;

  ctx.fillStyle = '#000000';
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // ── Section 1: CATEGORY ──────────────────────────────────────────────────
  {
    const sy = slot1Y + clamp(titleH * 0., 12, 100); // small gap above label
    ctx.font = labelFont;
    const labelLineH = clamp(L.W * 0.0105, 11, 14) * 1.3;
    if (L.W < 558) {
      outlineText('CATEGORY', px, sy+labelLineH*0.8);
      outlineText('REPRESENTATION', px, sy + labelLineH*1.8);
    } else {
      outlineText('CATEGORY REPRESENTATION', px, sy);
    }

    const bigY = sy + (L.W < 558 ? labelLineH * 2 : 0) + clamp(L.W * 0.052, 30, 60); // gap after label to big text
    ctx.font = bigFont;
    const pctText = Math.round(data.categoryPct) + '%';
    outlineText(pctText, px, bigY);

    if (data.hovered) {
      const bigW = ctx.measureText(pctText).width;
      ctx.font = subFont;
      outlineText(' of ' + (data.colLabel || ''), px + bigW + 4, bigY);
    }
  }

  // ── Section 2: IMPACT RANK ───────────────────────────────────────────────
  {
    const sy = slot2Y; // small gap above label
    ctx.font = labelFont;
    outlineText('IMPACT RANK', px, sy);

    const bigY = sy + clamp(L.W * 0.052, 30, 60); // gap after label to big text
    if (data.rank == null) {
      ctx.font = '300 ' + clamp(L.W * 0.030, 22, 40) + 'px ' + fontFamily;
      outlineText('—', px, bigY);
    } else {
      ctx.font = bigFont;
      const numText = String(data.rank);
      outlineText(numText, px, bigY);
      const numW = ctx.measureText(numText).width;
      ctx.font = subFont;
      outlineText(ordinalSuffix(data.rank), px + numW + 2, bigY - clamp(L.W * 0.018, 14, 28));
    }
  }

  // ── Section 3: CONNECTIONS — two gauge-style radial charts ──────────────
  {
    const sy = slot3Y; // small gap above label
    ctx.font = labelFont;
    outlineText('CONNECTIONS', px, sy);

    // Size charts to span full panel width
    const labelGap = clamp(L.W * 0.016, 12, 24);
    const chartLabelH = 12;
    const slotPad = fullGap * 0.15;
    const maxRv  = Math.max((fullGap - labelGap - chartLabelH - slotPad) / 2.4, 14);
    // Fill panel: px + tickW + lineW + R ... R + lineW + tickW = px + pw
    // Two charts: each takes 2R + 2lineW + 2tickW, with a gap between
    const tickW   = 12;
    const chartGapFrac = 0.08;
    // pw = 2*(tickW + lineW + R) + gap + 2*(tickW + lineW + R)  →  simplified:
    // pw = 4R + 4lineW + 4tickW + gap;  lineW ≈ 0.22R, gap = chartGapFrac*pw
    // pw*(1-chartGapFrac) = 4R*(1+0.22) + 4*tickW  →  R = (pw*(1-gf) - 4*tickW) / 4.88
    // On mobile charts stack vertically — each gets full panel width: pw = 2*(tickW + lineW + R) → R = (pw - 2*tickW) / 2.396
    const maxRw   = L.W < 800 // maxRW means "radius when charts are wide (desktop)" vs "radius when charts are narrow (mobile)" 
      ? Math.max((pw * 0.72 - 2 * tickW) / 2.396, 14)
      : Math.max((pw * (1 - chartGapFrac) - 4 * tickW) / 4.88, 14);
    const radius  = Math.min(maxRv, maxRw);
    const lineW   = clamp(radius * 0.198, 2.7, 9);
    const chartGap = pw * chartGapFrac;
    // Center chart 1 at quarter, chart 2 at three-quarter of panel
    const cy1base  = sy + labelGap + lineW + radius;
    const chartH   = 2 * (radius + lineW) + clamp(radius * 0.35, 8, 16) + 10;
    const cx1 = L.W < 800 ? px + pw / 2 : px + tickW + lineW + radius;
    const cx2 = L.W < 800 ? px + pw / 2 : px + pw - tickW - lineW - radius;
    const cy1 = cy1base;
    const cy2 = L.W < 800 ? cy1base + chartH + 12 : cy1base;
    const trackClr = '#E8E8E8';

    // Gauge arc: 270° sweep starting at 0 (top), gap on upper-left
    const gapAngle   = Math.PI * 0.5;           // 90° gap
    const sweepAngle = Math.PI * 2 - gapAngle;  // 270° sweep
    const arcStart   = -Math.PI / 2;            // 0 at top (12 o'clock)
    const arcEnd     = arcStart + sweepAngle;    // ends at 9 o'clock

    // Hovered: colored fill on light grey track; Not hovered: light grey fill + dark grey outline
    const isHovered = !!data.hovered;
    const hovClr = data.hoveredColor || '#8B7BB5';

    const charts = [
      { label: 'Strong',   val: data.conn.strong,   total: data.connTotals.strong,   hovFill: hovClr,        border: '#AAAAAA', cx: cx1, cy: cy1 },
      { label: 'Moderate', val: data.conn.moderate,  total: data.connTotals.moderate, hovFill: hovClr + '88', border: '#CCCCCC', cx: cx2, cy: cy2 },
    ];

    const numFont  = '300 ' + clamp(radius * 0.55, 12, 28) + 'px ' + fontFamily;
    const chartLbl = '300 ' + clamp(radius * 0.32, 9, 12) + 'px ' + fontFamily;
    const tickFont = '300 ' + clamp(radius * 0.28, 9, 11) + 'px ' + fontFamily;

    charts.forEach(ch => {
      const frac = ch.total > 0 ? ch.val / ch.total : 0;
      // Value fills clockwise from the top (-π/2)
      const valStart = -Math.PI / 2;
      const valEnd   = valStart + frac * sweepAngle;

      if (isHovered) {
        // Hovered: light grey track + colored fill
        ctx.beginPath();
        ctx.arc(ch.cx, ch.cy, radius, arcStart, arcEnd);
        ctx.strokeStyle = trackClr;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 1;
        ctx.stroke();

        if (frac > 0) {
          ctx.beginPath();
          ctx.arc(ch.cx, ch.cy, radius, valStart, valEnd);
          ctx.strokeStyle = ch.hovFill;
          ctx.lineWidth = lineW;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      } else {
        // Not hovered: simple light grey fill, no outline
        ctx.beginPath();
        ctx.arc(ch.cx, ch.cy, radius, arcStart, arcEnd);
        ctx.strokeStyle = trackClr;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 1;
        ctx.stroke();
      }

      // Tick marks: 0 at top (start), mid at bottom, max at left (end)
      ctx.font = tickFont;
      ctx.fillStyle = '#000000';
      const ticks = [
        { val: 0,                          angle: arcStart },
        { val: Math.round(ch.total / 2),   angle: arcStart + sweepAngle / 2 },
        { val: ch.total,                   angle: arcEnd },
      ];
      const tickR = radius + lineW + clamp(radius * 0.18, 4, 10);
      ticks.forEach(t => {
        const tx = ch.cx + Math.cos(t.angle) * tickR;
        const ty = ch.cy + Math.sin(t.angle) * tickR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(t.val), tx, ty);
      });

      // Value in center
      ctx.font = numFont;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ch.val), ch.cx, ch.cy);

      // Label above left (like "C1" in mockup → use chart label)
      ctx.font = chartLbl;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(ch.label, ch.cx, ch.cy + radius + lineW + clamp(radius * 0.35, 8, 16));
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000000';
  }

  // ── Section 4: DESCRIPTION ───────────────────────────────────────────────
  {
    const descY = slot4Y;
    const descFontSize = L.fonts.header;
    const descFont = '300 ' + descFontSize + 'px ' + fontFamily;
    // estimate desc text height
    ctx.font = descFont;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const descText = 'This visualization maps the relationships between assessment criteria, process, and learning modes in the design studio to support self-reflection and create opportunities for teaching innovation in content design and delivery.';
    const maxDescW = pw;
    const dWords = descText.split(' ');
    const dLines = [];
    let dCur = '';
    dWords.forEach(w => {
      const test = dCur ? dCur + ' ' + w : w;
      if (ctx.measureText(test).width > maxDescW) { dLines.push(dCur); dCur = w; }
      else dCur = test;
    });
    if (dCur) dLines.push(dCur);

    const dlh = descFontSize * 1.28;
    const maxDescBottom = L.footerY - sectionGap;    // leave equal gap above footer
    dLines.forEach((line, i) => {
      if (descY + i * dlh <= maxDescBottom) ctx.fillText(line, px, descY + i * dlh);
    });
    ctx.fillStyle = '#000000';
  }

  ctx.restore();  // end stats panel clip

  window._statsPanelX = px;
  window._statsPanelW = pw;
}

function draw() {
  const L = layout;
  const fontFamily = "'Open Sans', system-ui, sans-serif";
  const active = resolveActiveSets();

  // Helper: draw text with white outline then black fill
  function outlineText(text, x, y) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  ctx.clearRect(0, 0, L.W, L.H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, L.W, L.H);

  // ── Title — left panel margin, above CATEGORY ─────────────────────────────
  const spxTitle = L.W * (L.W < 800 ? 0.025 : (window.BIPARTITE_CONSTS.layout.statsPanelX ?? 0.04));
  const titleFontSz = L.W > 558 ? clamp(L.W * 0.03, 28, 62) : clamp(L.W * 0.05, 18, 40);
  ctx.font = '300 ' + titleFontSz + 'px ' + fontFamily;
  ctx.fillStyle = '#000000'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  if (L.W < 800 && title.text && title.text.includes(' ')) {
    // Split into 2 lines at the word boundary closest to visual midpoint
    const words = title.text.split(' ');
    let best = Infinity, splitIdx = 1;
    for (let i = 1; i < words.length; i++) {
      const diff = Math.abs(ctx.measureText(words.slice(0, i).join(' ')).width -
                            ctx.measureText(words.slice(i).join(' ')).width);
      if (diff < best) { best = diff; splitIdx = i; }
    }
    outlineText(words.slice(0, splitIdx).join(' '), spxTitle, L.titleY);
    outlineText(words.slice(splitIdx).join(' '),    spxTitle, L.titleY + titleFontSz * 1.2);
  } else {
    outlineText(title.text, spxTitle, L.titleY);
  }

  // ── Stats panel (left whitespace) ─────────────────────────────────────────
  drawStatsPanel(L, fontFamily, outlineText);

  // ── Column headers ────────────────────────────────────────────────────────
  ctx.font = '300 ' + L.fonts.header + 'px ' + fontFamily;
  ctx.fillStyle = '#000000'; ctx.textBaseline = 'alphabetic';
  const hOff = 8; // nudge headers slightly right to visually center over content
  ctx.textAlign = 'center'; outlineText(columnHeader.left, L.col1X + hOff, L.headerY);
  ctx.textAlign = 'center'; outlineText(columnHeader.middle, L.col2X + hOff, L.headerY);
  ctx.textAlign = 'center'; outlineText(columnHeader.right, L.col3X + hOff, L.headerY);

  // ── Flows1: sub → mid (alpha scales proportionally with weights: W=1, M=3, S=5) ─
  const maxW = weights ? weights.S : 5;
  flows1.forEach((f, i) => {
    const cc = catColors[f.catId];
    const show = active.flows1.has(i);
    const t = f.strength / maxW; // 0.2 (W) → 0.6 (M) → 1.0 (S)
    const activeAlpha = 0.15 + t * 0.60;         // W≈0.27  M≈0.51  S≈0.75
    const baseAlpha   = 0.06 + t * 0.34;         // faded default: W≈0.13  M≈0.23  S≈0.40
    const alpha = active.focused ? (show ? activeAlpha : 0.08) : baseAlpha;
    drawRibbon(L.col1X + L.nodeW, f.srcY, f.srcH, L.col2X, f.dstY, f.dstH, cc.base, midCatColors[f.midCatId].base, alpha);
  });

  // ── Flows2: mid → alt ─────────────────────────────────────────────────────
  flows2.forEach((f, i) => {
    const cc = midCatColors[f.catId];
    const show = active.flows2.has(i);
    const t = (f.strength ?? weights.W) / (weights.S ?? 5);
    const activeAlpha = 0.15 + t * 0.60;
    const baseAlpha   = 0.06 + t * 0.34;
    const alpha = active.focused ? (show ? activeAlpha : 0.10) : baseAlpha;
    drawRibbon(L.col2X + L.nodeW, f.srcY, f.srcH, L.col3X, f.dstY, f.dstH, cc.base, alternatives[f.altIdx].color, alpha);
  });

  // ── Sub-criteria nodes (left, labels on LEFT) ─────────────────────────────
  subNodes.forEach((sn, si) => {
    const cc = catColors[sn.catId];
    const show = active.subs.has(si);
    const alpha = active.focused ? (show ? 0.9 : 0.25) : 0.9;

    ctx.fillStyle = cc.base; ctx.globalAlpha = alpha;
    ctx.fillRect(L.col1X, sn.y, L.nodeW, sn.h);
    ctx.globalAlpha = 1;

    if (show || !active.focused) {
      ctx.font = '300 ' + L.fonts.sub + 'px ' + fontFamily;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const lines = wrapLabel(sn.label, L.W < 800 ? 13 : 30);
      // On mobile, clip labels so they don't bleed over the stats panel
      if (L.W < 800 && window._statsPanelW) {
        const clipX = (window._statsPanelX || 0) + window._statsPanelW + 4;
        ctx.save();
        ctx.beginPath(); ctx.rect(clipX, 0, L.W - clipX, L.H); ctx.clip();
      }
      lines.forEach((l, li) => {
        outlineText(l, L.col1X - L.labelPad, sn.midY + (li - (lines.length - 1) / 2) * L.lineGap);
      });
      if (L.W < 800 && window._statsPanelW) ctx.restore();
    }
  });

  // ── Middle items (labels on RIGHT, short) — use original bright palette ──────
  midNodes.forEach((mn, mi) => {
    const cc = midCatColors[mn.catId];
    const show = active.mids.has(mi);
    const alpha = active.focused ? (show ? 0.9 : 0.25) : 0.9;

    ctx.fillStyle = cc.base; ctx.globalAlpha = alpha;
    ctx.fillRect(L.col2X, mn.y, L.nodeW, mn.h);
    ctx.globalAlpha = 1;

    if (show || !active.focused) {
      ctx.font = '300 ' + L.fonts.mid + 'px ' + fontFamily;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (L.W < 555) {
        const lines = wrapLabel(mn.label, 15);
        lines.forEach((l, li) => {
          outlineText(l, L.col2X + L.nodeW + L.labelPad, mn.midY + (li - (lines.length - 1) / 2) * L.lineGap);
        });
      } else {
        outlineText(mn.label, L.col2X + L.nodeW + L.labelPad, mn.midY);
      }
    }
  });

  // ── Alternative nodes (labels on RIGHT, light-black) ──────────────────────
  altNodes.forEach((an, ai) => {
    const show = active.alts.has(ai);
    const alpha = active.focused ? (show ? 0.9 : 0.25) : 0.9;

    ctx.fillStyle = an.color; ctx.globalAlpha = alpha;
    ctx.fillRect(L.col3X, an.y, L.nodeW, an.h);
    ctx.globalAlpha = 1;

    if (show || !active.focused) {
      ctx.font = '300 ' + L.fonts.alt + 'px ' + fontFamily;
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (L.W < 500) {
        const lines = wrapLabel(an.label, 13);
        lines.forEach((l, li) => {
          outlineText(l, L.col3X + L.nodeW + L.labelPad, an.midY + (li - (lines.length - 1) / 2) * L.lineGap);
        });
      } else {
        outlineText(an.label, L.col3X + L.nodeW + L.labelPad, an.midY);
      }
    }
  });

  // ── Footer: legend (centered on figure), credit + buttons (left panel) ───
  const fSize = clamp(L.W * 0.011, 9, 12);
  ctx.font = '300 ' + fSize + 'px ' + fontFamily;
  ctx.textBaseline = 'middle'; ctx.globalAlpha = 1;

  const swatchW = clamp(L.W * 0.009, 7, 10);
  const rowGap  = clamp(L.W * 0.016, 12, 20);
  const figMidX = L.W < 800 ? L.W / 2 : (L.col1X + L.col3X) / 2;
  const midCatOrder = ['res', 'des', 'tech', 'comm'];

  // ── Legend centered on figure columns ──
  const allLegendItems = [
    ...criteria.map(c     => ({ color: catColors[c.id].base,  label: c.label,                tw: ctx.measureText(c.label).width,                catId: c.id, colType: 'left' })),
    ...midCatOrder.map(id => ({ color: midCatColors[id].base, label: midCatColors[id].label, tw: ctx.measureText(midCatColors[id].label).width, catId: id,   colType: 'mid'  }))
  ];

  window._legendHitBoxes = [];

  if (L.W < 555) {
    // 2-row legend, left-justified at col1X, justified spacing, stuck to bottom
    const rowH = fSize * 1.4;
    const half = Math.ceil(allLegendItems.length / 2);
    const rows = [allLegendItems.slice(0, half), allLegendItems.slice(half)];
    const panelRight = L.W * 0.15 + L.W * 0.25;  // after left stat column
    const legendStartX = panelRight;
    const availW = L.W - legendStartX - 4;  // extend to right edge
    const row1Y = L.footerY *1.03;
    const row2Y = row1Y + rowH;

    rows.forEach((rowItems, ri) => {
      const contentW = rowItems.reduce((s, it) => s + swatchW + 5 + it.tw, 0);
      const gap = rowItems.length > 1 ? (availW - contentW) / (rowItems.length - 1) : 0;
      let rx = legendStartX;
      const ry = ri === 0 ? row1Y : row2Y;

      rowItems.forEach(({ color, label, tw, catId, colType }) => {
        const itemW = swatchW + 5 + tw;
        window._legendHitBoxes.push({ x: rx, y: ry - swatchW, w: itemW, h: swatchW * 2, catId, colType });
        const isHovered = hoverTarget.type === 'cat' && hoverTarget.catId === catId && hoverTarget.colType === colType;
        ctx.fillStyle = color; ctx.globalAlpha = isHovered ? 1.0 : 0.9;
        const r = swatchW * 0.35;
        ctx.beginPath(); ctx.roundRect(rx, ry - swatchW / 2, swatchW, swatchW, r); ctx.fill();
        ctx.globalAlpha = isHovered ? 1.0 : 1;
        ctx.fillStyle = color; ctx.textAlign = 'left';
        outlineText(label, rx + swatchW + 5, ry);
        rx += swatchW + 5 + tw + gap;
      });
    });
  } else {
    const legendW = allLegendItems.reduce((s, it) => s + swatchW + 5 + it.tw, 0) + rowGap * (allLegendItems.length - 1);
    let rx = figMidX - legendW / 2;

    allLegendItems.forEach(({ color, label, tw, catId, colType }) => {
      const itemW = swatchW + 5 + tw;
      window._legendHitBoxes.push({ x: rx, y: L.footerY - swatchW, w: itemW, h: swatchW * 2, catId, colType });
      const isHovered = hoverTarget.type === 'cat' && hoverTarget.catId === catId && hoverTarget.colType === colType;
      ctx.fillStyle = color; ctx.globalAlpha = isHovered ? 1.0 : 0.9;
      const r = swatchW * 0.35;
      ctx.beginPath(); ctx.roundRect(rx, L.footerY - swatchW / 2, swatchW, swatchW, r); ctx.fill();
      ctx.globalAlpha = isHovered ? 1.0 : 1;
      ctx.fillStyle = color; ctx.textAlign = 'left';
      outlineText(label, rx + swatchW + 5, L.footerY);
      rx += swatchW + 5 + tw + rowGap;
    });
  }

  // ── Credit text + buttons in left panel, aligned with legend row ──
  const spx = window._statsPanelX || L.W * 0.04;
  const creditY = L.W < 800 ? L.footerY + fSize * 4 : L.footerY;
  const creditText = '© Mohamad T. Araji';
  ctx.fillStyle = '#000000'; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  ctx.font = '300 ' + fSize + 'px ' + fontFamily;
  ctx.textBaseline = 'middle';
  outlineText(creditText, spx, creditY);

  // Store buttons position — on mobile: above credit; on desktop: right of credit
  const creditW = ctx.measureText(creditText).width;
  window._footerBtnsX = L.W < 800 ? spx - 5 : spx + creditW + 20;
  window._footerBtnsY = L.W < 800 ? creditY - fSize - 10 : creditY;
}

function hitTest(mx, my) {
  const L = layout;
  const pad = 60;  // px tolerance around each node bar
  const hits = [];

  // Left column: within pad of node bar (bar is at col1X, width nodeW; labels extend left)
  if (mx >= L.col1X - pad && mx <= L.col1X + L.nodeW + pad) {
    subNodes.forEach((sn, si) => {
      if (my >= sn.y - 1.5 && my <= sn.y + sn.h + 1.5)
        hits.push({ type: 'sub', idx: si, midY: sn.midY });
    });
  }

  // Middle column: within pad of node bar
  if (mx >= L.col2X - pad && mx <= L.col2X + L.nodeW + pad) {
    midNodes.forEach((mn, mi) => {
      if (my >= mn.y - 1.5 && my <= mn.y + mn.h + 1.5)
        hits.push({ type: 'mid', idx: mi, midY: mn.midY });
    });
  }

  // Right column: within pad of node bar
  if (mx >= L.col3X - pad && mx <= L.col3X + L.nodeW + pad) {
    altNodes.forEach((an, ai) => {
      if (my >= an.y && my <= an.y + an.h)
        hits.push({ type: 'alt', idx: ai, midY: an.midY });
    });
  }

  // Legend hit boxes (footer)
  if (window._legendHitBoxes) {
    for (const box of window._legendHitBoxes) {
      if (mx >= box.x && mx <= box.x + box.w && my >= box.y && my <= box.y + box.h)
        return { type: 'cat', catId: box.catId, colType: box.colType };
    }
  }

  if (!hits.length) return null;
  hits.sort((a, b) => Math.abs(a.midY - my) - Math.abs(b.midY - my));
  return { type: hits[0].type, idx: hits[0].idx };
}

function updateTooltip(hit, evt) {
  if (!TOOLTIPS_ENABLED) { tip.style.opacity = 0; return; }
  if (!hit) { tip.style.opacity = 0; return; }
  tip.style.opacity = 1;

  if (hit.type === 'sub') {
    const sn = subNodes[hit.idx];
    const parent = criteria.find(c => c.id === sn.catId);
    const midsConnected = subToMidLinks[hit.idx].map(mi => midItems[mi].label).join(', ');
    tip.innerHTML = '<strong>' + sn.label + '</strong><br>'
      + '<span style="color:' + catColors[sn.catId].base + '">' + parent.label + '</span><br>'
      + 'Connects to: ' + midsConnected;

  } else if (hit.type === 'mid') {
    const mn = midNodes[hit.idx];
    const mi = hit.idx;
    const parent = criteria.find(c => c.id === mn.catId);
    const altsConnected = (midToAltLinks[mi] || []).map(ai => alternatives[ai].label).join(', ');
    tip.innerHTML = '<strong>' + mn.label + '</strong>'
      + ' <span style="color:' + catColors[mn.catId].base + '">(' + parent.label + ')</span><br>'
      + 'Connects to: ' + altsConnected;

  } else {
    const an = altNodes[hit.idx];
    const incoming = flows2.filter(f => f.altIdx === hit.idx).length;
    tip.innerHTML = '<strong>' + an.label + '</strong> ' + an.pct
      + '<br>Receives flow from ' + incoming + ' middle items';
  }

  const box = canvas.closest('.sk').getBoundingClientRect();
  tip.style.left = (evt.clientX - box.left + 14) + 'px';
  tip.style.top  = (evt.clientY - box.top  -  8) + 'px';
}

function positionButtons() {
  const btns = document.querySelector('.sk-btns');
  if (!btns || !layout) return;
  const isMobile = layout.W < 800;
  const scale = isMobile ? 0.6 : 1;
  btns.style.transform = isMobile ? 'scale(0.6)' : 'none';
  btns.style.transformOrigin = 'left center';
  const btnH      = (btns.offsetHeight || 28) * scale;
  const canvasTop = canvas.offsetTop;
  const bx = window._footerBtnsX != null ? window._footerBtnsX : layout.col3X;
  const by = window._footerBtnsY != null ? window._footerBtnsY : layout.footerY;
  btns.style.left   = (canvas.offsetLeft + bx) + 'px';
  btns.style.right  = 'auto';
  btns.style.bottom = 'auto';
  btns.style.top    = (canvasTop + by - btnH / 2) + 'px';
}

function render() { layout = getLayout(); buildGeometry(); draw(); positionButtons(); }

function toggleFullscreen() {
  const btn = document.getElementById('btn-fullscreen');
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/></svg>';
  } else {
    document.exitFullscreen();
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  }
}

function ribbonPathData(x1, y1, h1, x2, y2, h2) {
  const mx = (x1 + x2) / 2;
  return 'M ' + x1 + ' ' + y1
    + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2
    + ' L ' + x2 + ' ' + (y2 + h2)
    + ' C ' + mx + ' ' + (y2 + h2) + ', ' + mx + ' ' + (y1 + h1) + ', ' + x1 + ' ' + (y1 + h1) + ' Z';
}

function escapeXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function buildSvgMarkup() {
  const L = layout;
  const swatchW = clamp(L.W * 0.01, 8, 10);
  const parts = [];

  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + L.W + '" height="' + L.H + '" viewBox="0 0 ' + L.W + ' ' + L.H + '">');
  parts.push('<rect x="0" y="0" width="' + L.W + '" height="' + L.H + '" fill="#ffffff"/>');

  // Gradient defs
  const a1 = 0.22, a2 = 0.2;
  parts.push('<defs>');

  // flows1: left = catColors[catId], right = midCatColors[midCatId] — one gradient per unique pair
  const seen1 = new Set();
  flows1.forEach(f => {
    const key = f.catId + '-' + f.midCatId;
    if (seen1.has(key)) return;
    seen1.add(key);
    const cL = catColors[f.catId].base;
    const cR = midCatColors[f.midCatId].base;
    const [rL, gL, bL] = hexToRgb(cL);
    const [rR, gR, bR] = hexToRgb(cR);
    const rM = Math.round((rL + rR) / 2), gM = Math.round((gL + gR) / 2), bM = Math.round((bL + bR) / 2);
    parts.push('<linearGradient id="g1-' + key + '" x1="' + (L.col1X + L.nodeW) + '" y1="0" x2="' + L.col2X + '" y2="0" gradientUnits="userSpaceOnUse">');
    parts.push('<stop offset="0"   stop-color="' + cL + '" stop-opacity="' + a1 + '"/>');
    parts.push('<stop offset="0.5" stop-color="rgb(' + rM + ',' + gM + ',' + bM + ')" stop-opacity="' + a1 + '"/>');
    parts.push('<stop offset="1"   stop-color="' + cR + '" stop-opacity="' + a1 + '"/>');
    parts.push('</linearGradient>');
  });

  // flows2: left = midCatColors, right = alt color — one gradient per (catId, altIdx) combo
  const seen2 = new Set();
  flows2.forEach(f => {
    const key = f.catId + '-' + f.altIdx;
    if (seen2.has(key)) return;
    seen2.add(key);
    const cL = midCatColors[f.catId].base;
    const cR = alternatives[f.altIdx].color;
    const [rL, gL, bL] = hexToRgb(cL);
    const [rR, gR, bR] = hexToRgb(cR);
    const rM = Math.round((rL + rR) / 2), gM = Math.round((gL + gR) / 2), bM = Math.round((bL + bR) / 2);
    parts.push('<linearGradient id="g2-' + key + '" x1="' + (L.col2X + L.nodeW) + '" y1="0" x2="' + L.col3X + '" y2="0" gradientUnits="userSpaceOnUse">');
    parts.push('<stop offset="0"   stop-color="' + cL + '" stop-opacity="' + a2 + '"/>');
    parts.push('<stop offset="0.5" stop-color="rgb(' + rM + ',' + gM + ',' + bM + ')" stop-opacity="' + a2 + '"/>');
    parts.push('<stop offset="1"   stop-color="' + cR + '" stop-opacity="' + a2 + '"/>');
    parts.push('</linearGradient>');
  });

  parts.push('</defs>');

  // Title
  const titleFs = clamp(L.W * 0.022, 22, 22);
  parts.push('<text x="' + (L.W / 2) + '" y="' + L.titleY + '" fill="' + headerC + '" font-size="' + titleFs + '" font-weight="600" font-family="sans-serif" text-anchor="middle">' + escapeXml('Studio Pedagogy') + '</text>');

  // Legend (bottom center, no pct)
  const lfs = clamp(L.W * 0.012, 10, 13);
  const legendGap = 24;
  const legendItems = criteria.map(c => ({ c, text: c.label, tw: c.label.length * lfs * 0.58 }));
  const totalLegendW = legendItems.reduce((s, it) => s + swatchW + 5 + it.tw, 0) + legendGap * (legendItems.length - 1);
  let lx = (L.W - totalLegendW) / 2;
  legendItems.forEach(({ c, text, tw }) => {
    const cc = catColors[c.id];
    const r = Math.round(swatchW * 0.35);
    parts.push('<rect x="' + lx + '" y="' + (L.legendY - swatchW / 2) + '" width="' + swatchW + '" height="' + swatchW + '" rx="' + r + '" ry="' + r + '" fill="' + cc.base + '" fill-opacity="0.9"/>');
    parts.push('<text x="' + (lx + swatchW + 5) + '" y="' + L.legendY + '" fill="' + cc.base + '" font-size="' + lfs + '" font-family="sans-serif" dominant-baseline="middle">' + escapeXml(text) + '</text>');
    lx += swatchW + 5 + tw + legendGap;
  });

  // Column headers
  const hfs = L.fonts.header;
  parts.push('<text x="' + L.col1X + '" y="' + L.headerY + '" fill="' + headerC + '" font-size="' + hfs + '" font-weight="500" font-family="sans-serif" text-anchor="center" dominant-baseline="auto">Methods</text>');
  parts.push('<text x="' + L.col2X + '" y="' + L.headerY + '" fill="' + headerC + '" font-size="' + hfs + '" font-weight="500" font-family="sans-serif" text-anchor="middle" dominant-baseline="auto">Learning outcomes</text>');
  parts.push('<text x="' + L.col3X + '" y="' + L.headerY + '" fill="' + headerC + '" font-size="' + hfs + '" font-weight="500" font-family="sans-serif" text-anchor="middle" dominant-baseline="auto">Critiques</text>');

  // Flows1
  flows1.forEach(f => {
    parts.push('<path d="' + ribbonPathData(L.col1X + L.nodeW, f.srcY, f.srcH, L.col2X, f.dstY, f.dstH) + '" fill="url(#g1-' + f.catId + '-' + f.midCatId + ')"/>');
  });

  // Flows2
  flows2.forEach(f => {
    parts.push('<path d="' + ribbonPathData(L.col2X + L.nodeW, f.srcY, f.srcH, L.col3X, f.dstY, f.dstH) + '" fill="url(#g2-' + f.catId + '-' + f.altIdx + ')"/>');
  });

  // Sub-criteria nodes
  subNodes.forEach(sn => {
    const cc = catColors[sn.catId];
    parts.push('<rect x="' + L.col1X + '" y="' + sn.y + '" width="' + L.nodeW + '" height="' + sn.h + '" fill="' + cc.base + '" fill-opacity="0.68"/>');
    wrapLabel(sn.label, 30).forEach((line, li, arr) => {
      const y = sn.midY + (li - (arr.length - 1) / 2) * L.lineGap;
      parts.push('<text x="' + (L.col1X - L.labelPad) + '" y="' + y + '" fill="' + txtP + '" font-size="' + L.fonts.sub + '" font-family="sans-serif" text-anchor="end" dominant-baseline="middle">' + escapeXml(line) + '</text>');
    });
  });

  // Middle item nodes
  midNodes.forEach(mn => {
    const cc = catColors[mn.catId];
    parts.push('<rect x="' + L.col2X + '" y="' + mn.y + '" width="' + L.nodeW + '" height="' + mn.h + '" fill="' + cc.base + '" fill-opacity="0.68"/>');
    parts.push('<text x="' + (L.col2X + L.nodeW + L.labelPad) + '" y="' + mn.midY + '" fill="' + cc.base + '" font-size="' + L.fonts.mid + '" font-family="sans-serif" dominant-baseline="middle">' + escapeXml(mn.label) + '</text>');
  });

  // Alternative nodes
  altNodes.forEach(an => {
    parts.push('<rect x="' + L.col3X + '" y="' + an.y + '" width="' + L.nodeW + '" height="' + an.h + '" fill="' + an.color + '" fill-opacity="0.86"/>');
    parts.push('<text x="' + (L.col3X + L.nodeW + L.labelPad) + '" y="' + an.midY + '" fill="' + altTxtC + '" font-size="' + L.fonts.alt + '" font-family="sans-serif" font-weight="500" dominant-baseline="middle">' + escapeXml(an.label) + '</text>');
  });

  parts.push('</svg>');
  return parts.join('');
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function saveAs600DpiPng() {
  const exportScale = 600 / 96;
  const out = document.createElement('canvas');
  out.width = Math.round(layout.W * exportScale);
  out.height = Math.round(layout.H * exportScale);
  const outCtx = out.getContext('2d');
  outCtx.fillStyle = '#ffffff'; outCtx.fillRect(0, 0, out.width, out.height);
  outCtx.drawImage(canvas, 0, 0, out.width, out.height);
  out.toBlob(blob => { if (blob) saveBlob(blob, 'studio_pedagogy_1000dpi.jpg'); }, 'image/jpeg', 0.95);
}

function saveAsSvg() {
  saveBlob(new Blob([buildSvgMarkup()], { type: 'image/svg+xml;charset=utf-8' }), '3_way_bipartite.svg');
}

let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { resizeRaf = null; render(); });
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (layout.W / rect.width);
  const my = (e.clientY - rect.top)  * (layout.H / rect.height);
  const hit = hitTest(mx, my);
  const next = hit ? { type: hit.type, idx: hit.idx, catId: hit.catId, colType: hit.colType } : { type: null, idx: null };
  const changed = next.type !== hoverTarget.type || next.idx !== hoverTarget.idx || next.catId !== hoverTarget.catId;
  if (changed) { hoverTarget = next; draw(); }
  updateTooltip(hit, e);
});

canvas.addEventListener('mouseleave', () => {
  hoverTarget = { type: null, idx: null }; draw(); tip.style.opacity = 0;
});

loadAndRender();

