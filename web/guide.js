'use strict';

// ---------------------------------------------------------------------------
// 천체 안내 카드: 나침반의 천체 아이콘이나 아래 방위 줄을 누르면 아래에서 올라와요.
// app.js의 전역(state, bodyById, Astronomy, moonPath, svgEl, targetTime …)을 함께 써요.
// ---------------------------------------------------------------------------

const sheet = {
  root: $('sheet'), panel: $('sheet-panel'), title: $('sheet-title'), sub: $('sheet-sub'),
  figure: $('sheet-figure'), caption: $('sheet-caption'), rows: $('sheet-rows'), text: $('sheet-text'),
  id: null,
};

const FIG = { w: 300, h: 140 };                 // 그림 영역 (viewBox -160 -80 320 160 안쪽)
const AU_KM = 149597870.7;
const JUPITER_RADIUS_AU = 71492 / AU_KM;
const SYNODIC_MONTH = 29.530588;

function openSheet(id) {
  if (!bodyById[id] || !state.positions[id]) return;
  sheet.id = id;
  renderSheet();
  sheet.root.setAttribute('aria-hidden', 'false');
}

function closeSheet() {
  sheet.root.setAttribute('aria-hidden', 'true');
  sheet.panel.style.transform = '';
  sheet.id = null;
}

// 시간 막대를 움직이거나 위치가 바뀌면 다시 그려요 (열려 있을 때만).
function renderSheet() {
  const id = sheet.id;
  const pos = state.positions[id];
  if (!id || !pos) return;
  const body = bodyById[id];
  const guide = GUIDES[id] ?? {};
  const date = targetTime();
  const observer = new Astronomy.Observer(state.lat, state.lon, 0);

  sheet.title.textContent = body.name;
  sheet.sub.textContent = guide.sub ?? '';
  sheet.text.textContent = guide.text ?? '';
  sheet.caption.textContent = '';
  sheet.figure.replaceChildren();

  let rows;
  if (body.group === 'constellation') rows = constellationCard(body, guide, pos);
  else if (body.group === 'deepsky') rows = deepSkyCard(body, guide, pos);
  else if (id === 'Moon') rows = moonCard(pos, date);
  else if (id === 'Sun') rows = sunCard(observer, date);
  else rows = planetCard(body, pos, date, observer);

  sheet.rows.replaceChildren(...rows.map(([label, value, wide]) => {
    const div = document.createElement('div');
    if (wide) div.className = 'wide';
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    div.append(dt, dd);
    return div;
  }));
}

// ---------------------------------------------------------------------------
// 별자리 · 성운·은하: 별 지도 (gnomonic 투영, 왼쪽이 동쪽 = 하늘을 올려다본 방향)
// ---------------------------------------------------------------------------

function starProjector(points) {
  const r = Math.PI / 180;
  // 중심: 별들의 평균 방향
  let cx = 0, cy = 0, cz = 0;
  for (const [ra, dec] of points) {
    const a = ra * 15 * r, d = dec * r;
    cx += Math.cos(d) * Math.cos(a); cy += Math.cos(d) * Math.sin(a); cz += Math.sin(d);
  }
  const a0 = Math.atan2(cy, cx), d0 = Math.atan2(cz, Math.hypot(cx, cy));
  const raw = ([ra, dec]) => {
    const a = ra * 15 * r, d = dec * r;
    const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
    const x = Math.cos(d) * Math.sin(a - a0) / cosc;
    const y = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc;
    return [-x, -y];                      // 동쪽을 왼쪽에, 북쪽을 위에
  };
  const pts = points.map(raw);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(FIG.w / Math.max(maxX - minX, 1e-6), FIG.h / Math.max(maxY - minY, 1e-6));
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  return (p) => { const [x, y] = raw(p); return [(x - mx) * scale, (y - my) * scale]; };
}

const starRadius = (mag) => Math.max(1.1, 4.2 - 0.75 * mag);

function drawStarField(figure, { s: stars, l: lines }, { project, dim = false } = {}) {
  const proj = project ?? starProjector(stars);
  const xy = stars.map((s) => proj(s));
  for (const [i, j] of lines) {
    svgEl('line', { class: dim ? 'fig-line dim' : 'fig-line', x1: xy[i][0], y1: xy[i][1], x2: xy[j][0], y2: xy[j][1] }, figure);
  }
  stars.forEach((s, i) => {
    svgEl('circle', { class: 'fig-star', cx: xy[i][0], cy: xy[i][1], r: starRadius(s[2]),
      opacity: dim ? 0.45 : Math.min(1, 1.15 - s[2] * 0.12) }, figure);
  });
  return proj;
}

function constellationCard(body, guide, pos) {
  const data = SKY_FIGURES[body.id];
  const proj = drawStarField(sheet.figure, data);
  const [x, y] = proj([body.ra, body.dec]);
  svgEl('circle', { class: 'fig-ref', cx: x, cy: y, r: 7 }, sheet.figure);   // 나침반이 가리키는 기준점
  sheet.caption.textContent = '○ 기준점 · 왼쪽이 동쪽';
  return [
    ['주요 별', guide.stars ?? '-', true],
    ['기준점', body.ref],
    ['지금 고도', `${pos.altitude.toFixed(1)}°`],
  ];
}

function deepSkyCard(body, guide, pos) {
  const fig = sheet.figure;
  if (body.id === 'M45') {
    drawStarField(fig, { s: SKY_FIGURES.M45.s.map(([ra, dec, mag]) => [ra, dec, mag - 1.5]), l: [] });
  } else {
    // 은하수 중심은 궁수자리, 안드로메다 은하는 안드로메다자리를 함께 그려 찾는 길을 보여줘요.
    const host = SKY_FIGURES[body.id === 'M31' ? 'Andromeda' : 'Sagittarius'];
    const proj = starProjector([...host.s, [body.ra, body.dec]]);
    const [x, y] = proj([body.ra, body.dec]);
    const glow = body.id === 'M31'
      ? { rx: 26, ry: 8, rotate: -35 }
      : { rx: 60, ry: 22, rotate: -55 };
    svgEl('ellipse', { class: 'fig-glow', cx: 0, cy: 0, rx: glow.rx, ry: glow.ry,
      transform: `translate(${x} ${y}) rotate(${glow.rotate})` }, fig);
    drawStarField(fig, host, { project: proj, dim: true });
    svgEl('circle', { class: 'fig-ref', cx: x, cy: y, r: 7 }, fig);
    sheet.caption.textContent = `○ ${body.name} · 왼쪽이 동쪽`;
  }
  return [
    ['거리', guide.distance ?? '-'],
    ['지금 고도', `${pos.altitude.toFixed(1)}°`],
  ];
}

// ---------------------------------------------------------------------------
// 태양계: 앱 스타일에 맞춘 단순한 SVG + 지금 시각의 실제 값
// ---------------------------------------------------------------------------

function formatDistance(au) {
  const km = au * AU_KM;
  return km >= 1e8 ? `약 ${(km / 1e8).toFixed(2)}억 km` : `약 ${Math.round(km / 1e4).toLocaleString('ko-KR')}만 km`;
}

function formatMoment(d, base) {
  const label = dayLabel(d, base);
  return label === '오늘' ? hhmm(d) : `${label} ${hhmm(d)}`;
}

function sunAltitude(date, observer) {
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
  return Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal').altitude;
}

function visibility(pos, mag, sunAlt) {
  if (pos.altitude < 0) return '지평선 아래';
  if (sunAlt > 0 && mag > -3.5) return '낮 시간';
  if (sunAlt > -6 && mag > -1) return '박명 중';
  return mag <= 6 ? '맨눈 관측 가능' : '쌍안경 필요';
}

// 원 + 위상(밝은 부분). cycle은 달과 같은 규칙(0 삭 → 0.5 보름)으로 맞춰 moonPath를 재사용해요.
function drawPhaseDisc(r, color, cycle) {
  const g = svgEl('g', { transform: `scale(${r})` }, sheet.figure);
  svgEl('circle', { r: 1, fill: '#2a2a2a' }, g);
  svgEl('path', { d: moonPath(cycle), fill: color }, g);
  return g;
}

function phaseCycle(fraction, evening) {
  const c = Math.acos(1 - 2 * fraction) / (2 * Math.PI);   // 0 ~ 0.5
  return evening ? c : 1 - c;                              // 저녁별은 오른쪽(서쪽)이 밝아요
}

function moonCard(pos, date) {
  const g = drawPhaseDisc(42, '#fff', pos.cycle);
  if (state.lat < 0) g.setAttribute('transform', 'scale(-42 42)');
  const full = Astronomy.SearchMoonPhase(180, date, 35);
  const fresh = Astronomy.SearchMoonPhase(0, date, 35);
  return [
    ['위상', `${phaseName(pos.cycle)} · ${Math.round(pos.illumination * 100)}%`],
    ['월령', `${(pos.cycle * SYNODIC_MONTH).toFixed(1)}일`],
    ['다음 보름달', full ? formatMoment(full.date, date) : '-'],
    ['다음 삭', fresh ? formatMoment(fresh.date, date) : '-'],
  ];
}

function sunCard(observer, date) {
  svgEl('circle', { class: 'fig-glow sun', r: 46 }, sheet.figure);
  svgEl('circle', { r: 26, fill: '#ffb74d' }, sheet.figure);
  // 골든아워: 태양 고도 6° ~ -4°, 블루아워: -4° ~ -6°
  const from = new Date(date.getTime() - 60 * 60_000);
  const find = (dir, start, alt) => Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, dir, start, 1.5, alt)?.date ?? null;
  const span = (dir, a, b) => {
    const s = find(dir, from, a);
    const e = s && find(dir, s, b);
    return s && e ? `${formatMoment(s, date)}–${hhmm(e)}` : '-';
  };
  return [
    ['아침 블루아워', span(+1, -6, -4)],
    ['아침 골든아워', span(+1, -4, 6)],
    ['저녁 골든아워', span(-1, 6, -4)],
    ['저녁 블루아워', span(-1, -4, -6)],
  ];
}

function planetCard(body, pos, date, observer) {
  const target = Astronomy.Body[body.id];
  const illum = Astronomy.Illumination(target, date);
  const rows = [
    ['밝기', `${illum.mag.toFixed(1)}등급`],
    ['관측', visibility(pos, illum.mag, sunAltitude(date, observer))],
    ['지구와의 거리', formatDistance(illum.geo_dist)],
  ];

  if (body.id === 'Mercury' || body.id === 'Venus') {
    const evening = Astronomy.Elongation(target, date).visibility === 'evening';
    drawPhaseDisc(34, body.color, phaseCycle(illum.phase_fraction, evening));
    rows.push(['위상', `${Math.round(illum.phase_fraction * 100)}% · ${evening ? '저녁' : '새벽'}`]);
    sheet.caption.textContent = '망원경으로 본 위상';
  } else if (body.id === 'Mars') {
    svgEl('circle', { r: 32, fill: '#d9603b' }, sheet.figure);
    svgEl('ellipse', { cx: 0, cy: -27, rx: 10, ry: 4, fill: '#f4ece6', opacity: 0.85 }, sheet.figure);
  } else if (body.id === 'Jupiter') {
    drawJupiter(date);
    sheet.caption.textContent = '지금 이 시각의 위성 배치 · 왼쪽이 동쪽';
  } else if (body.id === 'Saturn') {
    drawSaturn(illum.ring_tilt);
    rows.push(['고리 기울기', `${Math.abs(illum.ring_tilt).toFixed(1)}°`]);
  }
  return rows;
}

function drawJupiter(date) {
  const fig = sheet.figure;
  const R = 15;
  const clipId = 'jupiter-clip';
  const defs = svgEl('defs', {}, fig);
  svgEl('circle', { r: R }, svgEl('clipPath', { id: clipId }, defs));
  const disc = svgEl('g', { 'clip-path': `url(#${clipId})` }, fig);
  svgEl('circle', { r: R, fill: '#e6c9a0' }, disc);
  for (const [y, h] of [[-6, 3.2], [3, 3.6]]) svgEl('rect', { x: -R, y, width: 2 * R, height: h, fill: '#b98a5a', opacity: 0.8 }, disc);

  // 위성 위치: 목성 기준 좌표를 하늘 평면(동·북)으로 투영해요.
  const g = Astronomy.GeoVector(Astronomy.Body.Jupiter, date, true);
  const dist = Math.hypot(g.x, g.y, g.z);
  const u = [g.x / dist, g.y / dist, g.z / dist];
  const ra = Math.atan2(u[1], u[0]), dec = Math.asin(u[2]);
  const east = [-Math.sin(ra), Math.cos(ra), 0];
  const north = [-Math.sin(dec) * Math.cos(ra), -Math.sin(dec) * Math.sin(ra), Math.cos(dec)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const moons = Astronomy.JupiterMoons(date);
  const pxPerRadius = 5.2;                         // 위성 거리 축척: 목성 반지름 1 = 5.2px (칼리스토까지 화면 안에)
  const list = [['io', '이오'], ['europa', '유로파'], ['ganymede', '가니메데'], ['callisto', '칼리스토']]
    .map(([key, name]) => {
      const m = moons[key];
      const v = [m.x, m.y, m.z].map((c) => c / JUPITER_RADIUS_AU);
      const e = dot(v, east), n = dot(v, north);
      const hidden = dot(v, u) > 0 && Math.hypot(e, n) < 1;   // 목성 뒤에 숨음
      const x = Math.max(-150, Math.min(150, -e * pxPerRadius));
      return { name, x, y: -n * pxPerRadius, hidden };
    })
    .sort((a, b) => a.x - b.x);
  // 이름 자리: 아래 → 위 → 더 아래 → 더 위 중 이미 붙은 이름과 겹치지 않는 첫 자리 (목성 원반도 피해요)
  const SLOTS = [20, -10, 34, -24];
  const taken = [{ x: 0, slot: -10, width: 30 }, { x: 0, slot: 20, width: 30 }];   // 목성 원반 위아래
  for (const m of list.filter((v) => !v.hidden)) {
    svgEl('circle', { cx: m.x, cy: m.y, r: 2.2, fill: '#fff' }, fig);
    const width = m.name.length * 12 + 6;
    const slot = SLOTS.find((y) => !taken.some((t) => t.slot === y && Math.abs(t.x - m.x) < (width + t.width) / 2))
      ?? SLOTS[SLOTS.length - 1];
    taken.push({ x: m.x, slot, width });
    const label = svgEl('text', { class: 'fig-label', x: m.x, y: m.y + slot }, fig);
    label.textContent = m.name;
  }
}

function drawSaturn(tiltDeg) {
  const fig = sheet.figure;
  const rx = 44, ry = Math.max(1.5, rx * Math.sin(Math.abs(tiltDeg) * Math.PI / 180));
  const ring = (front) => {
    const sweep = front ? 0 : 1;                       // 뒤쪽 절반 → 행성 → 앞쪽 절반 순서로 그려요
    for (const [k, w] of [[1, 5], [0.78, 3]]) {
      svgEl('path', { class: 'fig-ring', 'stroke-width': w,
        d: `M${-rx * k},0 A${rx * k},${ry * k} 0 0 ${sweep} ${rx * k},0` }, fig);
    }
  };
  ring(false);
  svgEl('ellipse', { rx: 18, ry: 16.5, fill: '#e3cf9c' }, fig);
  ring(true);
}

// ---------------------------------------------------------------------------
// 열기 / 닫기
// ---------------------------------------------------------------------------

// 나침반 위 천체 아이콘 터치 (겹치면 맨 위에 그려진 안내 대상이 먼저 잡혀요)
el.orbits.addEventListener('click', (e) => {
  const g = e.target.closest('.body');
  if (g) openSheet(g.dataset.id);
});
// 아래 방위 줄 터치 → 지금 안내 중인 천체
el.readout.addEventListener('click', () => openSheet(state.target));

sheet.root.addEventListener('click', (e) => { if (e.target.closest('[data-close-sheet]')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.id) closeSheet(); });

// 손잡이를 아래로 끌어 닫기
let dragStart = null;
const grab = $('sheet-grab');
grab.addEventListener('pointerdown', (e) => {
  dragStart = e.clientY;
  sheet.panel.style.transition = 'none';
  grab.setPointerCapture(e.pointerId);
});
grab.addEventListener('pointermove', (e) => {
  if (dragStart == null) return;
  sheet.panel.style.transform = `translateY(${Math.max(0, e.clientY - dragStart)}px)`;
});
grab.addEventListener('pointerup', (e) => {
  if (dragStart == null) return;
  const moved = e.clientY - dragStart;
  dragStart = null;
  sheet.panel.style.transition = '';
  if (moved > 80) closeSheet();
  else sheet.panel.style.transform = '';
});
