"""
Step 1b · Android GPS 단독 테스트
- flet_geolocator의 새 async API(await request_permission / get_current_position)로 위치만 받아본다.
- Android 빌드: 이 폴더에서 flet build apk (pyproject.toml에 위치 권한 설정)
- Android에서 흰 화면만 나와서, 이후 웹 버전(../../web)으로 방향을 바꿨다.
"""

import flet as ft
import flet_geolocator as ftg

def main(page: ft.Page):
    page.title = 'Geolocator'
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.vertical_alignment   = ft.MainAxisAlignment.CENTER

    geo = ftg.Geolocator()
    result_txt = ft.Text("Geolocation")

    async def get_location(e):
        try:
            await geo.request_permission()
            pos = await geo.get_current_position()
            result_txt.value = f"Latitude: {pos.latitude}\nLongitude: {pos.longitude}"
        except Exception as ex:
            result_txt.value = f"Error: {ex}"

        page.update()

    page.add(result_txt, ft.Button(content="get", on_click=get_location))

ft.app(target=main)