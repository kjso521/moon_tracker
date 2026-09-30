'use strict';

const CONFIG = {
  matchDeg: 3,          // 이 각도 안이면 "일치" (노란색)
  approachDeg: 60,      // 이 각도 안이면 점점 밝아짐
  idleOpacity: 0.24,    // COMPASS_OPACITY_DEFAULT
  otherOpacity: 0.6,    // 선택하지 않은 천체의 투명도
  defaultOffset: -9,    // 한국 기준 자기편각(°). 진북 방위 = 자북 방위 + 편각
  defaultLocation: { lat: 37.5665, lon: 126.978, name: '서울' }, // GPS를 못 받을 때
  smoothing: 0.2,       // 센서 흔들림 완화 (0~1, 클수록 빠르게 반응)
  refreshMs: 30_000,
};

// id는 Astronomy.Body의 이름과 같아요.
const BODIES = [
  { id: 'Moon',    name: '달',   riseLabel: '월출', setLabel: '월몰' },
  { id: 'Sun',     name: '태양', riseLabel: '일출', setLabel: '일몰', color: '#ffb74d' },
  { id: 'Mercury', name: '수성', color: '#b0bec5' },
  { id: 'Venus',   name: '금성', color: '#fff3c4' },
  { id: 'Mars',    name: '화성', color: '#ff7043' },
  { id: 'Jupiter', name: '목성', color: '#ffe0b2' },
  { id: 'Saturn',  name: '토성', color: '#ffd54f' },
];
const bodyById = Object.fromEntries(BODIES.map((b) => [b.id, b]));

const $ = (id) => document.getElementById(id);
const el = {
  compass: $('compass'), orbits: $('orbits'), targets: $('targets'),
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
  sensor: '대기 중',
  sensorSeen: false,
  simHeading: 0,
  offset: Number(load('offset', CONFIG.defaultOffset)) || 0,
  enabled: savedBodies.length ? savedBodies : ['Moon'],
  target: 'Moon',
  anchor: null,         // 날짜 선택기로 고른 기준 시각. null이면 "지금"
  shiftMin: 0,          // 시간 막대로 옮긴 분
  positions: {},        // id → 계산 결과
  orbitAngles: {},      // id → 누적 회전각. 359°→0°에서 한 바퀴 도는 걸 막아요
  markers: {},          // id → DOM
  notice: null,         // 설정 서랍에 잠깐 띄울 안내
  wasMatch: false,
};
state.target = state.enabled.includes(load('target', 'Moon')) ? load('target', 'Moon') : state.enabled[0];

// ---------------------------------------------------------------------------
// 천문 계산 (core.py MoonEngine의 JS 버전)
// ---------------------------------------------------------------------------

function computeBody(id, date, observer) {
  const { Body, Equator, Horizon, MoonPhase, Illumination, SearchRiseSet } = Astronomy;
  const body = Body[id];
  const eq = Equator(body, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  const rise = SearchRiseSet(body, observer, +1, date, 2);
  const set = SearchRiseSet(body, observer, -1, date, 2);
  const result = {
    azimuth: hor.azimuth,          // 0~360, 진북 기준 시계방향
    altitude: hor.altitude,        // 지평선 위 고도
    rise: rise ? rise.date : null,
    set: set ? set.date : null,
  };
  const illum = Illumination(body, date);
  if (id === 'Moon') {
    result.cycle = MoonPhase(date) / 360;        // 0 삭 → 0.5 보름 → 1 삭
    result.illumination = illum.phase_fraction;  // 0~1 밝은 면적
  } else {
    result.magnitude = illum.mag;                // 겉보기 등급 (작을수록 밝음)
  }
  return result;
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

function createMarker(body) {
  const orbit = document.createElement('div');
  orbit.className = 'orbit';
  orbit.dataset.id = body.id;

  const marker = document.createElement('div');
  marker.className = 'marker';

  let lit = null;
  if (body.id === 'Moon') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '-1.05 -1.05 2.1 2.1');
    const dark = document.createElementNS(SVG_NS, 'circle');
    dark.setAttribute('class', 'moon-dark');
    dark.setAttribute('r', '1');
    lit = document.createElementNS(SVG_NS, 'path');
    lit.setAttribute('class', 'moon-lit');
    svg.append(dark, lit);
    marker.append(svg);
  } else {
    const dot = document.createElement('span');
    dot.className = 'planet';
    marker.style.setProperty('--body-color', body.color);
    marker.append(dot);
  }

  const label = document.createElement('span');
  label.className = 'marker-label';
  label.textContent = body.name;
  marker.append(label);

  orbit.append(marker);
  return { orbit, marker, lit };
}

function rebuildBodies() {
  el.orbits.replaceChildren();
  el.targets.replaceChildren();
  state.markers = {};

  const ordered = BODIES.filter((b) => state.enabled.includes(b.id));
  for (const body of ordered) {
    const m = createMarker(body);
    state.markers[body.id] = m;
    el.orbits.append(m.orbit);

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = body.name;
    chip.dataset.id = body.id;
    chip.addEventListener('click', () => selectTarget(body.id));
    el.targets.append(chip);
  }

  el.compass.classList.toggle('single', ordered.length === 1);
  el.targets.hidden = ordered.length <= 1;
  updatePositions();
}

function selectTarget(id) {
  state.target = id;
  state.wasMatch = false;
  save('target', id);
  render();
}

function buildBodyOptions() {
  for (const body of BODIES) {
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
    el.bodyOptions.append(label);
  }
}

function toggleBody(id, input) {
  const next = input.checked
    ? BODIES.map((b) => b.id).filter((b) => b === id || state.enabled.includes(b))
    : state.enabled.filter((b) => b !== id);
  if (!next.length) {           // 최소 하나는 켜져 있어야 해요
    input.checked = true;
    return;
  }
  state.enabled = next;
  save('bodies', next);
  if (input.checked) state.target = id;
  else if (!next.includes(state.target)) state.target = next[0];
  save('target', state.target);
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
    state.positions[id] = computeBody(id, date, observer);
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

function render() {
  const target = state.positions[state.target];
  if (!target) return;

  const heading = currentHeading();
  const lat = state.lat;

  // 모든 천체 마커 회전
  let targetRelative = 0;
  for (const id of state.enabled) {
    const pos = state.positions[id];
    const m = state.markers[id];
    if (!pos || !m) continue;
    const relative = signedDiff(pos.azimuth, heading); // +면 오른쪽에 있음
    if (id === state.target) targetRelative = relative;

    // 누적 각도로 이어 붙여서 0°/360° 경계에서 튀지 않게 해요.
    const prev = state.orbitAngles[id] ?? relative;
    const angle = prev + signedDiff(relative, prev);
    state.orbitAngles[id] = angle;
    m.orbit.style.transform = `rotate(${angle}deg)`;
    // 마커는 똑바로 세워요. 남반구에서는 달의 좌우가 뒤집혀 보여요.
    const flip = id === 'Moon' && lat < 0 ? ' scaleX(-1)' : '';
    m.marker.style.transform = `rotate(${-angle}deg)${flip}`;
    m.orbit.classList.toggle('selected', id === state.target);
    m.orbit.style.zIndex = id === state.target ? 2 : 1;
  }

  const diff = Math.abs(targetRelative);
  const { level, opacity } = levelFor(diff);
  el.compass.dataset.level = level;
  el.compass.style.setProperty('--opacity', opacity.toFixed(3));
  document.body.classList.toggle('compass-match', level === 'match');

  for (const id of state.enabled) {
    const m = state.markers[id];
    const pos = state.positions[id];
    if (!m || !pos) continue;
    const base = id === state.target ? opacity : CONFIG.otherOpacity;
    m.marker.style.opacity = (pos.altitude < 0 ? base * 0.45 : base).toFixed(3); // 지평선 아래는 흐리게
  }

  const isMatch = level === 'match';
  if (isMatch && !state.wasMatch) navigator.vibrate?.(40);
  state.wasMatch = isMatch;

  for (const chip of el.targets.children) {
    chip.setAttribute('aria-pressed', String(chip.dataset.id === state.target));
  }

  const body = bodyById[state.target];
  el.readout.textContent = `${target.azimuth.toFixed(1)}° ${compassDirection(target.azimuth)}`;
  el.guide.textContent = isMatch
    ? `${body.name} 방향이에요!`
    : `${targetRelative > 0 ? '오른쪽' : '왼쪽'}으로 ${Math.round(diff)}° 돌리세요`;

  if (target.altitude < 0) {
    el.hint.textContent = `${body.name}이 지평선 아래에 있어요 · ${body.riseLabel ?? '뜨는 시각'} ${formatEvent(target.rise)}`;
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
  } else {
    el.d2Label.textContent = '밝기';
    el.d2.textContent = `${target.magnitude.toFixed(1)}등급`;
  }
  el.riseLabel.textContent = body.riseLabel ?? '뜨는 시각';
  el.setLabel.textContent = body.setLabel ?? '지는 시각';
  el.rise.textContent = formatEvent(target.rise);
  el.set.textContent = formatEvent(target.set);

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
