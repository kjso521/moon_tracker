# Moon Tracker

출사를 위한 달 추적기. 지금 위치와 폰이 향하는 방향을 받아서, 달이 어느 쪽에 있는지 나침반으로 알려준다.

- 앱 바로 열기: https://kjso521.github.io/moon_tracker/web/
- 목표와 배경: [notes/project.md](notes/project.md), 초기 기획: `notes/draft.pptx`

## 폴더 구조

```
web/        현재 앱 (HTML/CSS/JS). 폰 브라우저에서 GPS + 나침반 센서로 동작
python/     Flet(Python)으로 만든 단계별 프로토타입. 공부용
notes/      기획 문서와 공부 메모
```

## 개발 과정 (python/)

각 파일 맨 위에 그 단계에서 한 일을 적어 두었다.

| 단계 | 파일 | 내용 |
|---|---|---|
| 0 | `step0_calculation.py` | 고정 좌표에서 달 방위각·고도·위상 계산 |
| 1 | `step1_geolocator.py` | GPS 연동 시도 (예전 API라 동작 안 함) |
| 1b | `step1b_geolocator_android/` | 새 async API로 Android GPS 단독 테스트 → 흰 화면 문제 |
| 2 | `step2_compass.py` | 나침반 UI, 슬라이더로 폰 방향 흉내 |
| 3 | `step3_ui.py` | 설정값 분리(`config.py`), 달이 도는 궤도 UI |
| 4 | `step4_phase.py` | 달 위상 위젯(`phase.py`) 적용 — Flet 최종 버전 |
| → | `../web/` | Android 빌드 문제로 웹으로 전환 |

공통 모듈:
- `core.py` — `MoonEngine`: 위치 + 시간 → 달의 방위각/고도/위상 (ephem)
- `config.py` — `AppConfig`: 색상, 크기, 투명도 설정
- `phase.py` — `MoonPhaseLogic`: 원과 타원을 겹쳐 달 모양 그리기

실행:
```bash
source venv/bin/activate
cd python
python step4_phase.py
```

## 버전

설정 창 맨 아래에 표시돼요. 버전 번호는 `web/version.js`에서 관리해요. 큰 변경점마다 앞자리를 올리고, 평소 업데이트는 뒤 두 자리만 올려요.

| 버전 | 내용 |
|---|---|
| 0.xx | Python(Flet)으로 달만 구현한 프로토타입 (`python/`) |
| 1.xx | 웹앱으로 전환 |
| 2.xx | 여러 천체 + 2D 나침반 |
| 3.xx | 3D 나침반 |

## 웹 버전 (web/)

```bash
python3 -m http.server -d web 8000   # http://localhost:8000
```

PC에는 방향 센서가 없어서 슬라이더가 대신 나타난다. 폰에서는 HTTPS에서만 GPS와 나침반이 동작하므로 GitHub Pages 주소로 테스트한다.

- 달 계산: [astronomy-engine](https://github.com/cosinekitty/astronomy) (ephem과 결과 일치 확인)
- 별자리 모양: [d3-celestial](https://github.com/ofrohn/d3-celestial) 데이터에서 앱에 필요한 별자리만 추출 (BSD 3-Clause, © Olaf Frohn)
- 천체 아이콘이나 방위 줄을 누르면 천체 안내 카드(별자리 모양, 행성의 현재 모습, 골든아워 등)가 열립니다.
- 방위 보정: 나침반은 자북 기준이라 한국에서는 약 -9°를 보정한다. 달을 직접 겨냥해 보정할 수도 있다.
