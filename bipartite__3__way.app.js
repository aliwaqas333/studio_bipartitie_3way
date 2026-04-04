const canvas = document.getElementById('sk');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('sktip');
const {
  dk,
  TOOLTIPS_ENABLED,
  BASE_W,
  BASE_H,
  HEIGHT_RATIO,
  bg,
  txtP,
  txtS,
  headerC,
  catColors,
  midCatColors,
  criteria,
  altTxtC,
  weights,
} = window.BIPARTITE_CONSTS;

// These start from consts but are overwritten at runtime from Excel
let midItems             = window.BIPARTITE_CONSTS.midItems.map(x => ({ ...x }));
let alternatives         = window.BIPARTITE_CONSTS.alternatives.map(x => ({ ...x }));
let midToAltLinks        = window.BIPARTITE_CONSTS.midToAltLinks;
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

  const wMap = { S: weights.S, M: weights.M, W: weights.W, N: 0 };
  const catNameToId = { 'Process': 'res', 'Qualitative': 'des', 'Quantitative': 'tech', 'Representation': 'comm' };

  // Dynamically find the category header row (contains "Process")
  let catRowIdx = rows.findIndex(r => r.some(c => c.toString().trim() === 'Process'));
  if (catRowIdx === -1) catRowIdx = 3; // fallback
  const midLabelRowIdx = catRowIdx + 1;
  const SUB_ROW_START  = catRowIdx + 2;

  // Find first mid item column (first col in category row that has "Process")
  const catRow      = rows[catRowIdx] || [];
  const midLabelRow = rows[midLabelRowIdx] || [];
  const MID_COL_START = catRow.findIndex(c => c.toString().trim() === 'Process');
  const MID_COUNT = midLabelRow.slice(MID_COL_START).filter(c => { const v = c.toString().trim(); return v !== '' && v !== '%'; }).length || 15;
  let currentCatId = 'res';
  midItems = Array.from({ length: MID_COUNT }, (_, i) => {
    const catCell = (catRow[MID_COL_START + i] || '').toString().trim();
    if (catCell && catNameToId[catCell]) currentCatId = catNameToId[catCell];
    const label = (midLabelRow[MID_COL_START + i] || '').toString().trim();
    const existing = window.BIPARTITE_CONSTS.midItems[i];
    return { id: existing ? existing.id : 'm_' + i, label, catId: currentCatId, w: existing ? existing.w : 25 };
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

    // Build midIdx → [altIdx, …]
    const newMidToAlt = midItems.map(() => []);
    for (let ai = 0; ai < ALT_COUNT; ai++) {
      const row = rows2[ALT_ROW_START + ai] || [];
      for (let mi = 0; mi < MID_COUNT; mi++) {
        const val = (row[MID2_COL_START + mi] || '').toString().trim().toUpperCase();
        if (val && val !== 'N') newMidToAlt[mi].push(ai);
      }
    }
    midToAltLinks = newMidToAlt;
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
  const width  = Math.max(container.clientWidth || BASE_W, 640);
  const height = window.innerHeight; // fill full viewport height

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const titleY    = height * 0.035;                  // title sits at ~4.5% of height
  const headerY   = height * 0.048;                  // column headers just above figure
  const topPad    = height * 0.05;                  // figure starts at ~10.5%
  const bottomPad = height * 0.06;                   // space for single footer row
  const usableH   = height - topPad - bottomPad;

  return {
    W: width, H: height, topPad, bottomPad, usableH,
    col1X: width * window.BIPARTITE_CONSTS.layout.col1X,  // sub-criteria  — labels LEFT
    col2X: width * window.BIPARTITE_CONSTS.layout.col2X,  // middle items  — labels RIGHT
    col3X: width * window.BIPARTITE_CONSTS.layout.col3X,  // alternatives  — labels RIGHT
    nodeW: clamp(width * 0.014, 10, 16),
    labelPad: clamp(width * 0.009, 6, 12),

    // vertical gaps
    subGap: 1,    // gap between sub-criteria within a category (left column)
    subCatGap: 1, // gap between sub-criteria categories (left column)
    midGap: 1,    // gap between mid items within a category (middle column)
    midCatGap: 1, // gap between mid item categories (middle column)
    altGap: 1, // gap between alternatives (right column)
    fonts: {
      header: clamp(width * 0.014, 11, 14),
      legend: clamp(width * 0.012, 10, 13),
      sub:    clamp(width * 0.011,  9, 12),
      mid:    clamp(width * 0.010,  8, 11),
      alt:    clamp(width * 0.0115, 10, 13),
      pct:    clamp(width * 0.0095,  8, 10)
    },
    lineGap: clamp(height * 0.017, 6, 16),
    footerY: height - height * 0.030,  // single footer row
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
    alts.forEach(ai => {
      const srcH = mn.h / alts.length;
      const dstH = altInW[ai] > 0 ? altNodes[ai].h * (srcH / altInW[ai]) : 0;
      flows2.push({ srcY: mn.y + midOutOff[mi], srcH, dstY: altNodes[ai].y + altInOff2[ai], dstH, catId: mn.catId, midIdx: mi, altIdx: ai });
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

  // ── Title ─────────────────────────────────────────────────────────────────
  ctx.font = '700 ' + clamp(L.W * 0.026, 20, 24) + 'px ' + fontFamily;
  ctx.fillStyle = '#000000'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
  outlineText('Studio Pedagogy', (L.col1X + L.col3X) / 2 + 10, L.titleY);

  // ── Column headers ────────────────────────────────────────────────────────
  ctx.font = '400 ' + L.fonts.header + 'px ' + fontFamily;
  ctx.fillStyle = '#000000'; ctx.textBaseline = 'alphabetic';
  const hOff = 8; // nudge headers slightly right to visually center over content
  ctx.textAlign = 'center'; outlineText('Methods', L.col1X + hOff, L.headerY);
  ctx.textAlign = 'center'; outlineText('Learning outcomes', L.col2X + hOff, L.headerY);
  ctx.textAlign = 'center'; outlineText('Critiques', L.col3X + hOff, L.headerY);

  // ── Flows1: sub → mid (alpha scales proportionally with weights: W=1, M=3, S=5) ─
  const maxW = weights ? weights.S : 5;
  flows1.forEach((f, i) => {
    const cc = catColors[f.catId];
    const show = active.flows1.has(i);
    const t = f.strength / maxW; // 0.2 (W) → 0.6 (M) → 1.0 (S)
    const activeAlpha = 0.15 + t * 0.60;         // W≈0.27  M≈0.51  S≈0.75
    const baseAlpha   = 0.30;                     // flat opacity in default state
    const alpha = active.focused ? (show ? activeAlpha : 0.08) : baseAlpha;
    drawRibbon(L.col1X + L.nodeW, f.srcY, f.srcH, L.col2X, f.dstY, f.dstH, cc.base, midCatColors[f.midCatId].base, alpha);
  });

  // ── Flows2: mid → alt ─────────────────────────────────────────────────────
  flows2.forEach((f, i) => {
    const cc = midCatColors[f.catId];
    const show = active.flows2.has(i);
    const alpha = active.focused ? (show ? 0.55 : 0.10) : 0.20;
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
      const lines = wrapLabel(sn.label, 30);
      lines.forEach((l, li) => {
        outlineText(l, L.col1X - L.labelPad, sn.midY + (li - (lines.length - 1) / 2) * L.lineGap);
      });
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
      outlineText(mn.label, L.col2X + L.nodeW + L.labelPad, mn.midY);
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
      outlineText(an.label, L.col3X + L.nodeW + L.labelPad, an.midY);
    }
  });

  // ── Footer: credit (left, under Methods) + legend (center) ───────────────
  const fSize = clamp(L.W * 0.011, 9, 12);
  ctx.font = '300 ' + fSize + 'px ' + fontFamily;
  ctx.textBaseline = 'middle'; ctx.globalAlpha = 1;

  // ── Single footer row: all items equally spaced, centered together ──
  const swatchW = clamp(L.W * 0.009, 7, 10);
  const rowGap  = clamp(L.W * 0.016, 12, 20);  // same gap between every item
  const figMidX = (L.col1X + L.col3X) / 2;
  const midCatOrder = ['res', 'des', 'tech', 'comm'];

  // if we cant fetch year, just use 2026
  const year = new Date().getFullYear() || 2026;
  const creditText = '@Symbiosis Lab ' + year;
  const creditW    = ctx.measureText(creditText).width + 20;

  const btnsEl  = document.querySelector('.sk-btns');
  const btnsW   = btnsEl ? btnsEl.offsetWidth || 80 : 80;

  const allLegendItems = [
    ...criteria.map(c     => ({ color: catColors[c.id].base,  label: c.label,                tw: ctx.measureText(c.label).width,                catId: c.id, colType: 'left' })),
    ...midCatOrder.map(id => ({ color: midCatColors[id].base, label: midCatColors[id].label, tw: ctx.measureText(midCatColors[id].label).width, catId: id,   colType: 'mid'  }))
  ];

  // total width of the full row: credit + gap + legend items + gap + buttons
  const legendW   = allLegendItems.reduce((s, it) => s + swatchW + 5 + it.tw, 0) + rowGap * (allLegendItems.length - 1);
  const totalRowW = creditW + rowGap * 2 + legendW + btnsW;
  let rx = figMidX - totalRowW / 2;

  // Credit text
  ctx.fillStyle = '#000000'; ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  outlineText(creditText, rx, L.footerY);
  rx += creditW + rowGap;

  // Legend items — store hit boxes for hover detection
  window._legendHitBoxes = [];
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

  // Store buttons X for positionButtons()
  window._footerBtnsX = rx + 20;
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
  const btnH      = btns.offsetHeight || 28;
  const canvasTop = canvas.offsetTop;
  const bx        = window._footerBtnsX != null ? window._footerBtnsX : layout.col3X;
  btns.style.left   = (canvas.offsetLeft + bx) + 'px';
  btns.style.right  = 'auto';
  btns.style.bottom = 'auto';
  btns.style.top    = (canvasTop + layout.footerY - btnH / 2) + 'px';
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
