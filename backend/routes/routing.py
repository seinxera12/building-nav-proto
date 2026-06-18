# routes/routing.py
import math
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db import AsyncSessionLocal
from graph import nav_graph

router = APIRouter()

# Connector edge types that represent floor transitions
FLOOR_TRANSITION_TYPES = {"elevator", "stairs", "escalator"}


@router.get("/route")
async def get_route(from_: int, to: int, accessible_only: bool = False):
    path = nav_graph.shortest_path(from_, to, accessible_only=accessible_only)
    if not path:
        raise HTTPException(404, detail=f"No path from {from_} to {to}")

    # Annotate path with floor metadata — used by both instructions and floorTransitions
    path_meta = nav_graph.path_with_floors(path)

    # Build floor-aware instructions
    instructions = generate_instructions(path, path_meta)

    # Derive floor transitions from path metadata
    floor_transitions = extract_floor_transitions(path_meta)

    # Find QR checkpoints along the path
    checkpoints = []
    async with AsyncSessionLocal() as db:
        for node_id in path[1:-1]:
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

    # Fetch floor names for transition labels
    floor_ids = {m["floor_id"] for m in path_meta if m["floor_id"]}
    floor_names: dict[int, str] = {}
    if floor_ids:
        async with AsyncSessionLocal() as db:
            rows = (await db.execute(
                text("SELECT id, name, floor_num FROM public.floors WHERE id = ANY(:ids)"),
                {"ids": list(floor_ids)}
            )).fetchall()
            floor_names = {r.id: r.name for r in rows}

    # Enrich floor transition labels and instruction text
    for ft in floor_transitions:
        ft["fromFloorName"] = floor_names.get(ft["fromFloor"], f"Floor {ft['fromFloor']}")
        ft["toFloorName"]   = floor_names.get(ft["toFloor"],   f"Floor {ft['toFloor']}")

    # Re-render transition instruction text now that floor names are available
    for inst in instructions:
        if inst["turn"] in FLOOR_TRANSITION_TYPES:
            to_floor_name = floor_names.get(inst.get("toFloorId"), f"Floor {inst.get('toFloorId', '?')}")
            inst["text"] = build_transition_text(inst["turn"], inst["nodeLabel"], to_floor_name)

    total_distance = sum(
        nav_graph.euclidean_cost(path[i], path[i + 1])
        for i in range(len(path) - 1)
        # Only count same-floor edges in distance — connector travel is not pixel distance
        if not path_meta[i]["floor_change"]
    )

    return {
        "path": path,
        "instructions": instructions,
        "checkpoints": checkpoints,
        "totalDistance": round(total_distance, 1),
        "floorTransitions": floor_transitions,
    }


# ── Instruction generation ────────────────────────────────────────

def generate_instructions(path: list[int], path_meta: list[dict]) -> list[dict]:
    """Generate floor-aware turn-by-turn instructions.

    Each instruction includes:
      step, text, distance, turn, nodeId, floorId
    For floor-transition steps: also toFloorId, nodeLabel
    """
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
            "nodeId": path[0],
            "floorId": curr.get("floor_id"),
        }]

    for i, curr_id in enumerate(path):
        curr = nodes[curr_id]
        curr_floor = path_meta[i]["floor_id"]

        if i == 0:
            # Start instruction
            next_id = path[i + 1]
            nxt = nodes[next_id]
            dist = nav_graph.euclidean_cost(curr_id, next_id)
            turn = "start"
            text_ = f"Start at {curr['label']}, head toward {nxt['label']}"
            inst = {
                "step": len(instructions) + 1,
                "text": text_,
                "distance": round(dist, 1),
                "turn": turn,
                "nodeId": curr_id,
                "floorId": curr_floor,
            }

        elif i == len(path) - 1:
            # Destination
            inst = {
                "step": len(instructions) + 1,
                "text": f"Arrive at {curr['label']}",
                "distance": 0,
                "turn": "destination",
                "nodeId": curr_id,
                "floorId": curr_floor,
            }

        else:
            next_id = path[i + 1]
            nxt = nodes[next_id]
            next_floor = path_meta[i + 1]["floor_id"]
            dist = nav_graph.euclidean_cost(curr_id, next_id)

            # Check if the outgoing edge from curr to next is a floor transition
            edge_type = path_meta[i]["edge_type"]
            is_transition = path_meta[i]["floor_change"] or edge_type in FLOOR_TRANSITION_TYPES

            if is_transition and curr_floor != next_floor:
                turn = edge_type if edge_type in FLOOR_TRANSITION_TYPES else "elevator"
                # Text will be patched with floor name after floor DB lookup
                text_ = build_transition_text(turn, curr["label"], f"Floor {next_floor}")
                inst = {
                    "step": len(instructions) + 1,
                    "text": text_,
                    "distance": 0,  # floor transition cost is wait/travel, not walking distance
                    "turn": turn,
                    "nodeId": curr_id,
                    "floorId": curr_floor,
                    "toFloorId": next_floor,
                    "nodeLabel": curr["label"],
                }
            else:
                prev_node = nodes[path[i - 1]]
                turn = compute_turn(prev_node, curr, nxt)
                text_ = build_text(turn, curr, nxt)
                inst = {
                    "step": len(instructions) + 1,
                    "text": text_,
                    "distance": round(dist, 1),
                    "turn": turn,
                    "nodeId": curr_id,
                    "floorId": curr_floor,
                }

        instructions.append(inst)

    return instructions


def extract_floor_transitions(path_meta: list[dict]) -> list[dict]:
    """Scan path metadata and return list of floor-crossing events."""
    transitions = []
    for i, meta in enumerate(path_meta[:-1]):
        next_meta = path_meta[i + 1]
        if meta["floor_change"] and meta["floor_id"] != next_meta["floor_id"]:
            transitions.append({
                "fromFloor": meta["floor_id"],
                "toFloor": next_meta["floor_id"],
                "connectorNodeId": meta["node_id"],
                "type": meta["edge_type"] if meta["edge_type"] in FLOOR_TRANSITION_TYPES else "elevator",
                "fromFloorName": f"Floor {meta['floor_id']}",
                "toFloorName": f"Floor {next_meta['floor_id']}",
            })
    return transitions


# ── Turn / text helpers ───────────────────────────────────────────

def compute_turn(prev: dict, curr: dict, next_: dict) -> str:
    v1x, v1y = curr["x"] - prev["x"], curr["y"] - prev["y"]
    v2x, v2y = next_["x"] - curr["x"], next_["y"] - curr["y"]

    len1 = math.hypot(v1x, v1y)
    len2 = math.hypot(v2x, v2y)
    if len1 < 20 or len2 < 20:
        return "straight"

    v1x, v1y = v1x / len1, v1y / len1
    v2x, v2y = v2x / len2, v2y / len2

    angle = math.degrees(math.atan2(v2y, v2x) - math.atan2(v1y, v1x))
    if angle > 180:  angle -= 360
    if angle < -180: angle += 360
    if abs(angle) < 30:  return "straight"
    if abs(angle) > 150: return "u_turn"
    return "right" if angle > 0 else "left"


def build_text(turn: str, curr: dict, next_: dict) -> str:
    templates = {
        "start":       f"Start at {curr['label']}, head toward {next_['label']}",
        "straight":    f"Continue straight toward {next_['label']}",
        "left":        f"Turn left at {curr['label']}",
        "right":       f"Turn right at {curr['label']}",
        "u_turn":      f"Turn around at {curr['label']}",
        "destination": f"Arrive at {curr['label']}",
    }
    return templates.get(turn, f"Continue to {next_['label']}")


def build_transition_text(edge_type: str, connector_label: str, to_floor_name: str) -> str:
    """Build human-readable floor-transition instruction."""
    verb_map = {
        "elevator":  "Take the elevator",
        "stairs":    "Take the stairs",
        "escalator": "Take the escalator",
    }
    verb = verb_map.get(edge_type, "Use the connector")
    return f"{verb} at {connector_label} to {to_floor_name}"
