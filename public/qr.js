// QR codes as inline SVG, drawn locally (no external service). Colour follows the surrounding text colour, so the code
// matches the slide theme; the quiet zone is kept so phones can read it.
import qrcode from './vendor/qrcode.js';

export function qrSVG(text, { label = 'QR code', cls = 'qr' } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(unescape(encodeURIComponent(text)), 'Byte');   // UTF-8
  qr.make();
  const n = qr.getModuleCount(), q = 4, size = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg class="${cls}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label.replace(/"/g, '&quot;')}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" class="qr-bg"/><path d="${d}" class="qr-fg"/></svg>`;
}
