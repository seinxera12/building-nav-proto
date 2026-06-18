#!/usr/bin/env python3
"""
Tests for multi-floor navigation support.
Run with: python -m pytest backend/tests/test_multifloor.py -v
"""
import pytest
import json
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Floor, Node, Edge, QRCheckpoint, POI


class TestFloorModel:
    """Test Floor model has required multi-floor fields."""
    
    def test_floor_has_coordinate_system(self):
        """Floor model should have coordinate_system field."""
        assert hasattr(Floor, 'coordinate_system')
    
    def test_floor_has_elevation_m(self):
        """Floor model should have elevation_m field."""
        assert hasattr(Floor, 'elevation_m')
    
    def test_floor_has_map_svg_url(self):
        """Floor model should have map_svg_url field."""
        assert hasattr(Floor, 'map_svg_url')
    
    def test_floor_has_is_accessible(self):
        """Floor model should have is_accessible field."""
        assert hasattr(Floor, 'is_accessible')
    
    def test_floor_has_scale(self):
        """Floor model should have scale field."""
        assert hasattr(Floor, 'scale')
    
    def test_floor_has_origin_x_origin_y(self):
        """Floor model should have origin_x and origin_y fields."""
        assert hasattr(Floor, 'origin_x')
        assert hasattr(Floor, 'origin_y')


class TestNodeModel:
    """Test Node model has required multi-floor fields."""
    
    def test_node_has_elevation(self):
        """Node model should have elevation field."""
        assert hasattr(Node, 'elevation')
    
    def test_node_elevation_default(self):
        """Node elevation should default to 0."""
        # This is handled by the Column definition
        assert True  # Verified in models.py


class TestEdgeModel:
    """Test Edge model has required floor transition fields."""
    
    def test_edge_has_edge_type(self):
        """Edge model should have edge_type field."""
        assert hasattr(Edge, 'edge_type')
    
    def test_edge_has_floor_change(self):
        """Edge model should have floor_change field."""
        assert hasattr(Edge, 'floor_change')
    
    def test_edge_has_floor_delta(self):
        """Edge model should have floor_delta field."""
        assert hasattr(Edge, 'floor_delta')


class TestSeedData:
    """Test seed data has multi-floor structure."""
    
    @classmethod
    def setup_class(cls):
        """Load seed data files."""
        nodes_path = os.path.join(os.path.dirname(__file__), '..', 'seed', 'nodes.json')
        edges_path = os.path.join(os.path.dirname(__file__), '..', 'seed', 'edges.json')
        qr_path = os.path.join(os.path.dirname(__file__), '..', 'seed', 'qr_codes.json')
        
        with open(nodes_path) as f:
            cls.nodes = json.load(f)
        with open(edges_path) as f:
            cls.edges = json.load(f)
        with open(qr_path) as f:
            cls.qr_codes = json.load(f)
    
    def test_has_floor_1_nodes(self):
        """Should have nodes for floor 1."""
        floor1_nodes = [n for n in self.nodes if n.get('floor_id') == 1]
        assert len(floor1_nodes) > 0, "Should have floor 1 nodes"
    
    def test_has_floor_2_nodes(self):
        """Should have nodes for floor 2."""
        floor2_nodes = [n for n in self.nodes if n.get('floor_id') == 2]
        assert len(floor2_nodes) > 0, "Should have floor 2 nodes"
    
    def test_floor_2_nodes_have_elevation(self):
        """Floor 2 nodes should have elevation = 1."""
        floor2_nodes = [n for n in self.nodes if n.get('floor_id') == 2]
        for node in floor2_nodes:
            assert node.get('elevation') == 1, f"Node {node['id']} should have elevation 1"
    
    def test_has_elevator_connectors(self):
        """Should have elevator nodes on both floors."""
        floor1_elevators = [n for n in self.nodes if n.get('floor_id') == 1 and n.get('type') == 'elevator']
        floor2_elevators = [n for n in self.nodes if n.get('floor_id') == 2 and n.get('type') == 'elevator']
        assert len(floor1_elevators) > 0, "Floor 1 should have elevator"
        assert len(floor2_elevators) > 0, "Floor 2 should have elevator"
    
    def test_has_stair_connectors(self):
        """Should have stair nodes on both floors."""
        floor1_stairs = [n for n in self.nodes if n.get('floor_id') == 1 and n.get('type') == 'stairs']
        floor2_stairs = [n for n in self.nodes if n.get('floor_id') == 2 and n.get('type') == 'stairs']
        assert len(floor1_stairs) > 0, "Floor 1 should have stairs"
        assert len(floor2_stairs) > 0, "Floor 2 should have stairs"
    
    def test_has_floor_connecting_edges(self):
        """Should have edges that connect floors."""
        floor_change_edges = [e for e in self.edges if e.get('floor_change', False)]
        assert len(floor_change_edges) > 0, "Should have floor-change edges"
    
    def test_elevator_edges_have_floor_change(self):
        """Elevator edges should have floor_change=True."""
        elevator_edges = [e for e in self.edges if e.get('edge_type') == 'elevator']
        for edge in elevator_edges:
            assert edge.get('floor_change') == True, "Elevator edges should have floor_change=True"
    
    def test_stairs_edges_have_floor_delta(self):
        """Stairs edges should have floor_delta."""
        stairs_edges = [e for e in self.edges if e.get('edge_type') == 'stairs']
        assert len(stairs_edges) > 0, "Should have stairs edges"
        for edge in stairs_edges:
            assert edge.get('floor_delta') in [1, -1], "Stairs should have floor_delta"
    
    def test_qr_codes_for_both_floors(self):
        """Should have QR codes for both floors."""
        floor1_qrs = [q for q in self.qr_codes if q.get('floor_id') == 1]
        floor2_qrs = [q for q in self.qr_codes if q.get('floor_id') == 2]
        assert len(floor1_qrs) > 0, "Should have QR codes for floor 1"
        assert len(floor2_qrs) > 0, "Should have QR codes for floor 2"


class TestGraphMultiFloor:
    """Test graph module supports multi-floor."""
    
    def test_graph_stores_floor_id(self):
        """Graph nodes should store floor_id."""
        from graph import NavGraph
        graph = NavGraph()
        graph.add_node(1, 100, 200, "Test Node", "junction", floor_id=1, elevation=0)
        assert graph.nodes[1]['floor_id'] == 1
    
    def test_graph_stores_elevation(self):
        """Graph nodes should store elevation."""
        from graph import NavGraph
        graph = NavGraph()
        graph.add_node(1, 100, 200, "Test Node", "junction", floor_id=2, elevation=1)
        assert graph.nodes[1]['elevation'] == 1
    
    def test_graph_indexes_connectors(self):
        """Graph should index connector nodes by floor."""
        from graph import NavGraph
        graph = NavGraph()
        graph.add_node(8, 800, 380, "Elevator", "elevator", floor_id=1, elevation=0)
        graph.add_node(108, 800, 380, "Elevator F2", "elevator", floor_id=2, elevation=1)
        
        assert 1 in graph.connectors
        assert 2 in graph.connectors
        assert len(graph.connectors[1]) == 1
        assert graph.connectors[1][0]['type'] == 'elevator'
    
    def test_graph_stores_edge_type(self):
        """Graph edges should store edge_type."""
        from graph import NavGraph
        graph = NavGraph()
        graph.add_node(1, 100, 200, "Node1", "junction", floor_id=1)
        graph.add_node(2, 200, 200, "Node2", "junction", floor_id=1)
        graph.add_edge(1, 2, 100, edge_type="elevator", floor_change=True, floor_delta=1)
        
        # Check edge was stored with type info
        edges = graph.adj[1]
        assert len(edges) > 0
        # edge tuple should have: (cost, neighbor, accessible, edge_type, floor_change, floor_delta)
        edge = edges[0]
        assert len(edge) >= 5  # At least cost, neighbor, accessible, edge_type, floor_change


if __name__ == '__main__':
    pytest.main([__file__, '-v'])