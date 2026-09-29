"""
Step 0 · 달 위치 계산
- 버튼을 누르면 고정 좌표(서울)에서 지금 달의 방위각, 고도, 위상을 계산해 보여준다.
- 핵심 로직: core.py의 MoonEngine (ephem 라이브러리 사용)
- 실행: python step0_calculation.py
"""

# import warnings
# warnings.filterwarnings("ignore") # 추가된 부분: 통신 에러를 유발하는 시스템 경고 강제 차단

import flet as ft
from datetime import datetime
from core import MoonEngine

def main(page: ft.Page):
    engine = MoonEngine()

    result_text = ft.Text(value="Calculating Moon Position...", size=20)

    def calculate_moon(e):
        test_lat, test_lon = 37.5665, 126.9780
        now = datetime.now()

        try:
            res = engine.get_moon_position(test_lat, test_lon, now)
            result_text.value = f"Az: {res['azimuth']}, Alt: {res['altitude']}, Phase: {res['phase']}"
        except Exception as ex:
            result_text.value = f"Error: {ex}"

        page.update()
    
    calc_button = ft.ElevatedButton("Calculation", on_click=calculate_moon)
    page.add(calc_button, result_text)

ft.app(target=main)