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
    Layout: main lobby center, vertical corridors, rooms on all sides.
    Connectors at east: elevator bank and stairwell.
    Room boxes surround POI nodes as specified.
    """
    width, height = 2000, 1400
    corridor_color = "#FFFFFF"
    wall_color = "#94A3B8"
    text_color = "#1E293B"

    img = Image.new("RGB", (width, height), "#F1F5F9")
    draw = ImageDraw.Draw(img)

    # Corridor fills
    # Main east-west spine: y=640-760, x=100 to 1900
    draw.rectangle([100, 640, 1900, 760], fill=corridor_color, outline=wall_color, width=3)
    # West vertical corridor: x=540-660 (around x=600), y=200 to 1300
    draw.rectangle([540, 200, 660, 1300], fill=corridor_color, outline=wall_color, width=3)
    # Center vertical corridor: x=940-1060 (around x=1000), y=200 to 1300
    draw.rectangle([940, 200, 1060, 1300], fill=corridor_color, outline=wall_color, width=3)
    # East vertical corridor: x=1340-1460 (around x=1400), y=200 to 1300
    draw.rectangle([1340, 200, 1460, 1300], fill=corridor_color, outline=wall_color, width=3)
    # Clean corridor intersections with spine
    draw.rectangle([543, 643, 657, 757], fill=corridor_color)
    draw.rectangle([943, 643, 1057, 757], fill=corridor_color)
    draw.rectangle([1343, 643, 1457, 757], fill=corridor_color)

    rooms = [
        # Main Lobby: [880,1150]–[1120,1320] - surrounds node at (1000, 1250)
        {"name": "Main Lobby",        "box": [880, 1150, 1120, 1320], "color": "#BAE6FD", "border": "#0284C7"},
        # Conference Room A: [460,120]–[740,330] - surrounds node at (600, 250)
        {"name": "Conference Room A", "box": [460, 120, 740, 330], "color": "#FEE2E2", "border": "#EF4444"},
        # Office Suite 201: [860,120]–[1140,330] - surrounds node at (1000, 250)
        {"name": "Office Suite 201",  "box": [860, 120, 1140, 330], "color": "#FEF3C7", "border": "#F59E0B"},
        # Restroom: [460,1040]–[740,1260] - surrounds node at (600, 1150)
        {"name": "Restroom",          "box": [460, 1040, 740, 1260], "color": "#E0F2FE", "border": "#0369A1"},
        # Cafeteria: [1240,1040]–[1560,1260] - surrounds node at (1400, 1150)
        {"name": "Cafeteria",         "box": [1240, 1040, 1560, 1260], "color": "#DCFCE7", "border": "#22C55E"},
        # IT Department: [1580,580]–[1860,820] - surrounds node at (1700, 700)
        {"name": "IT Department",     "box": [1580, 580, 1860, 820], "color": "#F3E8FF", "border": "#A855F7"},
        # Elevator Bank: [1100,640]–[1200,760] - surrounds node at (1150, 700)
        {"name": "Elevator Bank",     "box": [1100, 640, 1200, 760], "color": "#ECECF1", "border": "#4B5563"},
        # Stairwell A: [790,640]–[910,760] - surrounds node at (850, 700)
        {"name": "Stairwell A",       "box": [790, 640, 910, 760], "color": "#FFEDD5", "border": "#EA580C"},
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
    Room boxes surround POI nodes as specified.
    """
    width, height = 1200, 800
    corridor_color = "#FFFFFF"
    wall_color = "#94A3B8"
    text_color = "#1E293B"

    img = Image.new("RGB", (width, height), "#EFF6FF")
    draw = ImageDraw.Draw(img)

    # Corridor fills
    # Main east-west spine: y=340-420, x=60 to 1140
    draw.rectangle([60, 340, 1140, 420], fill=corridor_color, outline=wall_color, width=3)
    # West vertical corridor: x=320-440 (around x=380)
    draw.rectangle([320, 40, 440, 700], fill=corridor_color, outline=wall_color, width=3)
    # Center vertical corridor: x=540-660 (around x=600)
    draw.rectangle([540, 40, 660, 700], fill=corridor_color, outline=wall_color, width=3)
    # East vertical corridor: x=760-880 (around x=820)
    draw.rectangle([760, 40, 880, 700], fill=corridor_color, outline=wall_color, width=3)
    # Clean corridor intersections with spine
    draw.rectangle([323, 343, 437, 417], fill=corridor_color)
    draw.rectangle([543, 343, 657, 417], fill=corridor_color)
    draw.rectangle([763, 343, 877, 417], fill=corridor_color)

    rooms = [
        # Floor 2 Lobby: [60,330]–[200,470] - surrounds node at (120, 400)
        {"name": "Floor 2 Lobby",    "box": [60, 330, 200, 470], "color": "#C7D2FE", "border": "#4F46E5"},
        # Meeting Room B1: [250,40]–[510,180] - surrounds node at (380, 100)
        {"name": "Meeting Room B1",  "box": [250, 40, 510, 180], "color": "#FEE2E2", "border": "#EF4444"},
        # Meeting Room B2: [690,40]–[950,180] - surrounds node at (820, 100)
        {"name": "Meeting Room B2",  "box": [690, 40, 950, 180], "color": "#FEF3C7", "border": "#D97706"},
        # Break Room: [250,620]–[510,770] - surrounds node at (380, 700)
        {"name": "Break Room",       "box": [250, 620, 510, 770], "color": "#D1FAE5", "border": "#059669"},
        # Lounge Area: [690,620]–[950,770] - surrounds node at (820, 700)
        {"name": "Lounge Area",      "box": [690, 620, 950, 770], "color": "#FDE68A", "border": "#D97706"},
        # Executive Office: [960,300]–[1180,500] - surrounds node at (1080, 400)
        {"name": "Executive Office", "box": [960, 300, 1180, 500], "color": "#E9D5FF", "border": "#7C3AED"},
        # Elevator Bank: [640,360]–[740,440] - surrounds node at (690, 400)
        {"name": "Elevator Bank",    "box": [640, 360, 740, 440], "color": "#ECECF1", "border": "#4B5563"},
        # Stairwell A: [460,360]–[560,440] - surrounds node at (510, 400)
        {"name": "Stairwell A",      "box": [460, 360, 560, 440], "color": "#FFEDD5", "border": "#EA580C"},
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