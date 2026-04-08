function ribbonPathData(x1, y1, h1, x2, y2, h2) {
  const mx = (x1 + x2) / 2;
  return 'M ' + x1 + ' ' + y1
    + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2
    + ' L ' + x2 + ' ' + (y2 + h2)
    + ' C ' + mx + ' ' + (y2 + h2) + ', ' + mx + ' ' + (y1 + h1) + ', ' + x1 + ' ' + (y1 + h1) + ' Z';
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
