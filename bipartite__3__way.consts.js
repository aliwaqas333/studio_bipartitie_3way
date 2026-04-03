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

  const catColors = {
    res:  { base: '#FF0066' },
    des:  { base: '#F0C800' },
    tech: { base: '#FF9933' },
    comm: { base: '#996666' }
  };

  const midCatColors = {
    res:  { base: '#0033CC', label: 'Process'        },
    des:  { base: '#339966', label: 'Qualitative'    },
    tech: { base: '#339999', label: 'Quantitative'   },
    comm: { base: '#666699', label: 'Representation' }
  };

  const weights = { S: 5, M: 3, W: 1, N: 0 };

  const criteria = [
    { id: 'res',  label: 'Research',      pct: '15%', subs: [ {w:'20%'}, {w:'30%'}, {w:'50%'} ] },
    { id: 'des',  label: 'Design',        pct: '30%', subs: [ {w:'20%'}, {w:'35%'}, {w:'40%'}, {w:'5%'} ] },
    { id: 'tech', label: 'Technical',     pct: '30%', subs: [ {w:'20%'}, {w:'40%'}, {w:'25%'}, {w:'15%'} ] },
    { id: 'comm', label: 'Communication', pct: '25%', subs: [ {w:'30%'}, {w:'45%'}, {w:'25%'} ] }
  ];

  const alternatives = [
    { label: 'Desk crits',    pct: '40%', color: '#000000' },
    { label: 'Self learning', pct: '25%', color: '#1f1f1f' },
    { label: 'Peer learning', pct: '15%', color: '#555555' },
    { label: 'Pin-ups',       pct: '10%', color: '#707070' },
    { label: 'Reviews',       pct: '10%', color: '#bbbbbb' },
  ];

  const midItems = [
    { id: 'r_di', label: 'Data integration',         catId: 'res',  w: 20 },
    { id: 'r_cg', label: 'Conceptual grounding',     catId: 'res',  w: 30 },
    { id: 'r_cl', label: 'Comparative learning',     catId: 'res',  w: 15 },
    { id: 'r_cm', label: 'Context mapping',          catId: 'res',  w: 35 },
    { id: 'd_fn', label: 'Functionality',            catId: 'des',  w: 25 },
    { id: 'd_ae', label: 'Aesthetics',               catId: 'des',  w: 25 },
    { id: 'd_sv', label: 'Social value & wellbeing', catId: 'des',  w: 25 },
    { id: 'd_pf', label: 'Performance',              catId: 'des',  w: 25 },
    { id: 't_ar', label: 'Assembly resolution',      catId: 'tech', w: 50 },
    { id: 't_ce', label: 'Cost estimate',            catId: 'tech', w: 10 },
    { id: 't_cc', label: 'Code compliance',          catId: 'tech', w: 20 },
    { id: 't_ei', label: 'Environmental impact',     catId: 'tech', w: 20 },
    { id: 'c_sn', label: 'Structured narrative',     catId: 'comm', w: 25 },
    { id: 'c_cd', label: 'Collaborative dialogue',   catId: 'comm', w: 20 },
    { id: 'c_co', label: 'Completeness',             catId: 'comm', w: 25 },
    { id: 'c_sc', label: 'Standards & conventions',  catId: 'comm', w: 15 },
    { id: 'c_em', label: 'Exploratory models',       catId: 'comm', w: 10 },
    { id: 'c_tx', label: 'Textual',                  catId: 'comm', w:  5 }
  ];

  // Populated at runtime from the mid2right sheet in the Excel file
  const midToAltLinks = [];

  const _leftTotalPct = criteria.reduce((s, c) => s + parseFloat(c.pct), 0);
  const leftCategoryHeightPcts = Object.fromEntries(
    criteria.map(c => [c.id, parseFloat(c.pct) / _leftTotalPct])
  );

  const midCategoryHeightPcts = {
    res:  0.22,
    des:  0.22,
    tech: 0.22,
    comm: 0.34
  };

  window.BIPARTITE_CONSTS = {
    dk, TOOLTIPS_ENABLED, weights,
    BASE_W, BASE_H, HEIGHT_RATIO,
    bg, txtP, txtS, headerC, altTxtC,
    catColors, midCatColors,
    criteria, alternatives, midItems, midToAltLinks,
    leftCategoryHeightPcts, midCategoryHeightPcts
  };
})();
