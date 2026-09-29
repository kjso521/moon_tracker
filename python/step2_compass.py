"""
Step 2 · 나침반 UI
- GPS는 APK 빌드 후에야 권한을 받을 수 있어서 미루고, UI부터 구현한 단계.
- 슬라이더로 폰 방향을 흉내 내고, 달 방향과의 차이만큼 화살표를 회전시킨다.
- 16방위 표시, 30° 안으로 들어오면 밝아지고 3° 안이면 노란색으로 "일치" 표시.
"""

import math
import flet as ft
from datetime import datetime
from core import MoonEngine

def get_compass_direction(degrees):
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N"]
    ix = int((degrees + 11.25) / 22.5) % 16
    return dirs[ix]

def main(page: ft.Page):
    page.horizontal_alignment = "center"
    page.vertical_alignment = "center"
    page.theme_mode = "dark"

    engine = MoonEngine()

    test_lat, test_lon = 37.5665, 126.9780 # 서울 (테스트용 고정 위치)
    now = datetime.now()
    moon_data = engine.get_moon_position(test_lat, test_lon, now)
    moon_azimuth = moon_data['azimuth']
    moon_dir = get_compass_direction(moon_azimuth)

    info_text = ft.Text(f"Azimuth: {moon_azimuth}° ({moon_dir})\nPhone: 0° (N)", size=18, text_align="center")

    compass_circle = ft.Container(
        width = 250, height = 250, border_radius = 125,
        border = ft.border.all(2, ft.Colors.WHITE24),
        animate = ft.Animation(300, ft.AnimationCurve.EASE_OUT)
    )
    pointer = ft.Container(
        content = ft.Icon(ft.Icons.ARROW_UPWARD, size=80, color=ft.Colors.WHITE30),
        alignment = ft.Alignment.CENTER,
        width = 250, height = 250,
        rotate = ft.Rotate(angle = 0, alignment = ft.Alignment.CENTER),
        animate = ft.Animation(300, ft.AnimationCurve.EASE_OUT)
    )

    def on_heading_change(e):
        phone_heading = e.control.value
        relative_angle = moon_azimuth - phone_heading
        diff = abs(relative_angle)
        min_diff = min(diff, 360 - diff)
        phone_dir = get_compass_direction(phone_heading)
        info_text.value = f"Azimuth: {moon_azimuth}° ({moon_dir})\nPhone: {int(phone_heading)}° ({phone_dir})\nRelative: {int(relative_angle)}°"
        pointer.rotate = ft.Rotate(angle=math.radians(relative_angle), alignment=ft.Alignment.CENTER)

        if min_diff <= 3:
            pointer.content.color = ft.Colors.YELLOW_ACCENT_400
            compass_circle.border = ft.border.all(3, ft.Colors.YELLOW_ACCENT_400)
        elif min_diff <= 30:
            opacity = max(0.3, 1.0 - min_diff / 30)
            pointer.content.color = ft.Colors.with_opacity(opacity, ft.Colors.YELLOW_200)
            compass_circle.border = ft.border.all(2, ft.Colors.with_opacity(opacity, ft.Colors.YELLOW_200))
        else:
            pointer.content.color = ft.Colors.WHITE30
            compass_circle.border = ft.border.all(2, ft.Colors.WHITE24)
        
        page.update()

    heading_slider = ft.Slider(min=0, max=360, value=0, label="{value}°", on_change=on_heading_change, width=300)

    page.add(ft.SafeArea(ft.Column([
        info_text,
        ft.Container(height=20),
        ft.Stack([
            compass_circle,
            pointer,
        ], alignment=ft.Alignment.CENTER),
        ft.Container(height=50),
        heading_slider,
        ], horizontal_alignment = "center")))

ft.app(target=main)