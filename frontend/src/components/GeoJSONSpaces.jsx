// components/GeoJSONSpaces.jsx — Optional interactive room/store polygons rendered
// as a GeoJSON layer on top of the SVG floor plan. Links named spaces to navigation
// graph nodes via `nodeId` property. Renders nothing if data is unavailable.
import { useMemo } from 'react';
import { GeoJSON, Tooltip } from 'react-leaflet';

/* Style for GeoJSON polygons — light fill with subtle border */
const POLYGON_STYLE = {
  fillColor: '#E2EDF5',
  fillOpacity: 0.45,
  color: '#90A4AE',
  weight: 1.5,
};

/* Hover style — slightly darker to indicate interactivity */
const POLYGON_HOVER_STYLE = {
  fillColor: '#C8DCF0',
  fillOpacity: 0.6,
  color: '#607D8B',
  weight: 2,
};

/**
 * GeoJSONSpaces renders optional interactive room polygons on top of the floor plan.
 *
 * Props:
 *  - geojsonData: FeatureCollection | null — per-floor GeoJSON room data
 *  - onSelectDestination: (nodeId: number) => void — called when a polygon with nodeId is tapped
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export default function GeoJSONSpaces({ geojsonData, onSelectDestination }) {
  // Render nothing if data is unavailable (Requirement 3.4)
  if (!geojsonData || !geojsonData.features || geojsonData.features.length === 0) {
    return null;
  }

  // Stable key to force GeoJSON re-render when data changes
  const dataKey = useMemo(() => {
    return JSON.stringify(geojsonData).slice(0, 100) + geojsonData.features.length;
  }, [geojsonData]);

  // Convert GeoJSON coordinates to Leaflet-compatible [lat, lng] format.
  // GeoJSON uses [lng, lat] but our CRS.Simple pixel coords are [x, y]
  // where Leaflet expects [y, x] (lat=y, lng=x). The GeoJSON coordinates
  // are already in pixel space [x, y], so we swap to [y, x] for Leaflet.
  const convertedData = useMemo(() => {
    if (!geojsonData) return null;
    return {
      ...geojsonData,
      features: geojsonData.features.map(feature => ({
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: feature.geometry.coordinates.map(ring =>
            ring.map(([x, y]) => [y, x])
          ),
        },
      })),
    };
  }, [geojsonData]);

  const onEachFeature = (feature, layer) => {
    const props = feature.properties || {};

    // Permanent tooltip with room name (Requirement 3.3)
    if (props.name) {
      layer.bindTooltip(props.name, {
        permanent: true,
        direction: 'center',
        className: 'geojson-room-tooltip',
      });
    }

    // Click-to-navigate for polygons with nodeId (Requirement 3.2)
    if (props.nodeId != null && onSelectDestination) {
      layer.on('click', () => {
        onSelectDestination(props.nodeId);
      });
    }

    // Hover effects for interactive polygons
    layer.on('mouseover', () => {
      layer.setStyle(POLYGON_HOVER_STYLE);
    });
    layer.on('mouseout', () => {
      layer.setStyle(POLYGON_STYLE);
    });
  };

  return (
    <GeoJSON
      key={dataKey}
      data={convertedData}
      style={() => POLYGON_STYLE}
      onEachFeature={onEachFeature}
    />
  );
}
