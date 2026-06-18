#!/usr/bin/env python3
"""
Quick verification script for Phase 1 & 2 multi-floor implementation.
Run: python verify_multifloor.py
"""
import json
import os
import sys

def verify_models():
    """Verify model definitions."""
    print("\n📋 Verifying model definitions...")
    
    # Read models.py and check for required fields
    with open('models.py') as f:
        content = f.read()
    
    checks = [
        ('Floor.coordinate_system', 'coordinate_system' in content),
        ('Floor.origin_x', 'origin_x' in content),
        ('Floor.origin_y', 'origin_y' in content),
        ('Floor.scale', 'scale' in content),
        ('Floor.elevation_m', 'elevation_m' in content),
        ('Floor.map_svg_url', 'map_svg_url' in content),
        ('Floor.is_accessible', 'is_accessible' in content),
        ('Floor.default_viewport', 'default_viewport' in content),
        ('Node.elevation', 'Node.elevation' in content or 'elevation  = Column' in content),
        ('Edge.edge_type', 'edge_type' in content),
        ('Edge.floor_change', 'floor_change' in content),
        ('Edge.floor_delta', 'floor_delta' in content),
    ]
    
    all_pass = True
    for name, result in checks:
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
        if not result:
            all_pass = False
    
    return all_pass

def verify_seed_data():
    """Verify seed data."""
    print("\n📋 Verifying seed data...")
    
    with open('seed/nodes.json') as f:
        nodes = json.load(f)
    with open('seed/edges.json') as f:
        edges = json.load(f)
    with open('seed/qr_codes.json') as f:
        qrs = json.load(f)
    
    checks = [
        ('Floor 1 nodes', len([n for n in nodes if n.get('floor_id') == 1])),
        ('Floor 2 nodes', len([n for n in nodes if n.get('floor_id') == 2])),
        ('Floor 2 elevation=1', all(n.get('elevation') == 1 for n in nodes if n.get('floor_id') == 2)),
        ('Elevator nodes', len([n for n in nodes if n.get('type') == 'elevator'])),
        ('Stair nodes', len([n for n in nodes if n.get('type') == 'stairs'])),
        ('Floor-change edges', len([e for e in edges if e.get('floor_change')])),
        ('Elevator edges', len([e for e in edges if e.get('edge_type') == 'elevator'])),
        ('Stairs edges', len([e for e in edges if e.get('edge_type') == 'stairs'])),
        ('Floor 1 QR codes', len([q for q in qrs if q.get('floor_id') == 1])),
        ('Floor 2 QR codes', len([q for q in qrs if q.get('floor_id') == 2])),
    ]
    
    all_pass = True
    for name, result in checks:
        if isinstance(result, bool):
            status = "✅" if result else "❌"
            print(f"  {status} {name}")
            if not result:
                all_pass = False
        else:
            status = "✅" if result > 0 else "❌"
            print(f"  {status} {name}: {result}")
            if result == 0:
                all_pass = False
    
    return all_pass

def verify_routes():
    """Verify API routes."""
    print("\n📋 Verifying API routes...")
    
    with open('routes/map.py') as f:
        content = f.read()
    
    checks = [
        ('GET /buildings/{id}/floors', 'get_building_floors' in content),
        ('floor_id in /search', 'floor_id:' in content or 'floor_id =' in content),
        ('connectors in response', 'connectors' in content),
        ('floorId in response', 'floorId' in content),
        ('floorName in response', 'floorName' in content),
    ]
    
    all_pass = True
    for name, result in checks:
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
        if not result:
            all_pass = False
    
    return all_pass

def verify_graph():
    """Verify graph module."""
    print("\n📋 Verifying graph module...")
    
    with open('graph.py') as f:
        content = f.read()
    
    checks = [
        ('Floor_id in add_node', 'floor_id' in content and 'add_node' in content),
        ('Elevation in add_node', 'elevation' in content and 'add_node' in content),
        ('Connector indexing', 'self.connectors' in content),
        ('Edge type handling', 'edge_type' in content),
        ('Floor change handling', 'floor_change' in content),
    ]
    
    all_pass = True
    for name, result in checks:
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
        if not result:
            all_pass = False
    
    return all_pass

def verify_seed_script():
    """Verify seed.py."""
    print("\n📋 Verifying seed.py...")
    
    with open('seed.py') as f:
        content = f.read()
    
    checks = [
        ('Floor 1 creation', 'id=1' in content and 'floor_num=1' in content),
        ('Floor 2 creation', 'id=2' in content and 'floor_num=2' in content),
        ('New Floor fields', 'elevation_m' in content and 'coordinate_system' in content),
        ('Node elevation', 'elevation=' in content),
        ('Edge edge_type', 'edge_type=' in content),
        ('Edge floor_change', 'floor_change=' in content),
    ]
    
    all_pass = True
    for name, result in checks:
        status = "✅" if result else "❌"
        print(f"  {status} {name}")
        if not result:
            all_pass = False
    
    return all_pass

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    print("=" * 60)
    print("🔍 Multi-Floor Phase 1 & 2 Verification")
    print("=" * 60)
    
    results = [
        ("Models", verify_models()),
        ("Seed Data", verify_seed_data()),
        ("API Routes", verify_routes()),
        ("Graph Module", verify_graph()),
        ("Seed Script", verify_seed_script()),
    ]
    
    print("\n" + "=" * 60)
    print("📊 Summary")
    print("=" * 60)
    
    all_pass = True
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}: {name}")
        if not passed:
            all_pass = False
    
    print("\n" + "=" * 60)
    if all_pass:
        print("🎉 All Phase 1 & 2 checks passed!")
    else:
        print("⚠️  Some checks failed - review above")
    print("=" * 60)
    
    return 0 if all_pass else 1

if __name__ == '__main__':
    sys.exit(main())