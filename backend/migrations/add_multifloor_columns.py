#!/usr/bin/env python3
"""
Migration script to add multi-floor support columns to existing database.
Run this once to migrate an existing deployment to the new schema.

Usage: python -m migrations.add_multifloor_columns
"""
import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

# Get sync database URL
DATABASE_URL = os.getenv("SYNC_DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: SYNC_DATABASE_URL not set")
    sys.exit(1)


def run_migration():
    engine = create_engine(DATABASE_URL)
    
    migrations = [
        # Floor table additions
        ("map_svg_url", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS map_svg_url VARCHAR;"),
        ("coordinate_system", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS coordinate_system VARCHAR DEFAULT 'pixel';"),
        ("origin_x", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS origin_x FLOAT DEFAULT 0;"),
        ("origin_y", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS origin_y FLOAT DEFAULT 0;"),
        ("scale", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS scale FLOAT DEFAULT 1.0;"),
        ("elevation_m", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS elevation_m FLOAT DEFAULT 0;"),
        ("default_viewport", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS default_viewport JSONB;"),
        ("is_accessible", "ALTER TABLE floors ADD COLUMN IF NOT EXISTS is_accessible BOOLEAN DEFAULT true;"),
        
        # Node table additions
        ("elevation", "ALTER TABLE nodes ADD COLUMN IF NOT EXISTS elevation INTEGER DEFAULT 0;"),
        
        # Edge table additions
        ("edge_type", "ALTER TABLE edges ADD COLUMN IF NOT EXISTS edge_type VARCHAR DEFAULT 'walkable';"),
        ("floor_change", "ALTER TABLE edges ADD COLUMN IF NOT EXISTS floor_change BOOLEAN DEFAULT false;"),
        ("floor_delta", "ALTER TABLE edges ADD COLUMN IF NOT EXISTS floor_delta INTEGER DEFAULT 0;"),
    ]
    
    print("🔄 Running multi-floor schema migration...")
    
    with engine.connect() as conn:
        for name, sql in migrations:
            try:
                # PostgreSQL syntax
                if "IF NOT EXISTS" in sql or "ADD COLUMN IF NOT EXISTS" in sql:
                    # For PostgreSQL - IF NOT EXISTS is supported in ADD COLUMN
                    pass
                else:
                    # Check if column exists first
                    check_sql = text(f"""
                        SELECT column_name FROM information_schema.columns 
                        WHERE table_name = 'floors' AND column_name = '{name}'
                    """)
                    result = conn.execute(check_sql).fetchone()
                    if result:
                        print(f"  ⏭️  {name}: already exists, skipping")
                        continue
                
                conn.execute(text(sql))
                conn.commit()
                print(f"  ✅ {name}: added successfully")
            except Exception as e:
                print(f"  ⚠️  {name}: {e}")
                continue
    
    print("\n✅ Migration complete!")
    print("\nNew schema supports:")
    print("  - Multiple floors with different layouts")
    print("  - Floor elevation (elevation_m)")
    print("  - Connector types (elevator, stairs, escalator)")
    print("  - Floor-change edges with delta")
    print("  - Coordinate system metadata")
    print("  - SVG map support")


if __name__ == "__main__":
    run_migration()