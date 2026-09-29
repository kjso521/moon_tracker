'use strict';

const CONFIG = {
  matchDeg: 3,          // 이 각도 안이면 "일치" (노란색)
  approachDeg: 60,      // 이 각도 안이면 점점 밝아짐
  idleOpacity: 0.24,    // COMPASS_OPACITY_DEFAULT
  defaultOffset: -9,    // 한국 기준 자기편각(°). 진북 방위 = 자북 방위 + 편각
  defaultLocation: { lat: 37.5665, lon: 126.978, name: '서울' }, // GPS를 못 받을 때
  smoothing: 0.2,       // 센서 흔들림 완화 (0~1, 클수록 빠르게 반응)
  moonRefreshMs: 30_000,
};

const $ = (id) => document.getElementById(id);
const el = {
  compass: $('compass'), orbit: $('orbit'), moon: $('moon'), moonLit: $('moon-lit'),
  readout: $('readout'), guide: $('guide'), hint: $('hint'),
  alt: $('alt'), phase: $('phase'), rise: $('rise'), set: $('set'),
  sim: $('sim'), simSlider: $('sim-slider'), simValue: $('sim-value'),
  offset: $('offset'), offsetLabel: $('offset-label'),
  calibrate: $('calibrate'), resetOffset: $('reset-offset'),
  status: $('status'), start: $('start'), startBtn: $('start-btn'),
};

const state = {
  lat: CONFIG.defaultLocation.lat,
  lon: CONFIG.defaultLocation.lon,
  location: `기본 위치(${CONFIG.defaultLocation.name})`,
  magHeading: null,     // 센서가 준 자북 기준 방위 (스무딩 적용)
  pitch: null,          // 후면 카메라가 향하는 고도. 폰을 세웠을 때만 값이 있음
  sensor: '대기 중',
  sensorSeen: false,
  simHeading: 0,
  offset: loadOffset(),
  moon: null,
  orbitAngle: 0,        // 누적 회전각. 359°→0°에서 한 바퀴 도는 걸 막아요
  wasMatch: false,
};

// ---------------------------------------------------------------------------
// 천문 계산 (core.py MoonEngine의 JS 버전)
// ---------------------------------------------------------------------------

function computeMoon(date, lat, lon) {
  const { Body, Observer, Equator, Horizon, MoonPhase, Illumination, SearchRiseSet } = Astronomy;
  const observer = new Observer(lat, lon, 0);
  const eq = Equator(Body.Moon, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  const rise = SearchRiseSet(Body.Moon, observer, +1, date, 2);
  const set = SearchRiseSet(Body.Moon, observer, -1, date, 2);
  return {
    azimuth: hor.azimuth,                               // 0~360, 진북 기준 시계방향
    altitude: hor.altitude,                             // 지평선 위 고도
    cycle: MoonPhase(date) / 360,                       // 0 삭 → 0.5 보름 → 1 삭
    illumination: Illumination(Body.Moon, date).phase_fraction, // 0~1 밝은 면적
    rise: rise ? rise.date : null,
    set: set ? set.date : null,
  };
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

async function startSensors() {
  // iOS 13+는 사용자가 버튼을 누른 순간에만 권한 요청이 가능해요.
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') state.sensor = '권한 거부됨';
    } catch (err) {
      state.sensor = `권한 요청 실패: ${err.message}`;
    }
  }

  const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(eventName, onOrientation);

  setTimeout(() => {
    if (!state.sensorSeen) {
      if (state.sensor === '대기 중') state.sensor = '없음';
      el.sim.hidden = false;
      render();
    }
  }, 1500);
}

// ---------------------------------------------------------------------------
// 위치
// ---------------------------------------------------------------------------

function startGeolocation() {
  const fallback = (reason) => {
    state.location = `기본 위치(${CONFIG.defaultLocation.name}) · ${reason}`;
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
      updateMoon();
    },
    (err) => fallback(err.code === err.PERMISSION_DENIED ? '위치 권한 거부됨' : err.message),
    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
  );
}

// ---------------------------------------------------------------------------
// 화면
// ---------------------------------------------------------------------------

function updateMoon() {
  state.moon = computeMoon(new Date(), state.lat, state.lon);
  el.moonLit.setAttribute('d', moonPath(state.moon.cycle));
  render();
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function formatTime(date) {
  if (!date) return '--';
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  return days === 0 ? time : days === 1 ? `내일 ${time}` : `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function render() {
  const moon = state.moon;
  if (!moon) return;

  const heading = currentHeading();
  const relative = signedDiff(moon.azimuth, heading); // +면 오른쪽에 달이 있음
  const diff = Math.abs(relative);

  // 궤도 회전: 누적 각도로 이어 붙여서 0°/360° 경계에서 튀지 않게 해요.
  state.orbitAngle += signedDiff(relative, state.orbitAngle);
  el.orbit.style.transform = `rotate(${state.orbitAngle}deg)`;
  // 달 모양은 회전시키지 않고 똑바로 유지. 남반구에서는 좌우가 뒤집혀 보여요.
  el.moon.style.transform = `rotate(${-state.orbitAngle}deg) scaleX(${state.lat < 0 ? -1 : 1})`;

  let level, opacity;
  if (diff <= CONFIG.matchDeg) {
    level = 'match';
    opacity = 1;
  } else if (diff <= CONFIG.approachDeg) {
    level = 'approach';
    const t = (diff - CONFIG.matchDeg) / (CONFIG.approachDeg - CONFIG.matchDeg);
    opacity = 1 - t * (1 - CONFIG.idleOpacity);
  } else {
    level = 'idle';
    opacity = CONFIG.idleOpacity;
  }
  el.compass.dataset.level = level;
  el.compass.style.setProperty('--opacity', opacity.toFixed(3));

  const isMatch = level === 'match';
  if (isMatch && !state.wasMatch) navigator.vibrate?.(40);
  state.wasMatch = isMatch;

  el.readout.textContent = `${moon.azimuth.toFixed(1)}° ${compassDirection(moon.azimuth)}`;
  el.guide.textContent = isMatch
    ? '달 방향이에요!'
    : `${relative > 0 ? '오른쪽' : '왼쪽'}으로 ${Math.round(diff)}° 돌리세요`;

  if (moon.altitude < 0) {
    el.hint.textContent = `달이 지평선 아래에 있어요 · 월출 ${formatTime(moon.rise)}`;
  } else if (state.pitch != null) {
    const dAlt = moon.altitude - state.pitch;
    el.hint.textContent = Math.abs(dAlt) <= CONFIG.matchDeg
      ? '높이도 맞았어요'
      : `${dAlt > 0 ? '위로' : '아래로'} ${Math.round(Math.abs(dAlt))}° 기울이세요`;
  } else {
    el.hint.textContent = state.sensorSeen ? '폰을 세우면 높이도 안내해요' : ' ';
  }

  el.alt.textContent = `${moon.altitude.toFixed(1)}°`;
  el.phase.textContent = `${phaseName(moon.cycle)} · ${Math.round(moon.illumination * 100)}%`;
  el.rise.textContent = formatTime(moon.rise);
  el.set.textContent = formatTime(moon.set);

  el.offsetLabel.textContent = `(${state.offset >= 0 ? '+' : ''}${state.offset.toFixed(1)}°)`;
  el.status.innerHTML = [
    `위치: ${state.location}`,
    `방향: ${state.sensorSeen ? state.sensor : `시뮬레이션 · 센서 ${state.sensor}`}`,
  ].map(escapeHtml).join('<br>');
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------------
// 방위 보정 (localStorage에 저장)
// ---------------------------------------------------------------------------

function loadOffset() {
  try {
    const saved = parseFloat(localStorage.getItem('moonTracker.offset'));
    return Number.isFinite(saved) ? saved : CONFIG.defaultOffset;
  } catch {
    return CONFIG.defaultOffset;
  }
}

function setOffset(value) {
  state.offset = Math.round(value * 10) / 10;
  el.offset.value = state.offset;
  try { localStorage.setItem('moonTracker.offset', String(state.offset)); } catch { /* 저장 불가해도 동작 */ }
  render();
}

el.offset.value = state.offset;
el.offset.addEventListener('change', () => {
  const v = parseFloat(el.offset.value);
  if (Number.isFinite(v)) setOffset(v);
});
el.calibrate.addEventListener('click', () => {
  if (!state.sensorSeen || !state.moon) {
    el.hint.textContent = '방향 센서가 있어야 보정할 수 있어요';
    return;
  }
  setOffset(signedDiff(state.moon.azimuth, state.magHeading));
});
el.resetOffset.addEventListener('click', () => setOffset(CONFIG.defaultOffset));

el.simSlider.addEventListener('input', () => {
  state.simHeading = Number(el.simSlider.value);
  el.simValue.textContent = `${state.simHeading}° ${compassDirection(state.simHeading)}`;
  scheduleRender();
});

// ---------------------------------------------------------------------------
// 시작
// ---------------------------------------------------------------------------

el.startBtn.addEventListener('click', () => {
  el.start.hidden = true;
  startSensors();
  startGeolocation();
});

updateMoon();
setInterval(updateMoon, CONFIG.moonRefreshMs);
