// ── Left-side stats panel ────────────────────────────────────────────────
// Works for hover on any column:
//   • left sub   → flows1 (sub→mid), ranked among all subs
//   • middle mid → flows1 (sub→mid) + flows2 (mid→alt), ranked among all mids
//   • right alt  → flows2 (mid→alt), ranked among all alts
// Score per item: 0.75·(colW · catW) + 0.25·(3·S + 1·M + 0.5·W) over its attached links.
// "No" = (max possible links on that node) − links of any strength.
// Default (nothing hovered): shows totals across the LEFT column.
function computeStatsData() {
  const S = weights.S, M = weights.M, W = weights.W;

  function bucket(strength, a) {
    if      (strength === S) a.sC++;
    else if (strength === M) a.mC++;
    else if (strength === W) a.wC++;
  }
  // Score = 0.75 · (itemWeightInColumn · itemWeightInCategory) + 0.25 · (3·Strong + 1·Medium + 0.5·Weak)
  const scoreOf = (a, colW, catW) => 0.75 * (colW * catW) + 0.25 * (3 * a.sC + 1 * a.mC + 0.5 * a.wC);

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

  // Column totals — used to compute each item's weight relative to its whole column.
  // This matches the "CATEGORY REPRESENTATION" % shown in the stats panel.
  const totalSubH = subNodes.reduce((s, n) => s + n.h, 0);
  const totalMidH = midNodes.reduce((s, n) => s + n.h, 0);
  const totalAltH = altNodes.reduce((s, n) => s + n.h, 0);

  // Per-sub (left column)
  const perSub = subNodes.map((sn, si) => {
    const a = { sC: 0, mC: 0, wC: 0 };
    flows1.forEach(f => { if (f.subIdx === si) bucket(f.strength, a); });
    const nC = Math.max(0, midNodes.length - (a.sC + a.mC + a.wC));
    const colW = totalSubH > 0 ? (sn.h / totalSubH) * 100 : 0;
    const catW = parseFloat(sn.w) || 0;
    return { idx: si, ...a, nC, score: scoreOf(a, colW, catW) };
  });
  const subRank = rankItems(perSub);

  // Per-mid (middle column) — combines inbound (from subs) and outbound (to alts)
  const perMid = midNodes.map((mn, mi) => {
    const a = { sC: 0, mC: 0, wC: 0 };
    flows1.forEach(f => { if (f.midIdx === mi) bucket(f.strength, a); });
    flows2.forEach(f => { if (f.midIdx === mi) bucket(f.strength ?? W, a); });
    const maxLinks = subNodes.length + altNodes.length;
    const nC = Math.max(0, maxLinks - (a.sC + a.mC + a.wC));
    const colW = totalMidH > 0 ? (mn.h / totalMidH) * 100 : 0;
    const catW = parseFloat(mn.w) || 0;
    return { idx: mi, ...a, nC, score: scoreOf(a, colW, catW) };
  });
  const midRank = rankItems(perMid);

  // Per-alt (right column) — alts aren't grouped in categories, so catW = pct
  const perAlt = altNodes.map((an, ai) => {
    const a = { sC: 0, mC: 0, wC: 0 };
    flows2.forEach(f => { if (f.altIdx === ai) bucket(f.strength ?? W, a); });
    const nC = Math.max(0, midNodes.length - (a.sC + a.mC + a.wC));
    const colW = totalAltH > 0 ? (an.h / totalAltH) * 100 : 0;
    const catW = parseFloat(an.pct) || 0;
    return { idx: ai, ...a, nC, score: scoreOf(a, colW, catW) };
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
    const cx1 = L.W < 800 ? px + tickW + lineW + radius : px + tickW + lineW + radius;
    const cx2 = L.W < 800 ? px + tickW + lineW + radius : px + pw - tickW - lineW - radius;
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
