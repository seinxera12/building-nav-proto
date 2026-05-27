from PIL import Image, ImageDraw, ImageFont

def generate():
    # Dimensions: 2000 x 1400
    width = 2000
    height = 1400
    
    # Create image with clean slate background
    img = Image.new("RGB", (width, height), "#F1F5F9")
    draw = ImageDraw.Draw(img)
    
    # Define colors
    wall_color = "#94A3B8"      # Slate 400
    corridor_color = "#FFFFFF"  # White
    room_color = "#E2E8F0"      # Slate 200
    room_border = "#64748B"    # Slate 500
    text_color = "#1E293B"     # Slate 800
    
    # Draw corridors
    # Horizontal corridor: y = 380, height = 80px (from y=340 to y=420)
    # Running from x = 200 to x = 1000
    draw.rectangle([180, 340, 1020, 420], fill=corridor_color, outline=wall_color, width=3)
    
    # Vertical corridor West: x = 400, width = 80px (from x=360 to x=440)
    # Running from y = 220 to y = 530
    draw.rectangle([360, 220, 440, 530], fill=corridor_color, outline=wall_color, width=3)
    
    # Vertical corridor East: x = 600, width = 80px (from x=560 to x=640)
    # Running from y = 220 to y = 530
    draw.rectangle([560, 220, 640, 530], fill=corridor_color, outline=wall_color, width=3)
    
    # Overlap cleanup: paint intersection of corridors white
    draw.rectangle([363, 343, 437, 417], fill=corridor_color)
    draw.rectangle([563, 343, 637, 417], fill=corridor_color)
    
    # Draw Rooms/POIs
    rooms = [
        # {"name": "Main Lobby", "x": 100, "y": 320, "w": 140, "h": 120},
        {"name": "Main Lobby", "box": [80, 320, 220, 440], "color": "#BAE6FD", "border": "#0284C7"}, # light blue
        # {"name": "Conference Room A", "box": [220, 120, 380, 220], "color": "#FEE2E2", "border": "#EF4444"}, # light red
        {"name": "Conference Room A", "box": [200, 100, 380, 220], "color": "#FEE2E2", "border": "#EF4444"},
        # {"name": "Office Suite 201", "box": [660, 100, 840, 220], "color": "#FEF3C7", "border": "#F59E0B"}, # light amber
        {"name": "Office Suite 201", "box": [660, 100, 840, 220], "color": "#FEF3C7", "border": "#F59E0B"},
        # {"name": "Restroom", "box": [200, 530, 380, 650], "color": "#E0F2FE", "border": "#0369A1"}, # light teal/blue
        {"name": "Restroom", "box": [200, 530, 380, 650], "color": "#E0F2FE", "border": "#0369A1"},
        # {"name": "Cafeteria", "box": [660, 530, 840, 650], "color": "#DCFCE7", "border": "#22C55E"}, # light green
        {"name": "Cafeteria", "box": [660, 530, 840, 650], "color": "#DCFCE7", "border": "#22C55E"},
        # {"name": "Stairwell A", "box": [160, 470, 280, 560], "color": "#FFEDD5", "border": "#EA580C"}, # light orange
        {"name": "Stairwell A", "box": [160, 460, 280, 560], "color": "#FFEDD5", "border": "#EA580C"},
        # {"name": "IT Department", "box": [900, 320, 1060, 440], "color": "#F3E8FF", "border": "#A855F7"}, # light purple
        {"name": "IT Department", "box": [900, 320, 1060, 440], "color": "#F3E8FF", "border": "#A855F7"},
        # {"name": "Elevator Bank", "box": [760, 340, 840, 420], "color": "#F1F5F9", "border": "#64748B"}
        {"name": "Elevators", "box": [760, 340, 840, 420], "color": "#ECECF1", "border": "#4B5563"}
    ]
    
    for r in rooms:
        draw.rectangle(r["box"], fill=r["color"], outline=r["border"], width=3)
        
        # Draw text labels
        # Let's draw text label centered in the box
        box = r["box"]
        cx = (box[0] + box[2]) // 2
        cy = (box[1] + box[3]) // 2
        
        # Draw label
        draw.text((cx, cy), r["name"], fill=text_color, anchor="mm", align="center")
        
    # Draw floor boundaries / border
    draw.rectangle([10, 10, width-10, height-10], outline="#475569", width=5)
    
    # Save image
    print("[OK] Floor plan image successfully generated at backend/seed/floor_plan.png")

if __name__ == "__main__":
    generate()
