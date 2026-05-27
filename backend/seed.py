# seed.py
import json
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from models import Base, Floor, Node, Edge, QRCheckpoint, POI
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("SYNC_DATABASE_URL"))


def run():
    Base.metadata.drop_all(engine)    # clean slate each seed
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        # Floor
        floor = Floor(
            id=1, building_id=1, floor_num=1,
            name="Ground Floor",
            map_url="/maps/floor_plan.png",
            bounds={"minX": 0, "minY": 0, "maxX": 2000, "maxY": 1400}
        )
        db.add(floor)
        db.flush()

        # Nodes
        nodes_data = json.load(open("seed/nodes.json"))
        for n in nodes_data:
            db.add(Node(
                id=n["id"], floor_id=n["floor_id"],
                label=n["label"], type=n["type"],
                x=n["x"], y=n["y"]
            ))
        db.flush()

        # Edges
        edges_data = json.load(open("seed/edges.json"))
        for e in edges_data:
            db.add(Edge(
                from_node=e["from"], to_node=e["to"],
                cost=e["cost"], reverse_cost=e["cost"]
            ))
        db.flush()

        # QR Checkpoints
        qr_data = json.load(open("seed/qr_codes.json"))
        for q in qr_data:
            db.add(QRCheckpoint(
                qr_code=q["qr_code"], node_id=q["node_id"],
                label=q["label"], floor_id=q["floor_id"]
            ))

        # POIs (subset of nodes that are searchable destinations)
        pois = [n for n in nodes_data if n["type"] in ("poi", "elevator", "entrance", "stairs")]
        for p in pois:
            db.add(POI(
                node_id=p["id"], name=p["label"],
                category=p["type"],
                search_terms=p["label"].lower()
            ))

        db.commit()
        print(f"✅ Seeded: {len(nodes_data)} nodes, {len(edges_data)} edges, {len(qr_data)} QR codes")


if __name__ == "__main__":
    run()
