from sqlalchemy import Column, Integer, Float, String, Boolean, JSON, ForeignKey, Text, MetaData
from sqlalchemy.orm import DeclarativeBase, relationship

class Base(DeclarativeBase):
    metadata = MetaData(schema="public")

class Floor(Base):
    __tablename__ = "floors"
    id         = Column(Integer, primary_key=True)
    building_id = Column(Integer, nullable=False, default=1)
    floor_num  = Column(Integer, nullable=False, default=1)
    name       = Column(String)
    map_url    = Column(String)           # e.g. "/maps/floor1.png"
    bounds     = Column(JSON)             # {minX, minY, maxX, maxY}

class Node(Base):
    __tablename__ = "nodes"
    id         = Column(Integer, primary_key=True)
    floor_id   = Column(Integer, ForeignKey("floors.id"))
    label      = Column(String, nullable=False)
    type       = Column(String, nullable=False)   # junction/poi/elevator/entrance/qr_anchor
    x          = Column(Float, nullable=False)
    y          = Column(Float, nullable=False)
    accessible = Column(Boolean, default=True)
    metadata_  = Column("metadata", JSON)

class Edge(Base):
    __tablename__ = "edges"
    id           = Column(Integer, primary_key=True)
    from_node    = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    to_node      = Column(Integer, ForeignKey("nodes.id"), nullable=False)
    cost         = Column(Float, nullable=False)
    reverse_cost = Column(Float)
    walkable     = Column(Boolean, default=True)
    accessible   = Column(Boolean, default=True)

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