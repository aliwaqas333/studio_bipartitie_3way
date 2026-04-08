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
  btns.style.display = isMobile ? 'none' : 'flex';
  if (isMobile) return;
  const scale = 1;
  btns.style.transform = 'none';
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

async function loadAndRender() {
  try {
    await loadExcelData();
  } catch (e) {
    console.warn('Excel load failed (likely file:// CORS). Using default data.', e);
  }
  render();
}

// ── Event listeners ──────────────────────────────────────────────────────────
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

// ── Initialize ───────────────────────────────────────────────────────────────
loadAndRender();
