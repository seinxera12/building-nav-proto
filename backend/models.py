from sqlalchemy import Column, Integer, Float, String, Boolean, JSON, ForeignKey, Text, MetaData
from sqlalchemy.orm import DeclarativeBase, relationship

class Base(DeclarativeBase):
    metadata = MetaData(schema="public")

class Floor(Base):
    __tablename__ = "floors"
    id            = Column(Integer, primary_key=True)
    building_id   = Column(Integer, nullable=False, default=1)
    floor_num     = Column(Integer, nullable=False, default=1)
    name          = Column(String)
    map_url       = Column(String)           # e.g. "/maps/floor1.png"
    map_svg_url   = Column(String, nullable=True)  # e.g. "/maps/floor1.svg"
    bounds        = Column(JSON)             # {minX, minY, maxX, maxY}
    # Coordinate system for real-world alignment
    coordinate_system = Column(String, default="pixel")  # "pixel" | "meter" | "geo"
    origin_x         = Column(Float, default=0)          # Real-world X offset (meters)
    origin_y         = Column(Float, default=0)          # Real-world Y offset (meters)
    scale            = Column(Float, default=1.0)        # Pixels per meter
    elevation_m      = Column(Float, default=0)          # Floor elevation in meters
    default_viewport = Column(JSON, nullable=True)        # {zoom, center} for initial view
    is_accessible    = Column(Boolean, default=True)     # Wheelchair accessible

class Node(Base):
    __tablename__ = "nodes"
    id         = Column(Integer, primary_key=True)
    floor_id   = Column(Integer, ForeignKey("floors.id"))
    label      = Column(String, nullable=False)
    type       = Column(String, nullable=False)   # junction/poi/elevator/entrance/qr_anchor/stairs/escalator
    x          = Column(Float, nullable=False)
    y          = Column(Float, nullable=False)
    elevation  = Column(Integer, default=0)       # Floor level (0=ground, 1=first, -1=basement)
    accessible = Column(Boolean, default=True)
    metadata_  = Column("metadata", JSON)          # Extensible: connector info, accessibility details

class Edge(Base):
    __tablename__ = "edges"
    id           = Column(Integer, primary_key=True)
    from_node    = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    to_node      = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    cost         = Column(Float, nullable=False)
    reverse_cost = Column(Float)
    walkable     = Column(Boolean, default=True)
    accessible   = Column(Boolean, default=True)
    # Floor transition support
    edge_type    = Column(String, default="walkable")  # "walkable" | "elevator" | "stairs" | "escalator"
    floor_change = Column(Boolean, default=False)      # True if edge crosses floors
    floor_delta  = Column(Integer, default=0)          # +1 for stairs up, -1 for stairs down

class QRCheckpoint(Base):
    __tablename__ = "qr_checkpoints"
    id       = Column(Integer, primary_key=True)
    qr_code  = Column(String, unique=True, nullable=False)
    node_id  = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    label    = Column(String)
    floor_id = Column(Integer, ForeignKey("floors.id"))

class POI(Base):
    __tablename__ = "pois"
    id           = Column(Integer, primary_key=True)
    node_id      = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    name         = Column(String, nullable=False)
    category     = Column(String)
    search_terms = Column(Text)

class Event(Base):
    __tablename__ = "events"
    id         = Column(Integer, primary_key=True)
    session_id = Column(String)
    event_type = Column(String)
    payload    = Column(JSON)
    created_at = Column(String)   # ISO string, fine for prototype