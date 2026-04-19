import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * DebugBoundsOverlay - Shows a red rectangle around the map/world bounds
 * Uses a proper Leaflet Rectangle layer so it stays aligned during zoom/pan
 */
function DebugBoundsOverlay({ 
  enabled = true,
  bounds = null, // L.latLngBounds or [[south, west], [north, east]]
  color = 'red',
  weight = 3,
  fillOpacity = 0.1,
}) {
  const map = useMap();
  const rectangleRef = useRef(null);

  useEffect(() => {
    if (!map || !enabled || !bounds) return;

    // Create Leaflet bounds if array provided
    const leafletBounds = bounds instanceof L.LatLngBounds 
      ? bounds 
      : L.latLngBounds(bounds);

    // Create rectangle layer
    const rectangle = L.rectangle(leafletBounds, {
      color: color,
      weight: weight,
      fillColor: color,
      fillOpacity: fillOpacity,
      dashArray: '10, 5', // Dashed line for visibility
      interactive: false, // Don't intercept clicks
    });

    rectangle.addTo(map);
    rectangleRef.current = rectangle;

    console.log('[DebugBoundsOverlay] Rectangle added:', {
      south: leafletBounds.getSouth(),
      north: leafletBounds.getNorth(),
      west: leafletBounds.getWest(),
      east: leafletBounds.getEast(),
    });

    return () => {
      if (rectangleRef.current) {
        map.removeLayer(rectangleRef.current);
        rectangleRef.current = null;
      }
    };
  }, [map, enabled, bounds, color, weight, fillOpacity]);

  return null; // Rendering handled by Leaflet
}

export default DebugBoundsOverlay;
