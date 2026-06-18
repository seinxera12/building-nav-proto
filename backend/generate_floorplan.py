from PIL import Image, ImageDraw, ImageFont
import os

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "seed")


def _draw_floor_border(draw, width, height):
    draw.rectangle([10, 10, width - 10, height - 10], outline="#475569", width=5)


def _draw_room(draw, room, text_color):
    draw.rectangle(room["box"], fill=room["color"], outline=room["border"], width=3)
    box = room["box"]
    cx = (box[0] + box[2]) // 2
    cy = (box[1] + box[3]) // 2
    draw.text((cx, cy), room["name"], fill=text_color, anchor="mm", align="center")


def generate_floor1():
    """Ground Floor — 2000×1400px.
    Layout: main lobby at west, two vertical corridors, rooms on all sides.
    Connectors at east: elevator bank and stairwell.
    """
    width, height = 2000, 1400
    corridor_color = "#FFFFFF"
    wall_color = "#94A3B8"
    text_color = "#1E293B"

    img = Image.new("RGB", (width, height), "#F1F5F9")
    draw = ImageDraw.Draw(img)

    # Horizontal corridor y=340-420
    draw.rectangle([180, 340, 1020, 420], fill=corridor_color, outline=wall_color, width=3)
    # Vertical corridor West x=360-440
    draw.rectangle([360, 220, 440, 530], fill=corridor_color, outline=wall_color, width=3)
    # Vertical corridor East x=560-640
    draw.rectangle([560, 220, 640, 530], fill=corridor_color, outline=wall_color, width=3)
    # Clean intersections
    draw.rectangle([363, 343, 437, 417], fill=corridor_color)
    draw.rectangle([563, 343, 637, 417], fill=corridor_color)

    rooms = [
        {"name": "Main Lobby",        "box": [80,  320, 220, 440], "color": "#BAE6FD", "border": "#0284C7"},
        {"name": "Conference\nRoom A","box": [200, 100, 380, 220], "color": "#FEE2E2", "border": "#EF4444"},
        {"name": "Office Suite\n201", "box": [660, 100, 840, 220], "color": "#FEF3C7", "border": "#F59E0B"},
        {"name": "Restroom",          "box": [200, 530, 380, 650], "color": "#E0F2FE", "border": "#0369A1"},
        {"name": "Cafeteria",         "box": [660, 530, 840, 650], "color": "#DCFCE7", "border": "#22C55E"},
        {"name": "Stairwell A",       "box": [160, 460, 280, 560], "color": "#FFEDD5", "border": "#EA580C"},
        {"name": "IT Dept",           "box": [900, 320, 1060, 440], "color": "#F3E8FF", "border": "#A855F7"},
        {"name": "Elevators",         "box": [760, 340, 840, 420],  "color": "#ECECF1", "border": "#4B5563"},
    ]

    for r in rooms:
        _draw_room(draw, r, text_color)

    # Floor label
    draw.text((1800, 50), "Floor 1", fill="#475569", anchor="mm")

    _draw_floor_border(draw, width, height)

    out = os.path.join(OUTPUT_DIR, "floor1.png")
    img.save(out)
    print(f"[OK] Floor 1 image saved → {out}")
    return out


def generate_floor2():
    """Second Floor — 1200×800px.
    Smaller footprint than ground floor; different room arrangement.
    Open-plan meeting zone, executive wing, break rooms.
    Same vertical position for elevator/stairs so connectors line up.
    """
    width, height = 1200, 800
    corridor_color = "#FFFFFF"
    wall_color = "#94A3B8"
    text_color = "#1E293B"

    img = Image.new("RGB", (width, height), "#EFF6FF")  # slightly different tint
    draw = ImageDraw.Draw(img)

    # Main horizontal corridor  y=340-420  (same band as floor1)
    draw.rectangle([180, 340, 900, 420], fill=corridor_color, outline=wall_color, width=3)
    # North vertical corridor  x=380-460
    draw.rectangle([380, 180, 460, 450], fill=corridor_color, outline=wall_color, width=3)
    # South vertical corridor  x=560-640
    draw.rectangle([560, 350, 640, 560], fill=corridor_color, outline=wall_color, width=3)
    # Clean intersections
    draw.rectangle([383, 343, 457, 417], fill=corridor_color)
    draw.rectangle([563, 343, 637, 417], fill=corridor_color)

    rooms = [
        # West lobby / reception
        {"name": "Floor 2\nReception",  "box": [60,  300, 200, 460], "color": "#C7D2FE", "border": "#4F46E5"},
        # North wing — two meeting rooms with different sizes
        {"name": "Meeting\nRoom B1",    "box": [200, 80,  400, 230], "color": "#FEE2E2", "border": "#EF4444"},
        {"name": "Meeting\nRoom B2",    "box": [460, 80,  680, 220], "color": "#FEF3C7", "border": "#D97706"},
        # South wing
        {"name": "Break Room",          "box": [200, 490, 400, 640], "color": "#D1FAE5", "border": "#059669"},
        {"name": "Lounge Area",         "box": [460, 490, 680, 640], "color": "#FDE68A", "border": "#D97706"},
        # East wing — larger executive space + storage
        {"name": "Executive\nOffice",   "box": [780, 270, 1000, 470], "color": "#E9D5FF", "border": "#7C3AED"},
        {"name": "Storage",             "box": [780, 480, 900,  600], "color": "#F3F4F6", "border": "#6B7280"},
        # Connectors — same X as floor 1 so arrows make sense
        {"name": "Elevators",           "box": [760, 340, 840, 420],  "color": "#ECECF1", "border": "#4B5563"},
        {"name": "Stairwell A",         "box": [160, 430, 280, 530], "color": "#FFEDD5", "border": "#EA580C"},
    ]

    for r in rooms:
        _draw_room(draw, r, text_color)

    # Floor label
    draw.text((1100, 50), "Floor 2", fill="#475569", anchor="mm")

    _draw_floor_border(draw, width, height)

    out = os.path.join(OUTPUT_DIR, "floor2.png")
    img.save(out)
    print(f"[OK] Floor 2 image saved → {out}")
    return out


def generate():
    """Generate all floor plan images."""
    generate_floor1()
    generate_floor2()


if __name__ == "__main__":
    generate()
