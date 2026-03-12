#!/usr/bin/env python3
"""Generate Craps Party Vega store icon assets without third-party deps."""

from __future__ import annotations

import os
import struct
import zlib
from pathlib import Path
from typing import Iterable, Tuple

Color = Tuple[int, int, int, int]

ROOT = Path(__file__).resolve().parents[1]
ASSETS_IMAGE = ROOT / "assets" / "image"
STORE_ASSETS = ROOT / "submission" / "store-assets"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def clamp8(value: float) -> int:
    return max(0, min(255, int(value)))


def make_canvas(width: int, height: int, color: Color) -> bytearray:
    r, g, b, a = color
    return bytearray([r, g, b, a] * width * height)


def put_pixel(canvas: bytearray, width: int, x: int, y: int, color: Color) -> None:
    if x < 0 or y < 0:
        return
    height = len(canvas) // (width * 4)
    if x >= width or y >= height:
        return
    idx = (y * width + x) * 4
    r, g, b, a = color
    if a >= 255:
        canvas[idx] = r
        canvas[idx + 1] = g
        canvas[idx + 2] = b
        canvas[idx + 3] = 255
        return

    inv = 255 - a
    canvas[idx] = (r * a + canvas[idx] * inv) // 255
    canvas[idx + 1] = (g * a + canvas[idx + 1] * inv) // 255
    canvas[idx + 2] = (b * a + canvas[idx + 2] * inv) // 255
    canvas[idx + 3] = 255


def fill_radial_gradient(
    canvas: bytearray,
    width: int,
    height: int,
    inner: Tuple[int, int, int],
    outer: Tuple[int, int, int],
) -> None:
    cx = width / 2.0
    cy = height / 2.0
    max_dist = (cx * cx + cy * cy) ** 0.5

    for y in range(height):
        for x in range(width):
            dx = x - cx
            dy = y - cy
            t = min(1.0, ((dx * dx + dy * dy) ** 0.5) / max_dist)
            r = clamp8(inner[0] * (1 - t) + outer[0] * t)
            g = clamp8(inner[1] * (1 - t) + outer[1] * t)
            b = clamp8(inner[2] * (1 - t) + outer[2] * t)
            idx = (y * width + x) * 4
            canvas[idx] = r
            canvas[idx + 1] = g
            canvas[idx + 2] = b
            canvas[idx + 3] = 255


def fill_circle(
    canvas: bytearray,
    width: int,
    cx: float,
    cy: float,
    radius: float,
    color: Color,
) -> None:
    height = len(canvas) // (width * 4)
    rr = radius * radius
    x0 = max(0, int(cx - radius - 1))
    x1 = min(width - 1, int(cx + radius + 1))
    y0 = max(0, int(cy - radius - 1))
    y1 = min(height - 1, int(cy + radius + 1))
    for y in range(y0, y1 + 1):
        dy = (y + 0.5) - cy
        for x in range(x0, x1 + 1):
            dx = (x + 0.5) - cx
            if dx * dx + dy * dy <= rr:
                put_pixel(canvas, width, x, y, color)


def fill_ring(
    canvas: bytearray,
    width: int,
    cx: float,
    cy: float,
    outer_radius: float,
    inner_radius: float,
    color: Color,
) -> None:
    height = len(canvas) // (width * 4)
    rr_outer = outer_radius * outer_radius
    rr_inner = inner_radius * inner_radius
    x0 = max(0, int(cx - outer_radius - 1))
    x1 = min(width - 1, int(cx + outer_radius + 1))
    y0 = max(0, int(cy - outer_radius - 1))
    y1 = min(height - 1, int(cy + outer_radius + 1))
    for y in range(y0, y1 + 1):
        dy = (y + 0.5) - cy
        for x in range(x0, x1 + 1):
            dx = (x + 0.5) - cx
            d2 = dx * dx + dy * dy
            if rr_inner <= d2 <= rr_outer:
                put_pixel(canvas, width, x, y, color)


def _inside_round_rect(
    px: float, py: float, x: float, y: float, w: float, h: float, radius: float
) -> bool:
    if x + radius <= px <= x + w - radius:
        return y <= py <= y + h
    if y + radius <= py <= y + h - radius:
        return x <= px <= x + w

    corners = (
        (x + radius, y + radius),
        (x + w - radius, y + radius),
        (x + radius, y + h - radius),
        (x + w - radius, y + h - radius),
    )
    rr = radius * radius
    for cx, cy in corners:
        dx = px - cx
        dy = py - cy
        if dx * dx + dy * dy <= rr:
            return True
    return False


def fill_round_rect(
    canvas: bytearray,
    width: int,
    x: float,
    y: float,
    w: float,
    h: float,
    radius: float,
    color: Color,
) -> None:
    height = len(canvas) // (width * 4)
    x0 = max(0, int(x))
    x1 = min(width - 1, int(x + w))
    y0 = max(0, int(y))
    y1 = min(height - 1, int(y + h))
    for py in range(y0, y1 + 1):
        for px in range(x0, x1 + 1):
            if _inside_round_rect(px + 0.5, py + 0.5, x, y, w, h, radius):
                put_pixel(canvas, width, px, py, color)


def draw_die(
    canvas: bytearray,
    width: int,
    x: float,
    y: float,
    size: float,
    value: int,
) -> None:
    radius = size * 0.12
    fill_round_rect(canvas, width, x, y, size, size, radius, (244, 244, 244, 255))
    fill_round_rect(
        canvas,
        width,
        x + size * 0.04,
        y + size * 0.04,
        size * 0.92,
        size * 0.92,
        radius * 0.9,
        (252, 252, 252, 120),
    )

    pip_r = max(2.0, size * 0.06)
    c = (
        (x + size * 0.25, y + size * 0.25),
        (x + size * 0.5, y + size * 0.25),
        (x + size * 0.75, y + size * 0.25),
        (x + size * 0.25, y + size * 0.5),
        (x + size * 0.5, y + size * 0.5),
        (x + size * 0.75, y + size * 0.5),
        (x + size * 0.25, y + size * 0.75),
        (x + size * 0.5, y + size * 0.75),
        (x + size * 0.75, y + size * 0.75),
    )
    pip_map = {
        1: [4],
        2: [0, 8],
        3: [0, 4, 8],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8],
    }
    for index in pip_map[value]:
        cx, cy = c[index]
        fill_circle(canvas, width, cx, cy, pip_r, (178, 28, 28, 255))


def draw_chip(
    canvas: bytearray,
    width: int,
    cx: float,
    cy: float,
    radius: float,
    base: Tuple[int, int, int],
    inner: Tuple[int, int, int],
) -> None:
    fill_circle(canvas, width, cx, cy, radius, (*base, 255))
    fill_ring(canvas, width, cx, cy, radius * 0.98, radius * 0.82, (245, 245, 245, 255))
    fill_circle(canvas, width, cx, cy, radius * 0.62, (*inner, 255))
    fill_ring(canvas, width, cx, cy, radius * 0.6, radius * 0.46, (245, 235, 190, 255))
    fill_circle(canvas, width, cx, cy, radius * 0.28, (245, 245, 245, 255))


def write_png(path: Path, width: int, height: int, rgba: Iterable[int]) -> None:
    ensure_dir(path.parent)
    pixels = bytes(rgba)

    scanlines = bytearray()
    stride = width * 4
    for y in range(height):
        scanlines.append(0)  # No PNG filter for this row.
        offset = y * stride
        scanlines.extend(pixels[offset : offset + stride])

    compressed = zlib.compress(bytes(scanlines), level=9)

    def png_chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)

    with path.open("wb") as handle:
        handle.write(b"\x89PNG\r\n\x1a\n")
        handle.write(png_chunk(b"IHDR", ihdr))
        handle.write(png_chunk(b"IDAT", compressed))
        handle.write(png_chunk(b"IEND", b""))


def draw_square_icon(size: int) -> bytearray:
    canvas = make_canvas(size, size, (9, 54, 37, 255))
    fill_radial_gradient(canvas, size, size, (26, 126, 79), (7, 46, 31))

    center = size / 2.0
    fill_ring(
        canvas,
        size,
        center,
        center,
        size * 0.43,
        size * 0.34,
        (233, 180, 89, 255),
    )
    fill_circle(canvas, size, center, center, size * 0.335, (18, 101, 63, 255))
    fill_ring(canvas, size, center, center, size * 0.33, size * 0.324, (235, 240, 237, 180))

    die_size = size * 0.24
    draw_die(canvas, size, size * 0.26, size * 0.30, die_size, 5)
    draw_die(canvas, size, size * 0.52, size * 0.48, die_size, 6)

    draw_chip(
        canvas,
        size,
        size * 0.30,
        size * 0.73,
        size * 0.115,
        (184, 26, 26),
        (123, 15, 15),
    )
    draw_chip(
        canvas,
        size,
        size * 0.72,
        size * 0.28,
        size * 0.085,
        (36, 121, 78),
        (19, 81, 50),
    )
    return canvas


def draw_firetv_icon(width: int, height: int) -> bytearray:
    canvas = make_canvas(width, height, (7, 42, 29, 255))
    fill_radial_gradient(canvas, width, height, (21, 102, 66), (6, 37, 25))

    center_x = width / 2.0
    center_y = height / 2.0
    emblem = min(width, height) * 0.33
    fill_ring(
        canvas,
        width,
        center_x,
        center_y,
        emblem,
        emblem * 0.78,
        (233, 180, 89, 255),
    )
    fill_circle(canvas, width, center_x, center_y, emblem * 0.77, (17, 97, 60, 255))

    die_size = emblem * 0.58
    draw_die(canvas, width, center_x - die_size - 32, center_y - die_size * 0.55, die_size, 4)
    draw_die(canvas, width, center_x + 28, center_y - die_size * 0.08, die_size, 6)

    draw_chip(
        canvas,
        width,
        center_x - emblem * 0.85,
        center_y + emblem * 0.65,
        emblem * 0.28,
        (184, 26, 26),
        (123, 15, 15),
    )
    draw_chip(
        canvas,
        width,
        center_x + emblem * 0.78,
        center_y - emblem * 0.62,
        emblem * 0.22,
        (36, 121, 78),
        (19, 81, 50),
    )

    return canvas


def main() -> None:
    ensure_dir(ASSETS_IMAGE)
    ensure_dir(STORE_ASSETS)

    icon_512 = draw_square_icon(512)
    icon_114 = draw_square_icon(114)
    firetv_icon = draw_firetv_icon(1280, 720)

    write_png(ASSETS_IMAGE / "craps_party_icon.png", 512, 512, icon_512)
    write_png(ASSETS_IMAGE / "craps_party_icon_large.png", 512, 512, icon_512)
    write_png(ASSETS_IMAGE / "craps_party_icon_small.png", 114, 114, icon_114)

    write_png(STORE_ASSETS / "icon_large_512.png", 512, 512, icon_512)
    write_png(STORE_ASSETS / "icon_small_114.png", 114, 114, icon_114)
    write_png(STORE_ASSETS / "firetv_app_icon_1280x720.png", 1280, 720, firetv_icon)

    print("Generated store assets:")
    print(f"- {ASSETS_IMAGE / 'craps_party_icon.png'}")
    print(f"- {ASSETS_IMAGE / 'craps_party_icon_large.png'}")
    print(f"- {ASSETS_IMAGE / 'craps_party_icon_small.png'}")
    print(f"- {STORE_ASSETS / 'icon_large_512.png'}")
    print(f"- {STORE_ASSETS / 'icon_small_114.png'}")
    print(f"- {STORE_ASSETS / 'firetv_app_icon_1280x720.png'}")


if __name__ == "__main__":
    main()
