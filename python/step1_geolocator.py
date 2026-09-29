"""
Step 1 · GPS 연동 시도
- flet_geolocator로 현재 위치를 받아 달 위치를 계산하려던 단계.
- ⚠ 예전 이벤트 방식 API(on_position, page.overlay)를 써서 Flet 0.82에서는 동작하지 않는다.
  새 async 방식은 step1b_geolocator_android/main.py 참고.
"""

# import warnings
# warnings.filterwarnings("ignore") # 추가된 부분: 통신 에러를 유발하는 시스템 경고 강제 차단

import flet as ft
from flet_geolocator import Geolocator
from datetime import datetime
from core import MoonEngine

def main(page: ft.Page):
    engine = MoonEngine()
    result_text = ft.Text(value="Calculating Moon Position...", size=20)

    def handle_location_update(e):
        now = datetime.now()
        lat = e.latitude
        lon = e.longitude

        try:
            result = engine.get_moon_position(lat, lon, now)
            result_text.value = f"Az: {result['azimuth']}, Alt: {result['altitude']}, Phase: {result['phase']}"
        except Exception as ex:
            result_text.value = f"Error: {ex}"

        page.update()

    def handle_location_error(e):
        result_text.value = f"GPS Error: {e.data}"
        page.update()

    geolocator = Geolocator()
    geolocator.on_position = handle_location_update
    geolocator.on_error = handle_location_error
    page.overlay.append(geolocator)

    def get_current_location(e):
        result_text.value = "GPS finding..."
        page.update()
        try:
            geolocator.get_current_position()
        except Exception as ex:
            result_text.value = f"Sensor Error: {ex}"
            page.update()
    
    calc_button = ft.Button("Calculation", on_click=get_current_location)
    safe_layout = ft.SafeArea(ft.Column([calc_button, result_text]))    
    page.add(safe_layout)

ft.app(target=main)