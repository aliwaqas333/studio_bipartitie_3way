(function () {
  const dk = false;
  const TOOLTIPS_ENABLED = false;

  const BASE_W = 1600;
  const BASE_H = 800;
  const HEIGHT_RATIO = BASE_H / BASE_W;

  const bg      = '#ffffff';
  const txtP    = '#000000';
  const txtS    = '#000000';
  const headerC = '#000000';
  const altTxtC = '#000000';

  // Colors only — labels come from Excel
  const catColors = {
    res:  { base: '#663366' },
    des:  { base: '#FF0066' },
    tech: { base: '#F0C800' },
    comm: { base: '#FF9933' }
  };

  // const catColors = {
  //   res:  { base: '#FF0066' },
  //   des:  { base: '#F0C800' },
  //   tech: { base: '#FF9933' },
  //   comm: { base: '#663366' }
  // };

  const midCatColors = {
    res:  { base: '#0033CC', label: 'Parti'        },
    des:  { base: '#339966', label: 'Qualitative'    },
    tech: { base: '#339999', label: 'Quantitative'   },
    comm: { base: '#666699', label: 'Representation' }
  };

  const weights = { S: 5, M: 3, W: 1, N: 0 };

  // Column positions as fraction of canvas width (0–1)
  // col1X = left column (Methods), col2X = middle (Learning outcomes), col3X = right (Critiques)
  const colsgap = 0.24 // gap between columns (fractions of canvas width)
  const col1X = 0.4;
  const col2X = col1X + colsgap;
  const col3X = col2X + colsgap;

  const layout = {
    col1X, col2X, col3X,
    // Stats panel occupies the left whitespace (fractions of canvas width)
    statsPanelX: 0.08,  // left edge
    statsPanelW: 0.19,  // width
  };

  // Labels and pcts come from Excel — sub count is structural (must match Excel rows)
  const criteria = [
    { id: 'res',  label: 'Research',      pct: '25%', subs: [ {}, {}, {} ] },
    { id: 'des',  label: 'Design',        pct: '25%', subs: [ {}, {}, {}, {} ] },
    { id: 'tech', label: 'Technical',     pct: '25%', subs: [ {}, {}, {}, {} ] },
    { id: 'comm', label: 'Communication', pct: '25%', subs: [ {}, {}, {}, {} ] }
  ];

  // Labels and pcts come from Excel — colors are defined here
  const alternatives = [
    { label: '', pct: '40%', color: '#DDD9C3' },
    { label: '', pct: '20%', color: '#C4BD97' },
    { label: '', pct: '20%', color: '#948A54' },
    { label: '', pct: '20%', color: '#79724f' },
    { label: '', pct: '20%', color: '#4A452A' },
  ];

  //   const alternatives = [
  //   { label: '', pct: '40%', color: '#79724f' },
  //   { label: '', pct: '20%', color: '#948A54' },
  //   { label: '', pct: '20%', color: '#C4BD97' },
  //   { label: '', pct: '20%', color: '#DDD9C3' },
  //   { label: '', pct: '20%', color: '#EEECE1' },
  // ];

  // Labels and catIds come from Excel — only id and weight kept here
  const midItems = [
    { id: 'r_di', w: 25 }, { id: 'r_cg', w: 25 }, { id: 'r_cl', w: 25 }, { id: 'r_cm', w: 25 },
    { id: 'd_fn', w: 34 }, { id: 'd_ae', w: 33 }, { id: 'd_sv', w: 33 },
    { id: 't_ar', w: 25 }, { id: 't_ce', w: 25 }, { id: 't_cc', w: 25 }, { id: 't_ei', w: 25 },
    { id: 'c_sn', w: 25 }, { id: 'c_cd', w: 25 }, { id: 'c_co', w: 25 }, { id: 'c_sc', w: 25 },
  ];

  // Populated at runtime from Excel
  const midToAltLinks = [];

  // Equal defaults — overwritten at runtime from Excel
  const midCategoryHeightPcts = { res: 0.25, des: 0.25, tech: 0.25, comm: 0.25 };

  window.BIPARTITE_CONSTS = {
    dk, TOOLTIPS_ENABLED, weights,
    BASE_W, BASE_H, HEIGHT_RATIO,
    bg, txtP, txtS, headerC, altTxtC,
    catColors, midCatColors,
    criteria, alternatives, midItems, midToAltLinks,
    midCategoryHeightPcts, layout
  };
})();
