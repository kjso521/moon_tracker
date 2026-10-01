# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Moon Tracker: a celestial-body finder for photography outings (출사). It takes time, the user's location, and the phone's heading, then shows which way to turn to face the Moon. The Moon comes first; other bodies (Venus, Jupiter, etc.) are planned later as optional toggles. The target is a lightweight mobile app (Android), and ideally a web app as well. Original concept slides: `notes/draft.pptx`. Goals and status: `notes/project.md` (Korean). `README.md` (Korean) explains the folder layout and the step-by-step history.

Stack: the current app is plain HTML/CSS/JS in `web/`. The earlier prototype in `python/` uses Python 3.12, [Flet](https://flet.dev) 0.82, `ephem`, and `flet-geolocator`. Fonts: Pretendard (Korean) and Montserrat (English).

## Commands

**Web version (`web/`) — current primary target.** Static files, no build step.

```bash
python3 -m http.server -d web 8000   # desktop check at http://localhost:8000 (no sensors → heading slider appears)
```

Phones need HTTPS for GPS and DeviceOrientation, so test on a device via an HTTPS host (e.g. GitHub Pages), not a LAN IP.

**Flet version (`python/`, legacy prototype).** There is no test suite or linter. Dependencies live in `venv/` at the repo root. Run commands from inside `python/` so `from core import …` resolves.

```bash
source venv/bin/activate && cd python
python step4_phase.py          # latest Flet step, desktop window
flet run step4_phase.py        # same, with hot reload

# Android GPS spike (own pyproject.toml with permissions)
cd step1b_geolocator_android && flet build apk
```

## Architecture

### Web (`web/`)

We moved to the web because the Flet Android build showed only a white screen. `app.js` holds all the logic. It uses `astronomy-engine` from a CDN, which matches ephem to 0.01° above the horizon.
- The moon's phase is drawn as an SVG path in `moonPath(cycle)`. `cycle` comes from `MoonPhase()/360` (0 = new moon, 0.5 = full moon), so it knows whether the moon is waxing or waning.
- `orientationToAim()` builds a rotation matrix from alpha/beta/gamma. It uses the direction the phone's top edge points when the phone lies flat, and the back camera's direction (plus its tilt) when the phone is held upright. Android sends `deviceorientationabsolute` events. iOS gives the heading in `webkitCompassHeading`, and the browser only allows the permission request from a button tap.
- It's installable as a PWA: `manifest.webmanifest` sets standalone mode, and `sw.js` caches network-first with a 3 s fallback to cache so the app works offline in the field. Pages sends `max-age=600`, so the SW installs with `cache: 'reload'` and fetches same-origin files with `cache: 'no-cache'`; otherwise phones would see stale files for up to 10 minutes. Rebuild same-origin requests from the URL, because passing an init to a navigate-mode Request throws. **On every deploy, bump `number` (and `date`) in `web/version.js`.** It is the single source for the version shown at the bottom of the drawer and for the SW cache name (`sw.js` loads it with `importScripts`; the SW is registered with `updateViaCache: 'none'`). Add any new app file to `SHELL` in `sw.js`.
- **Type scale:** only the three `--fs-*` tokens in `style.css` (17/14/12px). The azimuth readout uses the title size. Don't add new font sizes. Keep accent colours (yellow `--match`) for the match state and selection counts; secondary UI such as the time bar stays muted: the slider track and thumb share one opaque `--slider` colour.
- **Compass rendering:** the whole compass is one SVG (`#compass-svg`). `drawCompass()` projects 3D world points onto it: x = right, y = forward, z = up, with the compass on the z = 0 plane. The viewBox is sized to the element by a `ResizeObserver`, so 1 unit = 1px; geometry constants are in `COMPASS`. With 3D off (`state.mode3d`, toggled by the "3D" button at the top right of the title bar and saved in localStorage, default on) or the phone flat, the tilt is 0 and it renders the classic top-down compass. With the phone upright, the view tilts by `beta` (capped at `maxTiltView`), the ring becomes a grey disc, bodies rise by altitude on dashed stalks, and the scene shifts down by `liftMax·sin(t)/4` to stay centred. Icons are billboards, so only their position is projected. `#disc` fills the ring, which hides the arrow base inside it. Each name sits strictly right above its own icon: no stacking or nudging. The user likes tilting the phone to separate overlapping names. The focused body is drawn last, so its bright name stays on top. Option (3), putting names of below-horizon bodies under their icons in 3D, is a candidate to try later.
- The readout shows `name · azimuth` when more than one body is on. The `color` transition lives on `.compass`, so the arrow, ring and focused body (all `currentColor`) change together.
- `notes/icon-drafts/` holds icon candidates (yellow crescent, ExtraBold M, compressed rounded M) plus `compare.png`. The app icon is draft A2-white, a fuller white crescent with rounded tips. `web/icons/icon.svg` is a copy of `notes/icon-drafts/icon-a2-crescent-white.svg`; the PNGs are rendered with `qlmanage` + `sips`.
- The layout is a single screen with no scrolling. `.stage` is a size container, and the compass takes `min(cqw, cqh)`. Every body marker orbits inside `--orbit-pad`, so markers never overlap the text.
- Bodies are listed in the `BODIES` array and grouped by `GROUPS` (solar system, constellations by season, deep sky), each shown as a collapsible `<details>` in the drawer. Solar-system ids equal their `Astronomy.Body` names. Constellations and deep-sky objects use one J2000 reference point (`ra` in hours, `dec` in degrees), which `computeBody` registers as `Body.Star1` through `DefineStar`, so precession and rise/set searches work the same as for planets. Rise/set is expensive, so `ensureEvents()` computes it lazily and only for the current target. Enabled bodies are saved in localStorage. There is no manual target picker: `pickFocus()` makes the body with the smallest angular difference from the heading the target. It prefers bodies above the horizon and falls back to all bodies only when none are up. There is no hysteresis, so the boundary between two overlapping bodies is the exact midpoint. The target drives the readout, the guidance, the match colour, and the vibration. Every body within ±`labelDeg` of the arrow shows its name above its icon (`namedBodies()`).
- Time is `anchor` (a date from the picker, or null for now) plus `shiftMin` (the ±24 h slider). Calibration is only allowed at live time.
- On startup there's a start overlay only the first time; later launches start straight away. Recent Chrome also defines `DeviceOrientationEvent.requestPermission`, so don't use it to detect iOS. Instead, the start button comes back only when no sensor events arrive.
- Sensor headings are relative to magnetic north, while the moon's azimuth is relative to true north. `state.offset` fixes the difference. It defaults to -9°, the magnetic declination in Korea, can be recalibrated by pointing at the moon, and is saved in localStorage.

### Flet (`python/`, legacy)

The `stepN_*.py` files are kept on purpose as a learning record, and each one opens with a Korean docstring. Don't delete or merge them. Put new Flet work in a new step file.

- `core.py`: `MoonEngine.get_moon_position(lat, lon, datetime)` returns `{azimuth, altitude, phase}` in degrees, with phase as ephem's 0–100 % illumination. It converts the time to UTC before handing it to ephem.
- `config.py`: `AppConfig` holds every UI constant: colors, sizes, opacities, and the arrow and moon offsets. Tune the look here instead of hard-coding values.
- `phase.py`: `MoonPhaseLogic` draws the moon phase from stacked Flet containers: a light circle, a half-width dark mask, and a terminator circle scaled on the x-axis by `|cos(2π·phase)|`. A border ring in the background color hides anti-aliasing seams. `update_phase(phase, color)` expects **phase in 0–1 cycle fraction** (0 = new, 0.5 = full). That is a different unit from `core.py`'s 0–100 illumination, and it doesn't say whether the moon is waxing or waning. Wiring real data into it needs a conversion step.
- `step4_phase.py`: the latest Flet step. It draws a compass ring with a fixed top arrow and a "moon orbit" container rotated by `moon_azimuth - phone_heading`. The UI brightens or dims by angular difference: ≤3° is a match (yellow), ≤60° is approaching, and anything wider is default.
  - **Temporary scaffolding:** the location is hard-coded (`test_lat, test_lon`), and a `Slider` stands in for the magnetometer heading. The slider also drives a fake phase (`heading/360`) for visual testing.
- `step1b_geolocator_android/`: a standalone Flet project for testing GPS on Android. It uses the async `flet_geolocator` API (`await geo.request_permission()`, `await geo.get_current_position()`). `step1_geolocator.py` uses an older event-based API (`on_position`, `page.overlay`) that doesn't match Flet 0.82.

Code comments are often in Korean.

## Repo hygiene

`githubtoken.txt` holds a credential. `.gitignore` covers it along with `venv/`, `build/`, `storage/`, and `__pycache__/`. Still check `git status` before committing. Remote: https://github.com/kjso521/moon_tracker.git. GitHub Pages serves from `main` at `/` (root), so the app lives at https://kjso521.github.io/moon_tracker/web/.
