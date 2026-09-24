#!/usr/bin/env python3
"""Контраст текста на стекле по фактическим пикселям.

Токены проверить недостаточно: сквозь полупрозрачную плёнку просвечивает
контент, и настоящий фон текста — это то, что в итоге отрисовалось.
Поэтому меряем по снятым областям (их делает e2e/appearance.mjs).

    python scripts/contrast.py frontend/e2e/screenshots
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Нужен Pillow: pip install Pillow")

WCAG_AA = 4.5
WCAG_AA_LARGE = 3.0


def luminance(rgb) -> float:
    def channel(value: float) -> float:
        value /= 255
        return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = (channel(v) for v in rgb[:3])
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast(first: float, second: float) -> float:
    high, low = max(first, second), min(first, second)
    return (high + 0.05) / (low + 0.05)


def main(directory: Path) -> int:
    shots = sorted(directory.glob("contrast-*.png"))
    if not shots:
        sys.exit(f"Нет снимков в {directory}. Сначала: npm run e2e:appearance")

    failures = 0
    print(f"{'область':28} {'контраст':>9}  вердикт")
    for shot in shots:
        image = Image.open(shot).convert("RGB")
        pixels = list(image.get_flattened_data())
        lums = sorted(luminance(p) for p in pixels)
        # Текст занимает малую долю площади, поэтому «чернила» — это хвост
        # распределения яркости. Крайние 0,2% отсекают случайные выбросы.
        dark = lums[int(len(lums) * 0.002)]
        light = lums[int(len(lums) * 0.998)]
        ratio = contrast(dark, light)
        if ratio >= WCAG_AA:
            verdict = "✓ AA"
        elif ratio >= WCAG_AA_LARGE:
            verdict = "— только крупный текст"
            failures += 1
        else:
            verdict = "✗ недостаточно"
            failures += 1
        print(f"{shot.stem:28} {ratio:8.1f}:1  {verdict}")

    return 1 if failures else 0


if __name__ == "__main__":
    target = Path(sys.argv[1] if len(sys.argv) > 1 else "frontend/e2e/screenshots")
    raise SystemExit(main(target))
