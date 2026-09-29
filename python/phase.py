import flet as ft
import math
from config import AppConfig

class MoonPhaseLogic:
    def __init__(self, size=24):
        self.size = size
        self.color_dark = AppConfig.MOON_COLOR_DARK
        
        GAP = 0.5
        INNER_SIZE = self.size - (GAP * 2)

        # 1. Bright Circle (Moon)
        self.base_light = ft.Container(
            width = INNER_SIZE, height = INNER_SIZE,
            left = GAP, top = GAP, # Top, Left를 GAP 만큼 띄워 중앙 배치
            shape = ft.BoxShape.CIRCLE, bgcolor = AppConfig.COMPASS_COLOR_DEFAULT,
        )

        # 2. Mask (Moon's Dark Half)
        self.half_mask = ft.Container(
            width = INNER_SIZE / 2, height = INNER_SIZE, # 높이는 Circle과 같고, 넓이는 반인 Mask를 통해, 달의 어두운 부분을 가려준다.
            bgcolor = self.color_dark, # 색상을 어두운 배경색과 같게 설정하여 달이 밝혀지지 않은 것처럼 보여준다.
        )
        self.mask_wrapper = ft.Container(
            content = self.half_mask, # Mask를 중앙에 배치하기 위해 Container로 감싼다.
            top = GAP, left = GAP, # Container를 GAP 만큼 띄워 Mask를 중앙에 배치되도록 한다.
        )

        # 3. Ellipse (Moon's Terminator or Crescent)
        # 달이 차고 기우는 모양을 표현하기 위해 타원을 부풀리고 줄이며 표현한다. (밝음/어두움 모두 표현)
        self.terminator_ellipse = ft.Container(
            width = INNER_SIZE, height = INNER_SIZE,
            shape = ft.BoxShape.CIRCLE, bgcolor = self.color_dark,
            scale = ft.Scale(
                scale_x = 1.0, scale_y = 1.0, alignment = ft.Alignment.CENTER
                ), # 타원을 늘리고 줄이기 위한 Scale 객체를 생성
        )
        self.ellipse_wrapper = ft.Container(
            content = self.terminator_ellipse,
            top = GAP, left = GAP,
        )

        # 4. Border Frame
        # 외곽 테두리의 미세한 Misalignment를 가리기 위해 배경색과 동일한 Border Frame을 추가한다.
        self.border_frame = ft.Container(
            width = self.size, height = self.size,
            shape = ft.BoxShape.CIRCLE,
            border = ft.border.all(1, AppConfig.BG_COLOR),
        )

        # Combine All Components
        self.moon_shape = ft.Container(
            width = self.size, height = self.size,
            shape = ft.BoxShape.CIRCLE,
            clip_behavior = ft.ClipBehavior.ANTI_ALIAS,
            content = ft.Stack(
                [self.base_light, self.mask_wrapper, self.ellipse_wrapper, self.border_frame]
                )
        )

    def update_phase(self, phase, current_color):
        cos_val = math.cos(phase * 2 * math.pi)
        self.terminator_ellipse.scale.scale_x = abs(cos_val)
        self.base_light.bgcolor = current_color

        if phase < 0.5: # 신원~초승달~상현~보름 사이. Mask가 왼편에 있다.
            self.mask_wrapper.left = 0
            if phase < 0.25: # 신월~상현 사이. 어두운 Ellipse가 점점 줄어두는 구간
                self.terminator_ellipse.bgcolor = self.color_dark
            else: # 상현~보름 사이. 밝은 Ellipse가 점점 커지는 구간
                self.terminator_ellipse.bgcolor = current_color
        else: # 보름~하현~그믐~신월 사이. Mask가 오른편에 있다.
            self.mask_wrapper.left = self.size / 2
            if phase < 0.75: # 보름~하현 사이. 밝은 Ellipse가 점점 줄어드는 구간
                self.terminator_ellipse.bgcolor = current_color
            else: # 하현~그믐 사이. 어두운 Ellipse가 점점 커지는 구간
                self.terminator_ellipse.bgcolor = self.color_dark
        
    def get_moon_widget(self):
        return self.moon_shape
