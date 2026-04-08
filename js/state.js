const canvas = document.getElementById('sk');
const ctx = canvas.getContext('2d');
const tip = document.getElementById('sktip');
const {
  TOOLTIPS_ENABLED,
  BASE_W,
  bg,
  txtP,
  headerC,
  catColors,
  midCatColors,
  criteria,
  altTxtC,
  weights,
} = window.BIPARTITE_CONSTS;

const title = {
  text:"",
}

const columnHeader = {
  left: 'Methods',
  middle: 'Learning outcomes',
  right: 'Critiques'
};

// These start from consts but are overwritten at runtime from Excel
let midItems             = window.BIPARTITE_CONSTS.midItems.map(x => ({ ...x }));
let alternatives         = window.BIPARTITE_CONSTS.alternatives.map(x => ({ ...x }));
let midToAltLinks        = window.BIPARTITE_CONSTS.midToAltLinks;
let midToAltStrengths    = []; // parallel to midToAltLinks — strength per (mid, alt) pair
let midCategoryHeightPcts = { ...window.BIPARTITE_CONSTS.midCategoryHeightPcts };

// These are populated dynamically from the Excel file at runtime
let subToMidLinks = [];
let subToMidStrengths = [];

// Geometry state
let layout = null;
let subNodes = [];   // left column
let midNodes = [];   // middle column
let altNodes = [];   // right column
let flows1 = [];     // sub → mid
let flows2 = [];     // mid → alt
let hoverTarget = { type: null, idx: null };
