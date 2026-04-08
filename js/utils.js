function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function wrapLabel(label, maxLen) {
  const words = label.trim().split(/\s+/);
  const lines = [];
  words.forEach((word) => {
    if (!lines.length) { lines.push(word); return; }
    const next = lines[lines.length - 1] + ' ' + word;
    if (next.length <= maxLen) { lines[lines.length - 1] = next; } else { lines.push(word); }
  });
  return lines;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function ordinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function escapeXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 250);
}
