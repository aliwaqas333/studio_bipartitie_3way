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
