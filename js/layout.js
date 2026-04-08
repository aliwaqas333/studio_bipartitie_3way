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
