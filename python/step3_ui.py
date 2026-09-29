"""
Step 3 · UI 다듬기
- 색상/크기 상수를 config.py(AppConfig)로 분리.
- 고정된 윗쪽 화살표 + 나침반 원 + 그 둘레를 도는 달 아이콘(궤도) 구조로 변경.
"""

import math
import flet as ft
from datetime import datetime
from core import MoonEngine
from config import AppConfig

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
        height = AppConfig.ARROW_CONTAINER_HEIGHT, # Slightly bigger than the circle to point the top
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

    # Moon Icon - will be updated to an actual moon phase logic
    moon_placeholder = ft.Icon(ft.Icons.NIGHTLIGHT, size = 24, color = AppConfig.COMPASS_COLOR_DEFAULT)

    # Moon Orbit
    moon_orbit = ft.Container(
        content = ft.Container(
            content = moon_placeholder,
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

        if min_diff <= 3:
            unified_compass.opacity = 1.0
            compass_circle.border = ft.border.all(3, AppConfig.COMPASS_COLOR_MATCH)
            top_arrow.content.color = AppConfig.COMPASS_COLOR_MATCH
            moon_orbit.opacity = 1.0
            moon_placeholder.color = AppConfig.COMPASS_COLOR_MATCH
        elif min_diff <= 30:
            opacity = max(0.3, 1.0 - min_diff / 30)
            unified_compass.opacity = opacity
            compass_circle.border = ft.border.all(2, AppConfig.COMPASS_COLOR_APPROACH)
            top_arrow.content.color = AppConfig.COMPASS_COLOR_APPROACH
            moon_orbit.opacity = opacity
            moon_placeholder.color = AppConfig.COMPASS_COLOR_APPROACH
        else:
            unified_compass.opacity = 0.24
            compass_circle.border = ft.border.all(2, AppConfig.COMPASS_COLOR_DEFAULT)
            top_arrow.content.color = AppConfig.COMPASS_COLOR_DEFAULT
            moon_orbit.opacity = 0.3
            moon_placeholder.color = AppConfig.COMPASS_COLOR_DEFAULT
        
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