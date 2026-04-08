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
    const panelRight = L.W * 0.20 + L.W * 0.15;  // after left stat column
    const legendStartX = panelRight;
    const availW = L.W*0.6;  // extend to right edge
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
