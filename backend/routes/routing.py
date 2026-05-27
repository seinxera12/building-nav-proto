# routes/routing.py
import math
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db import AsyncSessionLocal
from graph import nav_graph

router = APIRouter()


@router.get("/route")
async def get_route(from_: int, to: int):
    # Dijkstra
    path = nav_graph.shortest_path(from_, to)
    if not path:
        raise HTTPException(404, detail=f"No path from {from_} to {to}")

    # Build instructions from path geometry
    instructions = generate_instructions(path)

    # Find QR checkpoints along the path
    checkpoints = []
    async with AsyncSessionLocal() as db:
        for node_id in path[1:-1]:   # exclude start and end
            result = await db.execute(
                text("SELECT qr_code, label FROM public.qr_checkpoints WHERE node_id = :nid"),
                {"nid": node_id}
            )
            row = result.fetchone()
            if row:
                checkpoints.append({
                    "nodeId": node_id,
                    "qrCode": row.qr_code,
                    "label": row.label
                })

    total_distance = sum(
        nav_graph.euclidean_cost(path[i], path[i+1])
        for i in range(len(path) - 1)
    )

    return {
        "path": path,
        "instructions": instructions,
        "checkpoints": checkpoints,
        "totalDistance": round(total_distance, 1)
    }


def generate_instructions(path: list[int]) -> list[dict]:
    """Generate turn-by-turn instructions from a sequence of node IDs."""
    instructions = []
    nodes = nav_graph.nodes

    if not path:
        return instructions

    if len(path) == 1:
        curr = nodes[path[0]]
        return [{
            "step": 1,
            "text": f"Arrive at {curr['label']}",
            "distance": 0,
            "turn": "destination",
            "nodeId": path[0]
        }]

    for i, curr_id in enumerate(path):
        curr = nodes[curr_id]

        if i == 0:
            next_id = path[i + 1]
            nxt = nodes[next_id]
            dist = nav_graph.euclidean_cost(curr_id, next_id)
            turn = "start"
            text_ = f"Start at {curr['label']}, head towards {nxt['label']}"
        elif i == len(path) - 1:
            dist = 0
            turn = "destination"
            text_ = f"Arrive at {curr['label']}"
        else:
            next_id = path[i + 1]
            nxt = nodes[next_id]
            dist = nav_graph.euclidean_cost(curr_id, next_id)
            prev = nodes[path[i - 1]]
            turn = compute_turn(prev, curr, nxt)
            text_ = turn_to_text(turn, curr["label"], nxt["label"])

        instructions.append({
            "step": len(instructions) + 1,
            "text": text_,
            "distance": round(dist, 1),
            "turn": turn,
            "nodeId": curr_id
        })

    return instructions


def compute_turn(prev: dict, curr: dict, next_: dict) -> str:
    """Calculate turn direction from three consecutive node positions using atan2 vector math."""
    v1x, v1y = curr["x"] - prev["x"], curr["y"] - prev["y"]
    v2x, v2y = next_["x"] - curr["x"], next_["y"] - curr["y"]
    angle = math.degrees(math.atan2(v2y, v2x) - math.atan2(v1y, v1x))
    if angle > 180: angle -= 360
    if angle < -180: angle += 360
    if abs(angle) < 25: return "straight"
    return "right" if angle > 0 else "left"


def turn_to_text(turn: str, curr_label: str, next_label: str) -> str:
    """Convert turn direction enum to natural language instruction."""
    if turn == "straight":
        return f"Continue straight past {curr_label}"
    if turn == "left":
        return f"Turn left at {curr_label}"
    if turn == "right":
        return f"Turn right at {curr_label}"
    return f"Continue to {next_label}"
