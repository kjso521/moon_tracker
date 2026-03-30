import flet as ft
import math
from config import AppConfig

# [추가됨] 완벽하게 정리된 달 위상 작도 클래스
class MoonPhaseLogic:
    def __init__(self, size=24):
        self.size = size
        self.color_dark = AppConfig.MOON_COLOR_DARK

        # 보정값 설정 (유격을 덮기 위한 오프셋)
        GAP = 0.5
        INNER_SIZE = self.size - (GAP * 2)

        # 1. 밝은 원: 전체 사이즈보다 약간 작게 설정
        self.base_light = ft.Container(
            width=INNER_SIZE, height=INNER_SIZE, left=GAP, top=GAP, # 중앙 배치를 위해 GAP만큼 이동
            shape=ft.BoxShape.CIRCLE, bgcolor=AppConfig.COMPASS_COLOR_DEFAULT,
        )

        # 2. 마스크: 내부 원 크기에 맞춤
        self.half_mask = ft.Container(width=INNER_SIZE / 2, height=INNER_SIZE, bgcolor=self.color_dark)
        self.mask_wrapper = ft.Container(content=self.half_mask, top=GAP, left=GAP)

        # 3. 타원: 내부 원 크기에 맞춤
        self.terminator_ellipse = ft.Container(
            width=INNER_SIZE, height=INNER_SIZE, shape=ft.BoxShape.CIRCLE, bgcolor=self.color_dark,
            scale=ft.Scale(scale_x=1.0, scale_y=1.0, alignment=ft.Alignment.CENTER),
        )
        self.ellipse_wrapper = ft.Container(content=self.terminator_ellipse, top=GAP, left=GAP)

        # 4. [핵심] 실금 제거용 외곽 프레임
        # 두께(border)를 주어 내부 원의 테두리(GAP 부분)를 완전히 덮습니다.
        self.border_frame = ft.Container(
            width=self.size, height=self.size, shape=ft.BoxShape.CIRCLE,
            border=ft.border.all(1, AppConfig.BG_COLOR), # 배경색과 동일한 두꺼운 테두리
        )

        # 전체 결합
        self.moon_shape = ft.Container(
            width=self.size, height=self.size, shape=ft.BoxShape.CIRCLE, clip_behavior=ft.ClipBehavior.ANTI_ALIAS, 
            content=ft.Stack([self.base_light, self.mask_wrapper, self.ellipse_wrapper, self.border_frame])
        )

    # current_color 인자를 추가하여 나침반 색상(흰색->노란색)과 동기화
    def update_phase(self, phase, current_color):
        cos_val = math.cos(phase * 2 * math.pi) # Ellipse의 width는 Phase(radian, 0~1)의 cos값에 비례하여 변동
        self.terminator_ellipse.scale.scale_x = abs(cos_val) # 원을 x축 방향으로 scale하여 phase에 맞는 크기의 ellipse로 변형

        self.base_light.bgcolor = current_color # 밝은 원(달)의 색상을 나침반과 동일한 색상으로 적용 (노란색으로 빛나는 효과 공유)

        if phase < 0.5: # 신월~초승달~상현~보름 사이
            self.mask_wrapper.left = 0
            if phase < 0.25: # 신월~상현 사이
                self.terminator_ellipse.bgcolor = self.color_dark # Ellipse가 어두움 (점점 줄어들며 달이 찬다)
            else: # 상현~보름 사이
                self.terminator_ellipse.bgcolor = current_color # Ellipse가 밝음 (점점 커지며 달이 찬다)
        else: # 보름~하현~그믐~신월 사이
            self.mask_wrapper.left = self.size / 2
            if phase < 0.75: # 보름~하현 사이
                self.terminator_ellipse.bgcolor = current_color # Ellipse가 밝음 (점점 줄어들며 달이 기운다)
            else: # 하현~그믐 사이
                self.terminator_ellipse.bgcolor = self.color_dark # Ellipse가 어두움 (점점 커지며 달이 기운다)

    # 완성된 달의 모양을 반환한다
    def get_moon_widget(self):
        return self.moon_shape