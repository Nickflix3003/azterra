import React, { useMemo } from 'react';
import { LayerGroup, Polygon, Marker } from 'react-leaflet';
import L from 'leaflet';

const toLatLngs = (points = []) => points.map(([x, y]) => [y, x]);

const collectPolygons = (region) => {
  const base = Array.isArray(region.points) && region.points.length >= 3 ? [region.points] : [];
  const extras = Array.isArray(region.parts)
    ? region.parts.filter((part) => Array.isArray(part) && part.length >= 3)
    : [];
  return [...base, ...extras];
};

const calculateBounds = (points = []) => {
  if (!points.length) return { width: 0, height: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return {
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
};

const buildCurvedLabel = (region, bounds, zoomLevel) => {
  const scaleWithZoom = region.labelScaleWithZoom !== false;
  const gap = Math.max(20, Math.min(bounds.width * 0.05, 60));
  const usableWidth = Math.max(bounds.width - gap * 2, 140);
  const widthScale = Number.isFinite(region.labelWidth) ? region.labelWidth : 1;
  const rawWidth = Math.max(150, Math.min(usableWidth * 0.9 * widthScale, 540));
  const width = scaleWithZoom
    ? rawWidth
    : Math.max(160, Math.min(320 * widthScale, 520));
  const baseHeight = Math.max(bounds.height * 0.28, width * 0.26);
  const height = Math.min(baseHeight, width * 0.42);
  const curvature = Math.min(height * 0.4, 180);
  const zoomBasis = scaleWithZoom ? zoomLevel : 4;
  const normalizedZoom = Math.max(0.8, Math.min(zoomBasis, 6));
  const baseFontSize = Math.min(Math.max(width / (6.3 - normalizedZoom * 0.35), 18), 52);
  const fontSize = Math.min(Math.max(baseFontSize * (region.labelSize || 1), 10), 80);
  const letterSpacing = Math.min(fontSize / 2.3, 10);
  const textColor = region.labelColor || '#fef3c7';
  const shadowColor = 'rgba(0,0,0,0.45)';
  const pathId = `region-label-path-${region.id}`;
  const textLength = Math.min(width * 0.95, Math.max(width * 0.7 * widthScale, 160));
  const displayName = (region.name || 'Region').trim() || 'Region';

  return {
    width,
    height,
    html: `
      <svg class="region-label-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="overflow: visible;">
        <defs>
          <path id="${pathId}" d="M 0 ${height / 2} Q ${width / 2} ${height / 2 - curvature} ${width} ${height / 2}" />
          <filter id="${pathId}-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="2" result="offsetblur" />
            <feFlood flood-color="${shadowColor}" flood-opacity="1" />
            <feComposite in2="offsetblur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <text
          class="region-label-text"
          font-size="${fontSize}"
          letter-spacing="${letterSpacing}"
          fill="${textColor}"
          filter="url(#${pathId}-shadow)"
        >
          <textPath href="#${pathId}" xlink:href="#${pathId}" startOffset="50%" text-anchor="middle" lengthAdjust="spacingAndGlyphs" textLength="${textLength}">
            ${displayName}
          </textPath>
        </text>
      </svg>
    `,
  };
};

function RegionLayer({
  regions = [],
  draftPoints = [],
  selectedRegionId = null,
  highlightedRegionId = null,
  onRegionClick,
  onRegionHoverChange,
  interactionEnabled = false,
  showLabels = false,
  zoomLevel = 4,
}) {
  const draftLatLngs = useMemo(() => toLatLngs(draftPoints), [draftPoints]);

  const regionLabels = useMemo(() => {
    if (!showLabels) return [];
    return regions
      .filter(
        (region) =>
          region.labelEnabled !== false &&
          collectPolygons(region).some((poly) => Array.isArray(poly) && poly.length > 2)
      )
      .map((region) => {
        const allPoints = collectPolygons(region).flat();
        const total = allPoints.reduce(
          (acc, [x, y]) => {
            acc.sumX += x;
            acc.sumY += y;
            return acc;
          },
          { sumX: 0, sumY: 0 }
        );
        const count = allPoints.length || 1;
        const centroidX = total.sumX / count;
        const centroidY = total.sumY / count;
        const bounds = calculateBounds(allPoints);
        return {
          id: region.id,
          name: region.name || 'Region',
          centroid: [centroidY, centroidX],
          bounds,
        };
      });
  }, [regions, showLabels]);

  return (
    <LayerGroup>
      {regions.map((region) => {
        const polygons = collectPolygons(region);
        if (!polygons.length) return null;
        return polygons.map((poly, index) => {
          const positions = toLatLngs(poly);
          const key = `${region.id}-part-${index}`;
          return (
            <Polygon
              key={key}
              positions={positions}
              pathOptions={{
                color: region.borderColor || '#ea580c',
                weight: region.id === selectedRegionId ? 4 : region.id === highlightedRegionId ? 3.5 : 2,
                fillColor: region.color || '#f97316',
                fillOpacity: region.id === highlightedRegionId
                  ? Math.max(region.opacity ?? 0.3, 0.45)
                  : region.opacity ?? 0.3,
                className: region.id === highlightedRegionId ? 'region-polygon--timeline-hovered' : '',
                pane: 'overlayPane',
              }}
              interactive={interactionEnabled}
              eventHandlers={
                interactionEnabled
                  ? {
                      mouseover: () => {
                        onRegionHoverChange?.({
                          type: 'region',
                          id: region.id,
                          name: region.name || 'Region',
                        });
                      },
                      mouseout: () => {
                        onRegionHoverChange?.(null);
                      },
                      click: (event) => {
                        if (!onRegionClick) return;
                        event.originalEvent?.stopPropagation();
                        onRegionClick(region.id);
                      },
                    }
                  : undefined
              }
            />
          );
        });
      })}
      {draftLatLngs.length >= 2 && (
        <Polygon
          positions={draftLatLngs}
          pathOptions={{
            color: '#f97316',
            weight: 2,
            dashArray: '8',
            fillOpacity: 0.15,
            pane: 'overlayPane',
          }}
          interactive={false}
        />
      )}
      {showLabels &&
        regionLabels.map((label) => {
          const labelMarkup = buildCurvedLabel(
            regions.find((region) => region.id === label.id) || {},
            label.bounds,
            zoomLevel
          );
          const region = regions.find((entry) => entry.id === label.id) || {};
          const offsetX = region.labelOffsetX || 0;
          const offsetY = region.labelOffsetY || 0;
          return (
            <Marker
              key={`label-${label.id}`}
              position={label.centroid}
              icon={L.divIcon({
                className: [
                  'region-label-icon',
                  region.id === highlightedRegionId ? 'region-label-icon--highlighted' : '',
                ].join(' '),
                html: labelMarkup.html,
                iconSize: [labelMarkup.width, labelMarkup.height],
                iconAnchor: [
                  labelMarkup.width / 2 - offsetX,
                  labelMarkup.height / 2.1 - offsetY,
                ],
              })}
              interactive={false}
            />
          );
        })}
    </LayerGroup>
  );
}

export default RegionLayer;
