"""Преобразование единиц — исключительно для отображения.

В базе всё хранится в метрической системе и в целых секундах.
"""
KG_PER_LB = 0.45359237
CM_PER_INCH = 2.54


def kg_to_lb(kg: float) -> float:
    return kg / KG_PER_LB


def lb_to_kg(lb: float) -> float:
    return lb * KG_PER_LB


def cm_to_inch(cm: float) -> float:
    return cm / CM_PER_INCH


def inch_to_cm(inch: float) -> float:
    return inch * CM_PER_INCH


def seconds_to_label(seconds: int) -> str:
    """85 -> '1:25'. Только для показа; хранится всегда целое число секунд."""
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds} с"
    minutes, rest = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}:{rest:02d}"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}:{minutes:02d}:{rest:02d}"
