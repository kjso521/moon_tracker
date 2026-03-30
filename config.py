import flet as ft

class AppConfig:
    # Background & Text
    BG_COLOR   = ft.Colors.BLACK  # 배경 색상을 조정합니다.
    TEXT_COLOR = ft.Colors.WHITE  # 텍스트의 색상을 조정합니다.

    # Compass Size & Layout
    COMPASS_SIZE           = 250  # Compass circle의 크기를 조정합니다.
    ARROW_SIZE             = 35   # Compass의 상부를 가리키는 화살표의 크기를 조정합니다.
    ARROW_CONTAINER_HEIGHT = 290  # Compass의 상부를 가리키는 화살표를 얼마나 높게 배치할지를 조정합니다. (Compass circle과 미세하게 걸치도록 설정)
    MOON_PADDING_TOP       = -40  # 달 아이콘이 Compass로부터 얼마나 위로 떨어져있을지를 조정합니다.

    # Compass Colors
    COMPASS_COLOR_DEFAULT  = ft.Colors.WHITE         # 기본 색상을 조정합니다.
    COMPASS_COLOR_APPROACH = ft.Colors.WHITE         # 30도 이내일 때의 색상을 조정합니다.
    COMPASS_COLOR_MATCH    = ft.Colors.YELLOW_ACCENT_400  # 완전 일치할 때의 색상을 조정합니다.

    # Compass Thickness
    COMPASS_THICKNESS_DEFAULT = 2  # 기본 두께를 조정합니다.
    COMPASS_THICKNESS_MATCH   = 4  # 완전 일치할 때의 두께를 조정합니다.

    # Moon Size
    MOON_SIZE = 24  # 달 아이콘의 크기를 조정합니다.

    # Opacity
    COMPASS_OPACITY_DEFAULT = 0.24  # Compass의 투명도를 조정합니다.
    MOON_OPACITY_DEFAULT    = 0.24   # 달 아이콘의 투명도를 조정합니다.

    # Moon Phase Colors
    MOON_COLOR_LIGHT = ft.Colors.YELLOW_200   # 밝은 부분
    MOON_COLOR_DARK = ft.Colors.GREY_900    # 어두운 부분 및 신월