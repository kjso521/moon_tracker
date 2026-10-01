'use strict';

const CONFIG = {
  matchDeg: 3,          // 이 각도 안이면 "일치" (노란색)
  approachDeg: 60,      // 이 각도 안이면 점점 밝아짐
  idleOpacity: 0.24,    // COMPASS_OPACITY_DEFAULT
  otherOpacity: 0.6,    // 안내 대상이 아닌 천체의 투명도
  labelDeg: 20,         // 삼각형 기준 이 각도 안의 천체는 이름을 띄워요
  defaultOffset: -9,    // 한국 기준 자기편각(°). 진북 방위 = 자북 방위 + 편각
  defaultLocation: { lat: 37.5665, lon: 126.978, name: '서울' }, // GPS를 못 받을 때
  smoothing: 0.2,       // 센서 흔들림 완화 (0~1, 클수록 빠르게 반응)
  refreshMs: 30_000,
};

// 나침반 그리기 (단위: px). 3D 모드에서는 폰을 세운 만큼 시점을 기울여 투영해요.
const COMPASS = {
  marker: 28,           // 달 아이콘 지름
  gap: 12,              // 원과 천체 아이콘 사이 간격
  liftPer90: 1.1,       // 고도 90°일 때 떠오르는 높이 (원 반지름 대비)
  maxTiltView: 72,      // 폰을 완전히 세워도 원판이 선이 되지 않게 시점 기울기를 제한(°)
  focal: 700,           // 원근감 (작을수록 강함)
};

// 카테고리 → 설정 서랍에서 접었다 펼 수 있는 묶음
const GROUPS = [
  { id: 'solar', name: '태양계', open: true },
  { id: 'constellation', name: '별자리' },
  { id: 'deepsky', name: '성운·은하' },
];

// 태양계 천체의 id는 Astronomy.Body의 이름과 같아요.
// 별자리와 성운·은하는 고정된 좌표(J2000 적경 ra[시], 적위 dec[°])의 기준점 하나로 방향을 잡아요.
const STAR_COLOR = '#cfd8ff';
const DEEPSKY_COLOR = '#e1bee7';
const star = (id, name, season, ra, dec, ref) => ({ id, name, season, ra, dec, ref, group: 'constellation', color: STAR_COLOR });
const deepsky = (id, name, ra, dec, ref) => ({ id, name, ra, dec, ref, group: 'deepsky', color: DEEPSKY_COLOR });

const BODIES = [
  { id: 'Moon',    name: '달',   group: 'solar', riseLabel: '월출', setLabel: '월몰' },
  { id: 'Sun',     name: '태양', group: 'solar', riseLabel: '일출', setLabel: '일몰', color: '#ffb74d' },
  { id: 'Mercury', name: '수성', group: 'solar', color: '#b0bec5' },
  { id: 'Venus',   name: '금성', group: 'solar', color: '#fff3c4' },
  { id: 'Mars',    name: '화성', group: 'solar', color: '#ff7043' },
  { id: 'Jupiter', name: '목성', group: 'solar', color: '#ffe0b2' },
  { id: 'Saturn',  name: '토성', group: 'solar', color: '#ffd54f' },

  star('Polaris',     '북극성',       '사계절',  2.530,  89.26, '북극성 (작은곰자리)'),
  star('BigDipper',   '북두칠성',     '사계절', 12.334,  55.58, '국자 중심 (큰곰자리)'),
  star('Cassiopeia',  '카시오페이아', '사계절',  0.945,  60.72, 'W자 가운데 별'),
  star('Leo',         '사자자리',     '봄',     10.139,  11.97, '레굴루스'),
  star('Bootes',      '목동자리',     '봄',     14.261,  19.18, '아르크투루스'),
  star('Virgo',       '처녀자리',     '봄',     13.420, -11.16, '스피카'),
  star('Lyra',        '거문고자리',   '여름',   18.616,  38.78, '베가 (직녀성)'),
  star('Aquila',      '독수리자리',   '여름',   19.846,   8.87, '알타이르 (견우성)'),
  star('Cygnus',      '백조자리',     '여름',   20.690,  45.28, '데네브'),
  star('Scorpius',    '전갈자리',     '여름',   16.490, -26.43, '안타레스'),
  star('Sagittarius', '궁수자리',     '여름',   18.650, -28.90, '주전자 모양 중심'),
  star('Pegasus',     '페가수스자리', '가을',   23.626,  21.89, '가을철 대사각형 중심'),
  star('Andromeda',   '안드로메다자리', '가을',  1.162,  35.62, '미라크'),
  star('Orion',       '오리온자리',   '겨울',    5.604,  -1.20, '벨트(삼태성) 가운데'),
  star('Taurus',      '황소자리',     '겨울',    4.599,  16.51, '알데바란'),
  star('Gemini',      '쌍둥이자리',   '겨울',    7.666,  29.96, '카스토르·폴룩스 사이'),
  star('CanisMajor',  '큰개자리',     '겨울',    6.752, -16.72, '시리우스'),

  deepsky('MilkyWayCore', '은하수 중심',     17.761, -29.01, '궁수자리 A*'),
  deepsky('M31',          '안드로메다 은하',  0.712,  41.27, 'M31'),
  deepsky('M45',          '플레이아데스',     3.791,  24.12, 'M45 · 좀생이별'),
];
const bodyById = Object.fromEntries(BODIES.map((b) => [b.id, b]));

const $ = (id) => document.getElementById(id);
const el = {
  compass: $('compass'), svg: $('compass-svg'), orbits: $('orbits'),
  face: $('face'), ring: $('ring'), disc: $('disc'), arrow: $('arrow'),
  simTiltRow: $('sim-tilt-row'), simTilt: $('sim-tilt'), simTiltValue: $('sim-tilt-value'),
  mode3d: $('mode-3d'), allBodies: $('all-bodies'),
  readout: $('readout'), guide: $('guide'), hint: $('hint'),
  alt: $('alt'), d2Label: $('d2-label'), d2: $('d2'),
  riseLabel: $('rise-label'), rise: $('rise'), setLabel: $('set-label'), set: $('set'),
  status: $('status'),
  sim: $('sim'), simSlider: $('sim-slider'), simValue: $('sim-value'),
  timeText: $('time-text'), timePicker: $('time-picker'), timeNow: $('time-now'), timeSlider: $('time-slider'),
  drawer: $('drawer'), menuBtn: $('menu-btn'), bodyOptions: $('body-options'), drawerStatus: $('drawer-status'),
  offset: $('offset'), offsetLabel: $('offset-label'), calibrate: $('calibrate'), resetOffset: $('reset-offset'),
  start: $('start'), startBtn: $('start-btn'),
};

// ---------------------------------------------------------------------------
// 저장 (localStorage는 막혀 있을 수 있어서 항상 try/catch)
// ---------------------------------------------------------------------------

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(`moonTracker.${key}`);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(`moonTracker.${key}`, JSON.stringify(value)); } catch { /* 저장 못 해도 동작 */ }
}

const savedBodies = load('bodies', ['Moon']).filter((id) => bodyById[id]);
const state = {
  lat: CONFIG.defaultLocation.lat,
  lon: CONFIG.defaultLocation.lon,
  location: `기본 위치(${CONFIG.defaultLocation.name})`,
  locationOk: false,
  magHeading: null,     // 센서가 준 자북 기준 방위 (스무딩 적용)
  pitch: null,          // 후면 카메라가 향하는 고도. 폰을 세웠을 때만 값이 있음
  tilt: 0,              // 폰을 세운 정도 (0 눕힘 ~ 90 세움). 3D 나침반에 사용
  simTilt: 0,
  mode3d: load('mode3d', true),
  size: 0,              // 나침반 SVG 한 변(px)
  sensor: '대기 중',
  sensorSeen: false,
  simHeading: 0,
  offset: Number(load('offset', CONFIG.defaultOffset)) || 0,
  enabled: savedBodies.length ? savedBodies : ['Moon'],
  target: 'Moon',
  anchor: null,         // 날짜 선택기로 고른 기준 시각. null이면 "지금"
  shiftMin: 0,          // 시간 막대로 옮긴 분
  positions: {},        // id → 계산 결과
  markers: {},          // id → DOM
  notice: null,         // 설정 서랍에 잠깐 띄울 안내
  wasMatch: false,
};

// ---------------------------------------------------------------------------
// 천문 계산 (core.py MoonEngine의 JS 버전)
// ---------------------------------------------------------------------------

// withEvents: 출몰 시각 검색은 무거워서, 안내 중인 천체만 계산해요.
function computeBody(body, date, observer, withEvents) {
  const { Body, Equator, Horizon, MoonPhase, Illumination, SearchRiseSet, DefineStar } = Astronomy;
  let target = Body[body.id];
  if (body.ra != null) {
    // 고정 좌표는 임시 별(Star1)로 등록하면 세차 보정과 출몰 계산을 행성과 똑같이 쓸 수 있어요.
    DefineStar(Body.Star1, body.ra, body.dec, 1000);
    target = Body.Star1;
  }
  const eq = Equator(target, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  const result = {
    azimuth: hor.azimuth,          // 0~360, 진북 기준 시계방향
    altitude: hor.altitude,        // 지평선 위 고도
    rise: null,
    set: null,
    hasEvents: Boolean(withEvents),
  };
  if (withEvents) {
    const rise = SearchRiseSet(target, observer, +1, date, 2);
    const set = SearchRiseSet(target, observer, -1, date, 2);
    result.rise = rise ? rise.date : null;
    result.set = set ? set.date : null;
  }
  if (body.id === 'Moon') {
    result.cycle = MoonPhase(date) / 360;                              // 0 삭 → 0.5 보름 → 1 삭
    result.illumination = Illumination(target, date).phase_fraction;   // 0~1 밝은 면적
  } else if (body.group === 'solar') {
    result.magnitude = Illumination(target, date).mag;                 // 겉보기 등급 (작을수록 밝음)
  }
  return result;
}

// 받침 있는 이름에는 "이", 없으면 "가"
function subjectParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '이' : '가';
}

const DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compassDirection = (deg) => DIRECTIONS[Math.floor((deg + 11.25) / 22.5) % 16];

const PHASE_NAMES = ['삭', '초승달', '상현달', '차가는 달', '보름달', '기우는 달', '하현달', '그믐달'];
const phaseName = (cycle) => PHASE_NAMES[Math.round(cycle * 8) % 8];

// 반지름 1인 달의 밝은 부분을 SVG path로 그려요 (phase.py의 마스크+타원 방식과 같은 원리).
// 밝은 쪽 반원 + 명암 경계(터미네이터) 타원. 타원의 가로 반지름은 |cos(2π·cycle)|.
function moonPath(cycle) {
  const rx = Math.abs(Math.cos(2 * Math.PI * cycle)).toFixed(4);
  const limbSweep = cycle < 0.5 ? 1 : 0;                    // 차는 달은 오른쪽, 기우는 달은 왼쪽이 밝음
  const terminatorSweep = (cycle % 0.5) < 0.25 ? 0 : 1;     // 경계 타원이 오른쪽(0) / 왼쪽(1)으로 볼록
  return `M0,-1A1,1 0 0 ${limbSweep} 0,1A${rx},1 0 0 ${terminatorSweep} 0,-1Z`;
}

// ---------------------------------------------------------------------------
// 시간
// ---------------------------------------------------------------------------

const isLive = () => state.anchor == null && state.shiftMin === 0;
const targetTime = () => new Date((state.anchor ?? Date.now()) + state.shiftMin * 60_000);

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const hhmm = (d) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

function dayLabel(date, base = new Date()) {
  const days = Math.round((startOfDay(date) - startOfDay(base)) / 86_400_000);
  if (days === 0) return '오늘';
  if (days === 1) return '내일';
  if (days === -1) return '어제';
  return `${date.getMonth() + 1}/${date.getDate()}(${'일월화수목금토'[date.getDay()]})`;
}

// 출몰 시각은 "지금 보고 있는 시각" 기준으로 오늘/내일을 붙여요.
function formatEvent(date) {
  if (!date) return '--';
  const label = dayLabel(date, targetTime());
  return label === '오늘' ? hhmm(date) : `${label} ${hhmm(date)}`;
}

function toInputValue(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderTime() {
  const t = targetTime();
  el.timeText.textContent = isLive() ? `지금 · ${hhmm(t)}` : `${dayLabel(t)} ${hhmm(t)}`;
  el.timeText.parentElement.classList.toggle('custom', !isLive());
  el.timeNow.hidden = isLive();
  el.timePicker.value = toInputValue(t);
}

// ---------------------------------------------------------------------------
// 방향 센서
// ---------------------------------------------------------------------------

const normalize = (deg) => ((deg % 360) + 360) % 360;
const signedDiff = (to, from) => normalize(to - from + 180) - 180; // -180~180

// alpha/beta/gamma(W3C DeviceOrientation, Z-X'-Y'')로 폰이 가리키는 방향을 구해요.
// 폰을 눕히면 윗변 방향, 세우면 후면 카메라 방향을 사용해요.
function orientationToAim(alpha, beta, gamma) {
  const r = Math.PI / 180;
  const sa = Math.sin(alpha * r), ca = Math.cos(alpha * r);
  const sb = Math.sin(beta * r), cb = Math.cos(beta * r);
  const sg = Math.sin(gamma * r), cg = Math.cos(gamma * r);

  // 월드 좌표: x = 동, y = 북, z = 위
  const top = [-sa * cb, ca * cb, sb];
  const back = [-ca * sg - sa * sb * cg, -sa * sg + ca * sb * cg, -cb * cg];

  const horizontal = (v) => Math.hypot(v[0], v[1]);
  const upright = horizontal(back) > horizontal(top);
  const v = upright ? back : top;
  return {
    heading: normalize(Math.atan2(v[0], v[1]) / r),
    pitch: upright ? Math.asin(Math.max(-1, Math.min(1, back[2]))) / r : null,
  };
}

function smoothAngle(prev, next) {
  if (prev == null) return next;
  return normalize(prev + signedDiff(next, prev) * CONFIG.smoothing);
}

function onOrientation(e) {
  let aim;
  if (typeof e.webkitCompassHeading === 'number') {
    // iOS: 자북 기준 방위를 따로 줘요. 고도는 beta/gamma로 계산해요.
    aim = { heading: e.webkitCompassHeading, pitch: orientationToAim(0, e.beta, e.gamma).pitch };
    state.sensor = '나침반(iOS)';
  } else if ((e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null) {
    aim = orientationToAim(e.alpha, e.beta, e.gamma);
    state.sensor = '나침반';
  } else {
    return; // 북쪽 기준이 없는 상대값은 쓸 수 없어요
  }

  if (!state.sensorSeen) {
    state.sensorSeen = true;
    el.sim.hidden = true;
  }
  state.magHeading = smoothAngle(state.magHeading, aim.heading);
  state.pitch = aim.pitch;
  const tilt = Math.max(0, Math.min(90, e.beta ?? 0));
  state.tilt += (tilt - state.tilt) * CONFIG.smoothing;
  scheduleRender();
}

function currentHeading() {
  return state.sensorSeen ? normalize(state.magHeading + state.offset) : state.simHeading;
}

let listening = false;
async function startSensors(fromGesture) {
  // iOS 13+는 사용자가 버튼을 누른 순간에만 권한 요청이 가능해요.
  if (fromGesture && needsOrientationPermission()) {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') state.sensor = '권한 거부됨';
    } catch (err) {
      state.sensor = `권한 요청 실패: ${err.message}`;
    }
  }

  if (!listening) {
    const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(eventName, onOrientation);
    listening = true;
  }

  setTimeout(() => {
    if (state.sensorSeen) return;
    // 신호가 없고 권한 요청이 가능한 환경(iOS)이면 시작 버튼을 다시 보여줘요.
    if (!fromGesture && needsOrientationPermission()) {
      el.start.hidden = false;
      return;
    }
    if (state.sensor === '대기 중') state.sensor = '없음';
    el.sim.hidden = false;
    render();
  }, 1500);
}

const needsOrientationPermission = () =>
  typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

// ---------------------------------------------------------------------------
// 위치
// ---------------------------------------------------------------------------

function startGeolocation() {
  const fallback = (reason) => {
    state.location = `기본 위치(${CONFIG.defaultLocation.name}) · ${reason}`;
    state.locationOk = false;
    render();
  };
  if (!window.isSecureContext) return fallback('HTTPS가 아니라 GPS를 쓸 수 없어요');
  if (!navigator.geolocation) return fallback('GPS 미지원');

  state.location = 'GPS 찾는 중…';
  navigator.geolocation.watchPosition(
    (pos) => {
      state.lat = pos.coords.latitude;
      state.lon = pos.coords.longitude;
      state.location = `GPS ${state.lat.toFixed(3)}, ${state.lon.toFixed(3)} (±${Math.round(pos.coords.accuracy)}m)`;
      state.locationOk = true;
      updatePositions();
    },
    (err) => fallback(err.code === err.PERMISSION_DENIED ? '위치 권한 거부됨' : err.message),
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
  );
}

// ---------------------------------------------------------------------------
// 천체 마커와 선택 칩
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}
const SPARKLE = 'M0,-1 L0.24,-0.24 L1,0 L0.24,0.24 L0,1 L-0.24,0.24 L-1,0 L-0.24,-0.24Z';

// 천체 하나 = 원판 위 발자국(foot) + 점선 기둥(stalk) + 아이콘 + 이름.
// 아이콘은 항상 화면을 정면으로 보도록(빌보드) 위치만 투영하고 모양은 그대로 그려요.
function createMarker(body) {
  const g = svgEl('g', { class: 'body' });
  const stalk = svgEl('line', { class: 'stalk' }, g);
  const foot = svgEl('ellipse', { class: 'foot' }, g);
  const icon = svgEl('g', {}, g);
  const shape = svgEl('g', {}, icon);
  let lit = null;
  let radius;                       // 이름표를 띄울 높이 계산용
  if (body.id === 'Moon') {
    radius = COMPASS.marker / 2;
    const unit = svgEl('g', { transform: `scale(${radius})` }, shape);
    svgEl('circle', { class: 'moon-dark', r: 1 }, unit);
    lit = svgEl('path', { class: 'moon-lit' }, unit);
  } else if (body.group === 'solar') {
    radius = 6;
    svgEl('circle', { r: 6, fill: body.color }, shape);
    svgEl('circle', { class: 'focus-ring', r: 9.5 }, shape);
  } else if (body.group === 'constellation') {
    radius = 7;
    svgEl('path', { d: SPARKLE, fill: body.color, transform: 'scale(7)' }, shape);
  } else {
    radius = 8;
    svgEl('circle', { r: 8, fill: 'url(#nebula-glow)' }, shape);
    svgEl('circle', { class: 'focus-ring', r: 9.5 }, shape);
  }
  const label = svgEl('text', { class: 'body-name' }, g);
  label.textContent = body.name;
  return { g, stalk, foot, icon, shape, lit, label, radius, sparkle: body.group === 'constellation' };
}

function rebuildBodies() {
  el.orbits.replaceChildren();
  state.markers = {};
  for (const body of BODIES.filter((b) => state.enabled.includes(b.id))) {
    const m = createMarker(body);
    state.markers[body.id] = m;
    el.orbits.append(m.g);
  }
  updatePositions();
}

function buildBodyOptions() {
  for (const group of GROUPS) {
    const details = document.createElement('details');
    details.className = 'group';
    details.open = Boolean(group.open);
    const summary = document.createElement('summary');
    const title = document.createElement('span');
    title.textContent = group.name;
    const count = document.createElement('span');
    count.className = 'group-count';
    count.dataset.group = group.id;
    summary.append(title, count);

    const list = document.createElement('div');
    list.className = 'body-options';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'group-all';
    all.dataset.group = group.id;
    all.addEventListener('click', () => toggleGroup(group.id));
    list.append(all);
    let season = null;
    for (const body of BODIES.filter((b) => b.group === group.id)) {
      if (body.season && body.season !== season) {   // 별자리는 계절별 소제목
        season = body.season;
        const heading = document.createElement('p');
        heading.className = 'season';
        heading.textContent = season;
        list.append(heading);
      }
      list.append(createBodyOption(body));
    }
    details.append(summary, list);
    el.bodyOptions.append(details);
  }
  updateGroupCounts();
}

function updateGroupCounts() {
  for (const count of el.bodyOptions.querySelectorAll('.group-count')) {
    const total = BODIES.filter((b) => b.group === count.dataset.group);
    const on = total.filter((b) => state.enabled.includes(b.id)).length;
    count.textContent = on ? `${on}/${total.length}` : `${total.length}`;
    count.classList.toggle('active', on > 0);
  }
  for (const button of el.bodyOptions.querySelectorAll('.group-all')) {
    const ids = BODIES.filter((b) => b.group === button.dataset.group).map((b) => b.id);
    button.textContent = ids.every((id) => state.enabled.includes(id)) ? '전체 해제' : '전체 선택';
  }
  el.allBodies.textContent = BODIES.every((b) => state.enabled.includes(b.id)) ? '모두 해제' : '모두 선택';
}

function createBodyOption(body) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = body.id;
  input.checked = state.enabled.includes(body.id);
  input.addEventListener('change', () => toggleBody(body.id, input));

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.setProperty('--body-color', body.color ?? '#fff');

  label.append(input, swatch, body.name);
  return label;
}

function toggleBody(id, input) {
  const next = input.checked ? [...state.enabled, id] : state.enabled.filter((b) => b !== id);
  if (!next.length) {           // 최소 하나는 켜져 있어야 해요
    input.checked = true;
    return;
  }
  setEnabled(next);
}

// 카테고리 전체 선택/해제. 이미 다 켜져 있으면 해제, 아니면 전부 켜요.
function toggleGroup(groupId) {
  const ids = BODIES.filter((b) => b.group === groupId).map((b) => b.id);
  const allOn = ids.every((id) => state.enabled.includes(id));
  let next = allOn ? state.enabled.filter((id) => !ids.includes(id)) : [...state.enabled, ...ids];
  if (!next.length) next = ['Moon']; // 전부 꺼지면 달은 남겨요
  setEnabled(next);
}

// 모든 천체 전체 선택/해제 (전부 해제하면 달만 남아요)
function toggleAll() {
  const allOn = BODIES.every((b) => state.enabled.includes(b.id));
  setEnabled(allOn ? ['Moon'] : BODIES.map((b) => b.id));
}

function setEnabled(ids) {
  state.enabled = BODIES.map((b) => b.id).filter((id) => ids.includes(id)); // 목록 순서 유지
  save('bodies', state.enabled);
  for (const input of el.bodyOptions.querySelectorAll('input[type="checkbox"]')) {
    input.checked = state.enabled.includes(input.value);
  }
  updateGroupCounts();
  rebuildBodies();
}

// ---------------------------------------------------------------------------
// 화면
// ---------------------------------------------------------------------------

function updatePositions() {
  const date = targetTime();
  const observer = new Astronomy.Observer(state.lat, state.lon, 0);
  state.positions = {};
  for (const id of state.enabled) {
    state.positions[id] = computeBody(bodyById[id], date, observer, false);
  }
  const moon = state.positions.Moon;
  if (moon) state.markers.Moon.lit.setAttribute('d', moonPath(moon.cycle));
  renderTime();
  render();
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function levelFor(diff) {
  if (diff <= CONFIG.matchDeg) return { level: 'match', opacity: 1 };
  if (diff <= CONFIG.approachDeg) {
    const t = (diff - CONFIG.matchDeg) / (CONFIG.approachDeg - CONFIG.matchDeg);
    return { level: 'approach', opacity: 1 - t * (1 - CONFIG.idleOpacity) };
  }
  return { level: 'idle', opacity: CONFIG.idleOpacity };
}

// 출몰 시각 검색은 무거워서, 안내 대상이 정해질 때 그 천체만 계산해요.
function ensureEvents(id) {
  const pos = state.positions[id];
  if (!pos || pos.hasEvents) return;
  const observer = new Astronomy.Observer(state.lat, state.lon, 0);
  Object.assign(pos, computeBody(bodyById[id], targetTime(), observer, true));
}

// 안내 대상 = 폰이 가리키는 방향에서 정확히 가장 가까운 천체.
// 여유 각도를 두지 않아서, 겹친 두 천체의 경계는 정확히 가운데 각도예요.
// 지평선 위에 있는 천체를 우선하고, 하나도 없을 때만 지평선 아래까지 봐요.
function pickFocus(relatives) {
  const ids = Object.keys(relatives);
  const visible = ids.filter((id) => state.positions[id].altitude >= 0);
  let nearest = null;
  for (const id of visible.length ? visible : ids) {
    if (nearest == null || Math.abs(relatives[id]) < Math.abs(relatives[nearest])) nearest = id;
  }
  return nearest;
}

// 삼각형 근처(±labelDeg)의 천체에만 이름을 띄워요.
function namedBodies(relatives) {
  return new Set(Object.keys(relatives).filter((id) => Math.abs(relatives[id]) <= CONFIG.labelDeg));
}

// ---------------------------------------------------------------------------
// 나침반 그리기: 3D → 2D 투영
// 월드 좌표: x = 오른쪽, y = 앞(폰이 향한 방향), z = 위. 나침반은 z = 0 평면에 놓여 있어요.
// 폰을 세운 만큼 시점을 x축으로 기울이면, 위에서 내려다보던 원이 바닥에 놓인 원판처럼 보여요.
// ---------------------------------------------------------------------------

const currentTilt = () => (state.sensorSeen ? state.tilt : state.simTilt);

function drawCompass(relatives, named, opacity) {
  const w = state.size;
  if (!w) return;
  const R = w / 2 - (COMPASS.marker + COMPASS.gap);
  const ratio = state.mode3d ? currentTilt() / 90 : 0;           // 0 = 평면, 1 = 완전히 세움
  const t = ratio * COMPASS.maxTiltView * Math.PI / 180;
  const cosT = Math.cos(t), sinT = Math.sin(t);
  const liftMax = R * COMPASS.liftPer90;
  // 세우면 천체가 원판 위로 떠오르니, 원판을 그 절반 정도만 내려서 전체가 가운데에 오게 해요.
  const shift = liftMax * sinT / 4;

  const project = (x, y, z) => {
    const up = y * cosT + z * sinT;
    const depth = -y * sinT + z * cosT;
    const k = COMPASS.focal / (COMPASS.focal - depth);
    return { x: x * k, y: -up * k + shift, k, depth };
  };

  // 원 + 원판 (96개 점)
  let d = '';
  for (let i = 0; i <= 96; i++) {
    const th = (i / 96) * 2 * Math.PI;
    const p = project(R * Math.sin(th), R * Math.cos(th), 0);
    d += `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }
  d += 'Z';
  el.ring.setAttribute('d', d);
  el.disc.setAttribute('d', d);
  const grey = Math.round(27 * ratio);                           // 평면에선 배경색, 세울수록 #1b1b1b
  el.disc.setAttribute('fill', `rgb(${grey},${grey},${grey})`);

  // 삼각형: 원의 맨 앞(먼 쪽) 점에 밑변이 2px 겹치게. 원판이 겹친 부분을 가려요.
  const tip = project(0, R, 0);
  const aw = 7 * tip.k, base = tip.y + 2 * tip.k, apex = tip.y - 6 * tip.k;
  el.arrow.setAttribute('d', `M${(tip.x - aw).toFixed(2)},${base.toFixed(2)}L${(tip.x + aw).toFixed(2)},${base.toFixed(2)}L${tip.x.toFixed(2)},${apex.toFixed(2)}Z`);

  // 천체
  const Rm = R + COMPASS.gap + COMPASS.marker / 2;
  const flipMoon = state.lat < 0;                                // 남반구에서는 달의 좌우가 뒤집혀 보여요
  const depthOrder = [];
  for (const id of state.enabled) {
    const pos = state.positions[id];
    const m = state.markers[id];
    if (!pos || !m) continue;
    const a = relatives[id] * Math.PI / 180;
    const bx = Rm * Math.sin(a), by = Rm * Math.cos(a);
    const z = (pos.altitude / 90) * liftMax * ratio;
    const foot = project(bx, by, 0);
    const top = project(bx, by, z);
    const isFocus = id === state.target;

    const sx = (id === 'Moon' && flipMoon ? -1 : 1) * top.k;
    m.icon.setAttribute('transform', `translate(${top.x.toFixed(2)} ${top.y.toFixed(2)}) scale(${sx.toFixed(3)} ${top.k.toFixed(3)})`);
    if (m.sparkle) m.shape.setAttribute('transform', isFocus ? 'scale(1.5)' : '');

    const showStalk = ratio > 0.05 && pos.altitude > 0;
    m.stalk.setAttribute('x1', foot.x.toFixed(2)); m.stalk.setAttribute('y1', foot.y.toFixed(2));
    m.stalk.setAttribute('x2', top.x.toFixed(2));  m.stalk.setAttribute('y2', top.y.toFixed(2));
    m.stalk.style.opacity = showStalk ? 1 : 0;
    m.foot.setAttribute('cx', foot.x.toFixed(2)); m.foot.setAttribute('cy', foot.y.toFixed(2));
    m.foot.setAttribute('rx', (2.2 * foot.k).toFixed(2)); m.foot.setAttribute('ry', (2.2 * foot.k * cosT).toFixed(2));
    m.foot.style.opacity = (0.5 * ratio).toFixed(3);

    // 이름표: 항상 자기 아이콘 바로 위. 겹치면 겹치는 대로 두고,
    // 안내 대상을 맨 마지막에 그려서 밝은 이름이 위에 오게 해요.
    const isNamed = named.has(id);
    m.g.classList.toggle('named', isNamed);
    if (isNamed) {
      m.label.setAttribute('x', top.x.toFixed(2));
      m.label.setAttribute('y', (top.y - (m.radius * (isFocus && m.sparkle ? 1.5 : 1) + 4) * top.k).toFixed(2));
    }
    m.g.classList.toggle('focus', isFocus);

    const baseOpacity = isFocus ? opacity : CONFIG.otherOpacity;
    m.g.style.opacity = (pos.altitude < 0 ? baseOpacity * 0.45 : baseOpacity).toFixed(3); // 지평선 아래는 흐리게
    depthOrder.push({ m, key: isFocus ? Infinity : top.depth });  // 먼 것부터, 안내 대상은 맨 위
  }
  depthOrder.sort((p, q) => p.key - q.key);
  const order = depthOrder.map((o) => o.m.g);
  if (order.some((g, i) => el.orbits.children[i] !== g)) el.orbits.append(...order);
}

function render() {
  const heading = currentHeading();

  const relatives = {};  // id → 상대 방위 (+면 오른쪽에 있음)
  for (const id of state.enabled) {
    if (state.positions[id]) relatives[id] = signedDiff(state.positions[id].azimuth, heading);
  }
  const focus = pickFocus(relatives);
  const named = namedBodies(relatives);
  if (!focus) return;
  if (focus !== state.target) {
    state.target = focus;
    state.wasMatch = false;
  }
  ensureEvents(focus);
  const target = state.positions[focus];
  const targetRelative = relatives[focus];

  const diff = Math.abs(targetRelative);
  const { level, opacity } = levelFor(diff);
  el.compass.dataset.level = level;
  el.compass.style.setProperty('--opacity', opacity.toFixed(3));
  document.body.classList.toggle('compass-match', level === 'match');

  drawCompass(relatives, named, opacity);

  const isMatch = level === 'match';
  if (isMatch && !state.wasMatch) navigator.vibrate?.(40);
  state.wasMatch = isMatch;

  const body = bodyById[state.target];
  // 여러 천체를 켰을 때만 이름을 앞에 붙여요 (궤도 위에는 이름표를 두지 않아요)
  const azText = `${target.azimuth.toFixed(1)}° ${compassDirection(target.azimuth)}`;
  el.readout.textContent = state.enabled.length > 1 ? `${body.name} · ${azText}` : azText;
  el.guide.textContent = isMatch
    ? `${body.name} 방향이에요!`
    : `${targetRelative > 0 ? '오른쪽' : '왼쪽'}으로 ${Math.round(diff)}° 돌리세요`;

  if (target.altitude < 0) {
    const when = target.rise ? ` · ${body.riseLabel ?? '뜨는 시각'} ${formatEvent(target.rise)}` : '';
    el.hint.textContent = `${body.name}${subjectParticle(body.name)} 지평선 아래에 있어요${when}`;
  } else if (state.pitch != null) {
    const dAlt = target.altitude - state.pitch;
    el.hint.textContent = Math.abs(dAlt) <= CONFIG.matchDeg
      ? '높이도 맞았어요'
      : `${dAlt > 0 ? '위로' : '아래로'} ${Math.round(Math.abs(dAlt))}° 기울이세요`;
  } else {
    el.hint.textContent = state.sensorSeen ? '폰을 세우면 높이도 안내해요' : ' ';
  }

  el.alt.textContent = `${target.altitude.toFixed(1)}°`;
  if (state.target === 'Moon') {
    el.d2Label.textContent = '위상';
    el.d2.textContent = `${phaseName(target.cycle)} · ${Math.round(target.illumination * 100)}%`;
  } else if (body.group === 'solar') {
    el.d2Label.textContent = '밝기';
    el.d2.textContent = `${target.magnitude.toFixed(1)}등급`;
  } else {
    el.d2Label.textContent = '기준점';
    el.d2.textContent = body.ref;
  }
  el.riseLabel.textContent = body.riseLabel ?? '뜨는 시각';
  el.setLabel.textContent = body.setLabel ?? '지는 시각';
  // 이틀 안에 뜨고 지는 일이 없으면: 지평선 위면 주극성(지지 않음), 아래면 뜨지 않음
  const noEvents = !target.rise && !target.set;
  const allDay = target.altitude >= 0 ? '지지 않음' : '뜨지 않음';
  el.rise.textContent = noEvents ? allDay : formatEvent(target.rise);
  el.set.textContent = noEvents ? allDay : formatEvent(target.set);

  renderStatus();
}

function renderStatus() {
  const sensorText = state.sensorSeen ? state.sensor : `시뮬레이션 (센서 ${state.sensor})`;
  el.drawerStatus.textContent = [`위치: ${state.location}`, `방향: ${sensorText}`, state.notice].filter(Boolean).join('\n');
  el.offsetLabel.textContent = `(${state.offset >= 0 ? '+' : ''}${state.offset.toFixed(1)}°)`;

  // 메인 화면에는 문제가 있을 때만 한 줄로 보여줘요.
  const problems = [];
  if (el.start.hidden && !state.locationOk && state.location !== 'GPS 찾는 중…') problems.push(state.location);
  el.status.hidden = problems.length === 0;
  el.status.textContent = problems.join(' · ');
}

// ---------------------------------------------------------------------------
// 이벤트
// ---------------------------------------------------------------------------

// 방위 보정
function setOffset(value) {
  state.offset = Math.round(value * 10) / 10;
  el.offset.value = state.offset;
  save('offset', state.offset);
  render();
}
el.offset.value = state.offset;
el.offset.addEventListener('change', () => {
  const v = parseFloat(el.offset.value);
  if (Number.isFinite(v)) setOffset(v);
});
el.calibrate.addEventListener('click', () => {
  const target = state.positions[state.target];
  if (!state.sensorSeen || !target) {
    state.notice = '⚠ 방향 센서가 있어야 보정할 수 있어요.';
    renderStatus();
    return;
  }
  if (!isLive()) {
    state.notice = '⚠ 보정은 "지금" 시각에서만 할 수 있어요. 시간을 지금으로 되돌려 주세요.';
    renderStatus();
    return;
  }
  setOffset(signedDiff(target.azimuth, state.magHeading));
  closeDrawer();
});
el.resetOffset.addEventListener('click', () => setOffset(CONFIG.defaultOffset));

// 설정 서랍
function openDrawer() { el.drawer.setAttribute('aria-hidden', 'false'); }
function closeDrawer() { el.drawer.setAttribute('aria-hidden', 'true'); state.notice = null; }
el.menuBtn.addEventListener('click', openDrawer);
el.drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });

// 시간
el.timeSlider.addEventListener('input', () => {
  state.shiftMin = Number(el.timeSlider.value);
  scheduleUpdate();
});
el.timePicker.addEventListener('change', () => {
  const picked = new Date(el.timePicker.value);
  if (Number.isNaN(picked.getTime())) return;
  state.anchor = picked.getTime();
  state.shiftMin = 0;
  el.timeSlider.value = 0;
  updatePositions();
});
el.timeNow.addEventListener('click', () => {
  state.anchor = null;
  state.shiftMin = 0;
  el.timeSlider.value = 0;
  updatePositions();
});

// 시간 막대를 끌 때는 프레임당 한 번만 다시 계산
let updateQueued = false;
function scheduleUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(() => { updateQueued = false; updatePositions(); });
}

// 3D 나침반 켜기/끄기 (제목 줄 오른쪽 버튼)
el.mode3d.setAttribute('aria-pressed', String(state.mode3d));
el.simTiltRow.hidden = !state.mode3d;
el.mode3d.addEventListener('click', () => {
  state.mode3d = !state.mode3d;
  el.mode3d.setAttribute('aria-pressed', String(state.mode3d));
  save('mode3d', state.mode3d);
  el.simTiltRow.hidden = !state.mode3d;
  render();
});

el.allBodies.addEventListener('click', toggleAll);

// 나침반 크기가 바뀌면 SVG 좌표계(1단위 = 1px)를 다시 맞춰요.
new ResizeObserver(([entry]) => {
  const w = entry.contentRect.width;
  if (!w || w === state.size) return;
  state.size = w;
  el.svg.setAttribute('viewBox', `${-w / 2} ${-w / 2} ${w} ${w}`);
  render();
}).observe(el.compass);

// PC용 기울기 시뮬레이션
el.simTilt.addEventListener('input', () => {
  state.simTilt = Number(el.simTilt.value);
  el.simTiltValue.textContent = `${state.simTilt}°`;
  scheduleRender();
});

// PC용 방향 시뮬레이션
el.simSlider.addEventListener('input', () => {
  state.simHeading = Number(el.simSlider.value);
  el.simValue.textContent = `${state.simHeading}° ${compassDirection(state.simHeading)}`;
  scheduleRender();
});

// ---------------------------------------------------------------------------
// 시작
// ---------------------------------------------------------------------------

let locating = false;
function start(fromGesture) {
  el.start.hidden = true;
  save('started', true);
  startSensors(fromGesture);
  if (!locating) {
    locating = true;
    startGeolocation();
  }
}

buildBodyOptions();
rebuildBodies();
setInterval(updatePositions, CONFIG.refreshMs);

// 처음 한 번만 시작 화면을 보여주고, 그 뒤로는 앱처럼 바로 켜져요.
// iOS처럼 버튼을 눌러야 센서 권한을 받을 수 있는 환경은 startSensors가 시작 화면을 다시 띄워요.
// (요즘 Chrome에도 requestPermission 함수가 있어서, 그것만으로 iOS를 구분할 수 없어요.)
el.startBtn.addEventListener('click', () => start(true));
if (load('started', false)) start(false);
else el.start.hidden = false;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
}
