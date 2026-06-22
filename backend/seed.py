# seed.py
import json
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from models import Base, Floor, Node, Edge, QRCheckpoint, POI
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("SYNC_DATABASE_URL"))

# Always resolve seed data relative to this file, regardless of CWD
_HERE = os.path.dirname(os.path.abspath(__file__))
_SEED_DIR = os.path.join(_HERE, "seed")


def _load(filename):
    with open(os.path.join(_SEED_DIR, filename)) as f:
        return json.load(f)


def run():
    # Generate floor plan images first
    try:
        from generate_floorplan import generate
        generate()
    except Exception as e:
        print(f"⚠️  Floor plan generation failed: {e} — continuing with existing images")

    Base.metadata.drop_all(engine)    # clean slate each seed
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        # Floor 1 - Ground Level (2000×1400)
        floor1 = Floor(
            id=1, building_id=1, floor_num=1,
            name="Level 1 · Ground Floor",
            map_url="/maps/floor1.png",
            map_svg_url="/assets/floors/floor-1-new.svg",
            bounds={"minX": 0, "minY": 0, "maxX": 2000, "maxY": 1400},
            coordinate_system="pixel",
            origin_x=0, origin_y=0, scale=1.0,
            elevation_m=0,
            default_viewport={"zoom": 0, "center": [700, 1000]},
            is_accessible=True
        )
        db.add(floor1)

        # Floor 2 - Upper Level (2000×1400)
        floor2 = Floor(
            id=2, building_id=1, floor_num=2,
            name="Level 2 · Upper Floor",
            map_url="/maps/floor2.png",
            map_svg_url="/assets/floors/floor-2-new.svg",
            bounds={"minX": 0, "minY": 0, "maxX": 2000, "maxY": 1400},
            coordinate_system="pixel",
            origin_x=0, origin_y=0, scale=1.0,
            elevation_m=4.0,
            default_viewport={"zoom": 0, "center": [1000, 700]},
            is_accessible=True
        )
        db.add(floor2)
        db.flush()

        # Nodes
        nodes_data = _load("nodes.json")
        for n in nodes_data:
            db.add(Node(
                id=n["id"], floor_id=n["floor_id"],
                label=n["label"], type=n["type"],
                x=n["x"], y=n["y"],
                elevation=n.get("elevation", 0)
            ))
        db.flush()

        # Edges
        edges_data = _load("edges.json")
        for e in edges_data:
            db.add(Edge(
                from_node=e["from"], to_node=e["to"],
                cost=e["cost"],
                reverse_cost=e.get("reverse_cost", e["cost"]),
                edge_type=e.get("edge_type", "walkable"),
                floor_change=e.get("floor_change", False),
                floor_delta=e.get("floor_delta", 0)
            ))
        db.flush()

        # QR Checkpoints
        qr_data = _load("qr_codes.json")
        for q in qr_data:
            db.add(QRCheckpoint(
                qr_code=q["qr_code"], node_id=q["node_id"],
                label=q["label"], floor_id=q["floor_id"]
            ))

        # POIs — all nodes with a user-facing type
        poi_types = {"poi", "elevator", "entrance", "stairs", "escalator"}
        pois = [n for n in nodes_data if n["type"] in poi_types]
        for p in pois:
            db.add(POI(
                node_id=p["id"], name=p["label"],
                category=p["type"],
                search_terms=p["label"].lower()
            ))

        db.commit()

        floor1_nodes = sum(1 for n in nodes_data if n["floor_id"] == 1)
        floor2_nodes = sum(1 for n in nodes_data if n["floor_id"] == 2)
        connector_edges = sum(1 for e in edges_data if e.get("floor_change"))
        print(f"✅ Seeded:")
        print(f"   - Floor 1 (Ground Floor): {floor1_nodes} nodes")
        print(f"   - Floor 2 (Second Floor): {floor2_nodes} nodes")
        print(f"   - {len(edges_data)} edges ({connector_edges} floor connectors)")
        print(f"   - {len(qr_data)} QR codes")
        print(f"   - {len(pois)} POIs")


if __name__ == "__main__":
    run()
