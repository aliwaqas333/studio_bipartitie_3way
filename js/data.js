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
