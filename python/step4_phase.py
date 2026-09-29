"""
Step 4 · 달 위상 위젯 (Flet 최종 버전)
- 달 아이콘을 phase.py의 MoonPhaseLogic(도형을 겹쳐 그린 달 모양)으로 교체.
- 테스트용으로 슬라이더 값이 위상도 함께 바꾼다 (실제 위상 데이터는 아직 미연결).
- 이 다음 단계는 웹 버전(../web)으로 이어진다.
"""

import math
import flet as ft
from datetime import datetime
from core import MoonEngine
from config import AppConfig
from phase import MoonPhaseLogic

def get_compass_direction(degrees):
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N"]
    ix = int((degrees + 11.25) / 22.5) % 16
    return dirs[ix]

def main(page: ft.Page):
    page.horizontal_alignment = "center"
    page.vertical_alignment = "center"
    page.theme_mode = "dark"
    page.bgcolor = AppConfig.BG_COLOR

    engine = MoonEngine()
    test_lat, test_lon = 37.5665, 126.9780 # 서울 (테스트용 고정 위치)
    now = datetime.now()
    moon_data = engine.get_moon_position(test_lat, test_lon, now)
    moon_azimuth = moon_data['azimuth']
    moon_dir = get_compass_direction(moon_azimuth)
    
    # Fixed Top Arrow
    top_arrow = ft.Container(
        content = ft.Icon(ft.Icons.ARROW_DROP_UP, size = 35, color = AppConfig.COMPASS_COLOR_DEFAULT),
        alignment = ft.Alignment.TOP_CENTER,
        height = AppConfig.ARROW_CONTAINER_HEIGHT, 
        animate = ft.Animation(300, ft.AnimationCurve.EASE_OUT)
    )

    # Compass Circle
    compass_circle = ft.Container(
        width = 250, height = 250, border_radius = 125,
        border = ft.border.all(2, AppConfig.COMPASS_COLOR_DEFAULT),
        animate = ft.Animation(300, ft.AnimationCurve.EASE_OUT)
    )

    unified_compass = ft.Container(
        content = ft.Stack([top_arrow, compass_circle], alignment = ft.Alignment.CENTER),
        opacity = AppConfig.COMPASS_OPACITY_DEFAULT, animate_opacity = ft.Animation(300, ft.AnimationCurve.EASE_OUT)
    )

    # [수정됨] 나이트라이트 아이콘 대신 MoonPhaseLogic 위젯 사용
    moon_phase_visual = MoonPhaseLogic(size = 24)
    # 초기 상태 세팅 (테스트용)
    moon_phase_visual.update_phase(0.0, AppConfig.COMPASS_COLOR_DEFAULT)

    # Moon Orbit
    moon_orbit = ft.Container(
        content = ft.Container(
            content = moon_phase_visual.get_moon_widget(),
            alignment = ft.Alignment.TOP_CENTER,
            padding = ft.Padding.only(top = AppConfig.MOON_PADDING_TOP),
        ),
        width = 250, height = 250,
        alignment = ft.Alignment.CENTER,
        opacity = AppConfig.MOON_OPACITY_DEFAULT,
        rotate = ft.Rotate(angle = 0, alignment = ft.Alignment.CENTER),
        animate = ft.Animation(300, ft.AnimationCurve.EASE_OUT),
        animate_opacity = ft.Animation(300, ft.AnimationCurve.EASE_OUT)
    )

    # Information Text
    info_text = ft.Text(f"{moon_azimuth:.2f}° {moon_dir}", size = 16, weight = "w500", text_align = "center", color = AppConfig.TEXT_COLOR)

    def on_heading_change(e):
        phone_heading = e.control.value
        relative_angle = moon_azimuth - phone_heading
        diff = abs(relative_angle)
        min_diff = min(diff, 360 - diff)

        # Ratate Moon Orbit
        moon_orbit.rotate = ft.Rotate(angle = math.radians(relative_angle), alignment = ft.Alignment.CENTER)

        # [임시 테스트용] 슬라이더 값에 따라 달 위상도 변하게 설정
        test_phase = phone_heading / 360.0

        if min_diff <= 3:
            unified_compass.opacity = 1.0
            compass_circle.border = ft.border.all(3, AppConfig.COMPASS_COLOR_MATCH)
            top_arrow.content.color = AppConfig.COMPASS_COLOR_MATCH
            moon_orbit.opacity = 1.0
            # 위젯 색상 업데이트
            moon_phase_visual.update_phase(test_phase, AppConfig.COMPASS_COLOR_MATCH)
            
        elif min_diff <= 60:
            opacity = max(0.3, 1.0 - min_diff / 30)
            unified_compass.opacity = opacity
            compass_circle.border = ft.border.all(2, AppConfig.COMPASS_COLOR_APPROACH)
            top_arrow.content.color = AppConfig.COMPASS_COLOR_APPROACH
            moon_orbit.opacity = opacity
            # 위젯 색상 업데이트
            moon_phase_visual.update_phase(test_phase, AppConfig.COMPASS_COLOR_APPROACH)
            
        else:
            unified_compass.opacity = AppConfig.COMPASS_OPACITY_DEFAULT
            compass_circle.border = ft.border.all(2, AppConfig.COMPASS_COLOR_DEFAULT)
            top_arrow.content.color = AppConfig.COMPASS_COLOR_DEFAULT
            moon_orbit.opacity = 0.3
            # 위젯 색상 업데이트
            moon_phase_visual.update_phase(test_phase, AppConfig.COMPASS_COLOR_DEFAULT)
        
        page.update()

    heading_slider = ft.Slider(min = 0, max = 360, value = 0, width = 300, on_change = on_heading_change)

    page.add(ft.SafeArea(
        ft.Column([
            ft.Text("Moon Tracker", size = 24, weight = "bold", color = AppConfig.TEXT_COLOR),
            ft.Container(height = 40),

            ft.Stack([
                unified_compass,
                moon_orbit,
            ], alignment = ft.Alignment.CENTER),

            ft.Container(height = 40),
            info_text,
            ft.Container(height = 20),
            heading_slider,
        ], horizontal_alignment = "center",
        alignment = ft.MainAxisAlignment.CENTER)
    ))

ft.app(target = main)