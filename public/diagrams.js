// Diagrams for slides. Each type has steps(s) — how many clicks it takes to build — and html(s).
// Parts that appear on a step carry data-r="n"; the slide engine hides (audience) or fades (presenter) every part
// whose n is not yet reached, and print shows everything. Colours come only from the slide theme's CSS variables
// (--ph, --s-ink, --s-dim, --s-panel, --s-brass, --s-sea, ...), so diagrams work in light and dark themes.

const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const R = n => ` data-r="${n}"`;
// Text with manual line breaks (\n).
const tl = (text, x, y, cls, lh = 24) => String(text).split('\n').map((t, k) => `<text x="${x}" y="${y + k * lh}" class="${cls}">${esc(t)}</text>`).join('');
const nlines = t => String(t).split('\n').length;
// A straight arrow with a small filled head.
function arrow(x1, y1, x2, y2, cls = 'arr') {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 12, w = 7;
  const bx = x2 - h * Math.cos(a), by = y2 - h * Math.sin(a);
  const p = (dx, dy) => `${(bx + dx).toFixed(1)},${(by + dy).toFixed(1)}`;
  return `<line x1="${x1}" y1="${y1}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" class="${cls}"/><polygon points="${x2},${y2} ${p(-w * Math.sin(a), w * Math.cos(a))} ${p(w * Math.sin(a), -w * Math.cos(a))}" class="${cls}-h"/>`;
}
const svg = (w, h, label, body) => `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;

export const DIAGRAMS = {
  // Adair: three overlapping circles, then the leader where they meet.
  adair: {
    steps: () => 4,
    html: s => {
      const [a, b, c] = s.circles;
      return svg(640, 540, `Three overlapping circles: ${a[0]}, ${b[0]} and ${c[0]}, with the leader where all three meet`, `
        <g${R(0)}><circle cx="320" cy="185" r="165" class="vn v1"/><text x="320" y="100" class="dt">${esc(a[0])}</text><text x="320" y="130" class="ds">${esc(a[1])}</text></g>
        <g${R(1)}><circle cx="222" cy="355" r="165" class="vn v2"/><text x="175" y="405" class="dt">${esc(b[0])}</text><text x="175" y="435" class="ds">${esc(b[1])}</text></g>
        <g${R(2)}><circle cx="418" cy="355" r="165" class="vn v3"/><text x="465" y="405" class="dt">${esc(c[0])}</text><text x="465" y="435" class="ds">${esc(c[1])}</text></g>
        <g${R(3)}><circle cx="320" cy="300" r="40" class="core"/><text x="320" y="307" class="dc">Leader</text></g>`);
    },
  },
  // Tuckman: the performance curve drawn stage by stage.
  tuckman: {
    steps: s => s.stages.length,
    html: s => {
      const xs = [170, 400, 640, 880], ys = [245, 330, 200, 95];
      const segs = ['M80,240 C120,240 140,245 170,245', 'M170,245 C270,245 310,335 400,330', 'M400,330 C490,325 540,220 640,200', 'M640,200 C740,180 810,100 880,95 C930,92 970,90 1000,90'];
      return svg(1040, 470, 'Team performance over time: it dips at storming, then rises through norming to performing', `
        <line x1="70" y1="380" x2="1010" y2="380" class="ax"/><line x1="70" y1="380" x2="70" y2="30" class="ax"/>
        <text x="1010" y="368" class="axl">Time</text><text x="0" y="0" class="axl" transform="translate(52 40) rotate(-90)">Performance</text>
        ${s.stages.map(([n, a], j) => `<g${R(j)}><line x1="${xs[j]}" y1="${ys[j] + 14}" x2="${xs[j]}" y2="380" class="guide"/><path d="${segs[j]}" class="curve draw" pathLength="1"/>
          <circle cx="${xs[j]}" cy="${ys[j]}" r="12" class="pt"/><text x="${xs[j]}" y="418" class="dt sm">${esc(n)}</text><text x="${xs[j]}" y="448" class="ds">${esc(a)}</text></g>`).join('')}`);
    },
  },
  // Maslow: five tiers, built from the base up; names to the right of each tier.
  maslow: {
    steps: s => s.tiers.length,
    html: s => {
      const top = 14, base = 466, apex = 270, half = 255, n = s.tiers.length, h = (base - top) / n;
      const xAt = y => half * (y - top) / (base - top);
      return svg(1060, 480, `A pyramid of ${n} needs, from ${s.tiers.at(-1)[0]} at the base to ${s.tiers[0][0]} at the top`, s.tiers.map(([name, d], j) => {
        const y0 = top + j * h + (j ? 4 : 0), y1 = top + (j + 1) * h - 4, mid = (y0 + y1) / 2 + (j ? 0 : 12);
        const pts = j ? `${apex - xAt(y0)},${y0} ${apex + xAt(y0)},${y0} ${apex + xAt(y1)},${y1} ${apex - xAt(y1)},${y1}` : `${apex},${y0} ${apex + xAt(y1)},${y1} ${apex - xAt(y1)},${y1}`;
        return `<g${R(n - 1 - j)}><polygon points="${pts}" class="tier" style="fill-opacity:${(.22 + .14 * j).toFixed(2)}"/><text x="${apex}" y="${mid + 10}" class="dn">${n - j}</text>
          <line x1="${apex + xAt(mid) + 14}" y1="${mid}" x2="586" y2="${mid}" class="guide"/><text x="604" y="${mid - 4}" class="dt sm left">${esc(name)}</text><text x="604" y="${mid + 24}" class="ds left">${esc(d)}</text></g>`;
      }).join(''));
    },
  },
  // Urgent / important grid: do now, schedule, delegate, drop.
  eisenhower: {
    steps: () => 4,
    html: s => {
      const box = [[78, 46], [556, 46], [78, 262], [556, 262]], cls = ['q1', 'q2', 'q3', 'q4'];
      return svg(1040, 480, 'Two by two grid of urgent and important', `
        <text x="315" y="28" class="axl mid">Urgent</text><text x="793" y="28" class="axl mid">Not urgent</text>
        <text x="0" y="0" class="axl mid" transform="translate(40 150) rotate(-90)">Important</text><text x="0" y="0" class="axl mid" transform="translate(40 366) rotate(-90)">Not important</text>
        ${s.quads.map(([t, d], j) => `<g${R(j)}><rect x="${box[j][0]}" y="${box[j][1]}" width="462" height="204" rx="14" class="quad ${cls[j]}"/>
          <text x="${box[j][0] + 231}" y="${box[j][1] + 96}" class="dt">${esc(t)}</text><text x="${box[j][0] + 231}" y="${box[j][1] + 132}" class="ds">${esc(d)}</text></g>`).join('')}`);
    },
  },
  // Four-level gauge, least authority on the left.
  dial: {
    steps: s => s.levels.length,
    html: s => {
      const cx = 300, cy = 330, Ro = 270, Ri = 150, n = s.levels.length;
      const pt = (rad, deg) => [cx + rad * Math.cos(deg * Math.PI / 180), cy - rad * Math.sin(deg * Math.PI / 180)].map(v => v.toFixed(1));
      return svg(600, 400, `A gauge with ${n} levels of decision authority, from least on the left to most on the right`, `
        ${s.levels.map((lv, j) => {
          const a0 = 180 - j * 180 / n - 1.5, a1 = 180 - (j + 1) * 180 / n + 1.5, [lx, ly] = pt(210, (a0 + a1) / 2);
          return `<g${R(j)}><path d="M${pt(Ro, a0)} A${Ro} ${Ro} 0 0 1 ${pt(Ro, a1)} L${pt(Ri, a1)} A${Ri} ${Ri} 0 0 0 ${pt(Ri, a0)} Z" class="seg" style="fill-opacity:${(.2 + .22 * j).toFixed(2)}"/>
            <text x="${lx}" y="${+ly + 14}" class="dn">${esc(lv)}</text></g>`;
        }).join('')}
        <text x="${cx - Ro}" y="${cy + 44}" class="axl start">Less authority</text><text x="${cx + Ro}" y="${cy + 44}" class="axl">More authority</text>`);
    },
  },
  // Decision tree: a chain of questions; "yes" drops to the response, "no" moves on.
  tree: {
    steps: s => s.nodes.length,
    html: s => {
      const n = s.nodes.length, gap = 1040 / n, w = Math.min(172, gap - 46);
      return svg(1040, 372, `Decision tree: ${s.nodes.map(x => x[0].replace(/\n/g, ' ')).join(', then ')}`, s.nodes.map(([q, a], j) => {
        const c = gap / 2 + j * gap, last = j === n - 1;
        return `<g${R(j)}>
          <rect x="${c - w / 2}" y="20" width="${w}" height="112" rx="14" class="node${last ? ' hot' : ''}"/>${tl(q, c, 76 - (nlines(q) - 1) * 13, 'dt xs', 26)}
          ${j < n - 1 ? `${arrow(c + w / 2 + 4, 76, c + gap - w / 2 - 4, 76)}<text x="${c + gap / 2}" y="62" class="lbl">No</text>` : ''}
          ${arrow(c, 136, c, 210)}<text x="${c + 10}" y="180" class="lbl left">${last ? 'Then' : 'Yes'}</text>
          <rect x="${c - w / 2}" y="214" width="${w}" height="140" rx="12" class="ans"/>${tl(a, c, 284 - (nlines(a) - 1) * 12, 'ds', 24)}</g>`;
      }).join(''));
    },
  },
  // Iceberg: what shows above the waterline, and the reasons underneath.
  iceberg: {
    steps: s => 1 + s.below.length,
    html: s => svg(1040, 470, `Iceberg: ${s.above} above the surface; below: ${s.below.join(', ')}`, `
      <rect x="0" y="150" width="1040" height="320" class="water"/><line x1="0" y1="150" x2="1040" y2="150" class="waterline"/>
      ${tl('Above the surface:\nwhat you see', 30, 104, 'axl start', 22)}${tl('Below:\nwhy it happens', 30, 186, 'axl start', 22)}
      <g${R(0)}><polygon points="380,150 440,80 480,46 528,64 566,100 610,150" class="berg-top"/>
        <line x1="586" y1="104" x2="672" y2="104" class="guide"/><text x="684" y="98" class="dt sm left">${esc(s.above)}</text><text x="684" y="126" class="ds left">${esc(s.aboveSub || '')}</text></g>
      <polygon points="380,150 312,226 282,324 330,430 520,458 716,424 770,322 726,212 610,150" class="berg-bottom"/>
      ${s.below.map((t, j) => `<g${R(j + 1)}><text x="526" y="${232 + j * 64}" class="dt sm">${esc(t)}</text></g>`).join('')}`),
  },
  // Spectrum: a graded bar with marks along it, or paired rows from one end to the other.
  spectrum: {
    steps: s => (s.marks || s.rows).length,
    html: s => {
      const zones = n => Array.from({ length: n }, (_, j) => `<rect x="${80 + j * 880 / n + 2}" y="${s.rows ? 54 : 110}" width="${880 / n - 4}" height="16" rx="8" class="zone" style="fill-opacity:${(.2 + .7 * j / Math.max(1, n - 1)).toFixed(2)}"/>`).join('');
      if (s.marks) {
        const n = s.marks.length;
        return svg(1040, 330, `A spectrum from ${s.ends[0]} to ${s.ends[1]}`, `
          ${zones(n)}<text x="80" y="84" class="axl start">← ${esc(s.ends[0])}</text><text x="960" y="84" class="axl">${esc(s.ends[1])} →</text>
          ${s.marks.map(([t, d], j) => { const x = 80 + (j + .5) * 880 / n; return `<g${R(j)}><circle cx="${x}" cy="118" r="15" class="pt"/><line x1="${x}" y1="136" x2="${x}" y2="168" class="guide"/>
            ${tl(t, x, 200, 'dt xs', 26)}${tl(d, x, 210 + nlines(t) * 26, 'ds', 22)}</g>`; }).join('')}`);
      }
      const n = s.rows.length, h = 70 + n * 78;
      return svg(1040, h, `From ${s.ends[0]} to ${s.ends[1]}`, `
        ${zones(5)}<text x="80" y="38" class="dt sm left">${esc(s.ends[0])}</text><text x="960" y="38" class="dt sm end">${esc(s.ends[1])}</text>
        ${s.rows.map(([a, b], j) => { const y = 124 + j * 78; return `<g${R(j)}><text x="440" y="${y}" class="dl end">${esc(a)}</text>${arrow(462, y - 8, 578, y - 8, 'arr grad')}<text x="600" y="${y}" class="dl left strong">${esc(b)}</text></g>`; }).join('')}`).replace(`viewBox="0 0 1040 ${h}"`, `viewBox="0 0 1040 ${h}"`);
    },
  },
  // Three small networks: isolated people, a chain of hand-offs, a fully connected group.
  network: {
    steps: s => s.panels.length,
    html: s => {
      const cx = [175, 520, 865];
      const layouts = [
        c => ({ nodes: [[c - 92, 112], [c + 40, 82], [c + 100, 158], [c - 30, 196], [c - 110, 222]], edges: [] }),
        c => ({ nodes: [[c - 128, 150], [c - 64, 150], [c, 150], [c + 64, 150], [c + 128, 150]], edges: [[0, 1], [1, 2], [2, 3], [3, 4]] }),
        c => { const nodes = Array.from({ length: 5 }, (_, k) => [c + 78 * Math.cos((-90 + k * 72) * Math.PI / 180), 154 + 78 * Math.sin((-90 + k * 72) * Math.PI / 180)]);
          const edges = []; for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) edges.push([a, b]); return { nodes, edges }; },
      ];
      return svg(1040, 380, `Three ways of working: ${s.panels.map(p => p[0]).join(', ')}`, s.panels.map(([t, d], j) => {
        const { nodes, edges } = layouts[j](cx[j]);
        return `<g${R(j)}><rect x="${cx[j] - 160}" y="40" width="320" height="230" rx="16" class="panel-bg"/>
          ${edges.map(([a, b]) => `<line x1="${nodes[a][0].toFixed(1)}" y1="${nodes[a][1].toFixed(1)}" x2="${nodes[b][0].toFixed(1)}" y2="${nodes[b][1].toFixed(1)}" class="edge"/>`).join('')}
          ${nodes.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" class="nd"/>`).join('')}
          <text x="${cx[j]}" y="314" class="dt sm">${esc(t)}</text>${tl(d, cx[j], 344, 'ds', 22)}</g>`;
      }).join(''));
    },
  },
  // Signal path from sender to receiver, with numbered gaps where the message breaks.
  signal: {
    steps: s => s.gaps.length,
    html: s => {
      const xs = s.gaps.map((_, j) => 300 + j * 150);
      return svg(1040, 410, `A message travels from ${s.ends[0][0]} to ${s.ends[1][0]}, breaking at ${s.gaps.length} gaps`, `
        <rect x="20" y="152" width="180" height="92" rx="14" class="node"/><text x="110" y="194" class="dt sm">${esc(s.ends[0][0])}</text><text x="110" y="222" class="ds">${esc(s.ends[0][1])}</text>
        <rect x="840" y="152" width="180" height="92" rx="14" class="node"/><text x="930" y="194" class="dt sm">${esc(s.ends[1][0])}</text><text x="930" y="222" class="ds">${esc(s.ends[1][1])}</text>
        ${arrow(204, 198, 834, 198, 'arr path')}
        ${s.gaps.map(([t, d], j) => { const x = xs[j], up = j % 2 === 0, ty = up ? 82 : 300;
          return `<g${R(j)}><circle cx="${x}" cy="198" r="21" class="gap"/><text x="${x}" y="205" class="dn sm">${j + 1}</text>
            <line x1="${x}" y1="${up ? 176 : 220}" x2="${x}" y2="${up ? 126 : 272}" class="guide"/><text x="${x}" y="${ty}" class="dt xs">${esc(t)}</text>${tl(d, x, ty + 28, 'ds', 22)}</g>`; }).join('')}`);
    },
  },
  // Proportional timeline: blocks sized by minutes; events are markers between them.
  timeline: {
    steps: s => s.blocks.length,
    html: s => {
      const units = s.blocks.map(b => b.kind === 'event' ? 0 : b.min || s.flex || 4), total = units.reduce((a, b) => a + b, 0), scale = 900 / total;
      let x = 70, clock = 0;
      const parts = s.blocks.map((b, j) => {
        const w = units[j] * scale, out = b.kind === 'event'
          ? `<g${R(j)}><line x1="${x}" y1="66" x2="${x}" y2="236" class="evt"/><polygon points="${x},58 ${x + 12},74 ${x},90 ${x - 12},74" class="evt-h"/><text x="${x}" y="40" class="dt xs">${esc(b.label)}</text>${b.sub ? `<text x="${x}" y="264" class="ds">${esc(b.sub)}</text>` : ''}</g>`
          : `<g${R(j)}><rect x="${x + 3}" y="104" width="${w - 6}" height="96" rx="12" class="blk${b.min ? '' : ' soft'}"/><text x="${x + w / 2}" y="148" class="dt xs">${esc(b.label)}</text><text x="${x + w / 2}" y="176" class="ds">${esc(b.min ? `${b.min} min` : b.sub || '')}</text>
             ${b.min ? `<text x="${x + (j ? 12 : 3)}" y="230" class="tick">${clock}′</text>` : ''}</g>`;
        x += w; clock += b.min || 0; return out;
      });
      return svg(1040, 290, `Timeline: ${s.blocks.map(b => b.label).join(', then ')}`, `<line x1="70" y1="212" x2="970" y2="212" class="ax"/>${parts.join('')}`);
    },
  },
  // Closed loop: nodes around a circle with arrows between them.
  cycle: {
    steps: s => s.nodes.length,
    html: s => {
      const n = s.nodes.length, cx = 520, cy = n > 4 ? 262 : 255, Rr = n > 4 ? 188 : 150, rn = n > 4 ? 62 : 84, H = n > 4 ? 520 : 500;
      const at = (deg, rad = Rr) => [cx + rad * Math.cos(deg * Math.PI / 180), cy + rad * Math.sin(deg * Math.PI / 180)];
      const a = j => -90 + j * 360 / n, d = Math.asin((rn + 10) / Rr) * 180 / Math.PI;
      return svg(1040, H, `A cycle: ${s.nodes.map(x => x[0]).join(', ')}, then back to the start`, `
        ${s.center ? `<text x="${cx}" y="${cy + 8 - (n === 3 ? 44 : 0)}" class="axl mid">${esc(s.center)}</text>` : ''}
        ${s.nodes.map(([t, sub], j) => {
          const [x, y] = at(a(j)), a1 = a(j) + d, a2 = a(j + 1) - d, [x1, y1] = at(a1), [x2, y2] = at(a2);
          const ang = (a2 + 90) * Math.PI / 180, hx = x2 - 13 * Math.cos(ang), hy = y2 - 13 * Math.sin(ang);
          const head = `${x2.toFixed(1)},${y2.toFixed(1)} ${(hx - 7 * Math.sin(ang)).toFixed(1)},${(hy + 7 * Math.cos(ang)).toFixed(1)} ${(hx + 7 * Math.sin(ang)).toFixed(1)},${(hy - 7 * Math.cos(ang)).toFixed(1)}`;
          return `<g${R(j)}><path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${Rr} ${Rr} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}" class="arr loop"/><polygon points="${head}" class="arr loop-h"/>
            <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rn}" class="node c"/><text x="${x.toFixed(1)}" y="${(y - (nlines(sub) * 10) + 2).toFixed(1)}" class="dt xs">${esc(t)}</text>${tl(sub, x.toFixed(1), +(y + 24 - (nlines(sub) - 1) * 9).toFixed(1), 'ds sm', 19)}</g>`;
        }).join('')}`);
    },
  },
  // Hub and spoke: one idea in the middle, its parts around it.
  hub: {
    steps: s => s.spokes.length,
    html: s => {
      const n = s.spokes.length, cx = 520, cy = 245, rx = n > 4 ? 330 : 290, ry = n > 4 ? 178 : 150, w = n > 4 ? 236 : 260;
      const start = n > 4 ? 0 : 45;
      return svg(1040, 490, `${s.center} at the centre, connected to ${s.spokes.map(x => x[0]).join(', ')}`, `
        ${s.spokes.map(([t, d], j) => { const ang = (start + j * 360 / n - (n > 4 ? 0 : 90)) * Math.PI / 180, x = cx + rx * Math.cos(ang), y = cy + ry * Math.sin(ang);
          return `<g${R(j)}><line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="spoke"/><rect x="${(x - w / 2).toFixed(1)}" y="${(y - 44).toFixed(1)}" width="${w}" height="88" rx="14" class="node"/>
            <text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" class="dt xs">${esc(t)}</text><text x="${x.toFixed(1)}" y="${(y + 22).toFixed(1)}" class="ds sm">${esc(d)}</text></g>`; }).join('')}
        <circle cx="${cx}" cy="${cy}" r="82" class="core hubc"/>${tl(s.center, cx, cy + 7 - (nlines(s.center) - 1) * 12, 'dc lg', 26)}`);
    },
  },
  // Cause → response: each row maps a diagnosis to the leader's response.
  mapping: {
    steps: s => s.rows.length,
    html: s => {
      const h = s.rows.length * 98 + 50;
      return svg(1040, h, `${s.heads[0]} mapped to ${s.heads[1]}`, `
        <text x="250" y="24" class="axl mid">${esc(s.heads[0])}</text><text x="790" y="24" class="axl mid">${esc(s.heads[1])}</text>
        ${s.rows.map(([c, r], j) => { const y = 44 + j * 98; return `<g${R(j)}><rect x="70" y="${y}" width="360" height="76" rx="12" class="node"/><text x="250" y="${y + 47}" class="dt xs">${esc(c)}</text>
          ${arrow(440, y + 38, 600, y + 38)}<rect x="610" y="${y}" width="360" height="76" rx="12" class="ans"/><text x="790" y="${y + 46}" class="dl mid strong">${esc(r)}</text></g>`; }).join('')}`);
    },
  },
};

// Three-step models as connected chevrons, one per click.
const chevShape = (j, last) => `<svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><polygon points="0,0 ${last ? '372' : '360'},0 400,60 ${last ? '372' : '360'},120 0,120${j ? ' 40,60' : ''}"/></svg>`;
export const flowHTML = s => `<div class="chev" style="--n:${s.items.length}">${s.items.map(([h, p], j) => `<div class="ch"${R(j)}><div class="ch-shape${j ? '' : ' first'}">${chevShape(j, j === s.items.length - 1)}<b>Step ${j + 1}</b> <span>${esc(h)}</span></div> <p>${esc(p)}</p></div>`).join('')}</div>`;

// Hide or fade parts that are not yet revealed. The newest part fades in; print and previews show everything.
export function applyReveal(html, step, mode) {
  return html.replace(/ data-r="(\d+)"/g, (m, n) => {
    n = +n;
    if (n < step) return n === step - 1 && mode !== 'still' ? `${m} data-new="1"` : m;
    return `${m} data-h="${mode === 'ghost' ? 'ghost' : 'hide'}"`;
  });
}
