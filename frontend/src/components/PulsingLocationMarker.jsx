// components/PulsingLocationMarker.jsx — DivIcon-based pulsing location marker
// Renders a three-layer animated dot: expanding pulse ring, white-bordered outer, filled inner.
// On location update completion (isUpdating transitions false), flashes green for 800ms.
// Position moves smoothly via CSS transition on the marker container.

import { useEffect, useState, useMemo, useRef } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';

/**
 * PulsingLocationMarker
 * @param {{ position: [number, number] | null, isUpdating: boolean }} props
 */
export default function PulsingLocationMarker({ position, isUpdating }) {
  const [confirming, setConfirming] = useState(false);
  const prevUpdatingRef = useRef(isUpdating);

  // Detect isUpdating going from true → false (update completed) → flash green
  useEffect(() => {
    if (prevUpdatingRef.current === true && isUpdating === false) {
      setConfirming(true);
      const timer = setTimeout(() => setConfirming(false), 800);
      return () => clearTimeout(timer);
    }
    prevUpdatingRef.current = isUpdating;
  }, [isUpdating]);

  // Build the DivIcon with the three visual elements
  const icon = useMemo(() => {
    const innerColor = confirming ? 'var(--nav-location-confirm, #4CAF50)' : 'var(--nav-location, #1565C0)';
    const pulseColor = confirming ? 'var(--nav-location-confirm, #4CAF50)' : 'var(--nav-location, #1565C0)';

    const html = `
      <div class="location-marker ${confirming ? 'location-marker--confirm' : ''}">
        <div class="location-marker__pulse" style="border-color: ${pulseColor};"></div>
        <div class="location-marker__outer">
          <div class="location-marker__inner" style="background-color: ${innerColor};"></div>
        </div>
      </div>
    `;

    return L.divIcon({
      html,
      className: 'location-marker-icon',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }, [confirming]);

  // Render nothing if position is null
  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={icon}
      interactive={false}
      zIndexOffset={500}
    />
  );
}
