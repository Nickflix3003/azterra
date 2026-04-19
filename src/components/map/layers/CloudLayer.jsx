import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// ============================================================================
// CLOUD CONFIGURATION
// ============================================================================
const LAYERS = [
  {
    id: 'top',
    texture: 'new_cloud.png',
    baseSize: 4000,
    parallax: 1.15,
    baseOpacity: 0.5,
    blend: 'normal',
    minZoom: 0,
    maxZoom: 10,
  },
  {
    id: 'bottom', 
    texture: 'scatter_1.png',
    baseSize: 2400,
    parallax: 1.06,
    baseOpacity: 0.6,
    blend: 'normal',
    minZoom: 3,
    maxZoom: 10,
  }
];

// Map bounds (must match your map)
const MAP_BOUNDS = [[0, 0], [40960, 40960]];

/**
 * CloudOverlay - A Leaflet ImageOverlay-style layer for clouds
 * 
 * This extends L.Layer and mimics how L.ImageOverlay works internally,
 * which is the same approach used by the red bounds rectangle (L.Rectangle).
 * The key is that during zoom animation, Leaflet applies CSS transforms
 * to elements in the overlay pane automatically.
 */
const CloudOverlay = L.Layer.extend({
  options: {
    intensity: 1,
    baseUrl: '/',
    pane: 'overlayPane',
  },

  initialize: function(bounds, options) {
    this._bounds = L.latLngBounds(bounds);
    L.setOptions(this, options);
  },

  onAdd: function(map) {
    this._map = map;
    
    if (!this._container) {
      this._initContainer();
    }

    this.getPane().appendChild(this._container);
    this._reset();
    
    // These are the same events L.ImageOverlay uses
    map.on('zoom viewreset', this._reset, this);
    
    if (map.options.zoomAnimation && L.Browser.any3d) {
      map.on('zoomanim', this._animateZoom, this);
    }
  },

  onRemove: function(map) {
    L.DomUtil.remove(this._container);
    map.off('zoom viewreset', this._reset, this);
    map.off('zoomanim', this._animateZoom, this);
  },

  _initContainer: function() {
    const base = this.options.baseUrl;
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    
    this._container = L.DomUtil.create('div', 'leaflet-cloud-container leaflet-zoom-animated');
    this._container.style.position = 'absolute';
    this._container.style.pointerEvents = 'none';
    
    // Create layer divs
    this._layerDivs = LAYERS.map(layer => {
      const div = L.DomUtil.create('div', 'cloud-layer', this._container);
      div.style.position = 'absolute';
      div.style.top = '0';
      div.style.left = '0';
      div.style.width = '100%';
      div.style.height = '100%';
      div.style.backgroundImage = `url(${cleanBase}/clouds/${layer.texture})`;
      div.style.backgroundRepeat = 'repeat';
      div.style.mixBlendMode = layer.blend;
      div.style.pointerEvents = 'none';
      div.dataset.parallax = layer.parallax;
      div.dataset.baseSize = layer.baseSize;
      div.dataset.baseOpacity = layer.baseOpacity;
      div.dataset.minZoom = layer.minZoom;
      div.dataset.maxZoom = layer.maxZoom;
      return div;
    });
  },

  // This is called during animated zoom - SAME as L.ImageOverlay
  _animateZoom: function(e) {
    const scale = this._map.getZoomScale(e.zoom);
    const offset = this._map._latLngBoundsToNewLayerBounds(this._bounds, e.zoom, e.center).min;
    L.DomUtil.setTransform(this._container, offset, scale);
  },

  // Reset position after zoom completes or on viewreset
  _reset: function() {
    const container = this._container;
    const bounds = new L.Bounds(
      this._map.latLngToLayerPoint(this._bounds.getNorthWest()),
      this._map.latLngToLayerPoint(this._bounds.getSouthEast())
    );
    const size = bounds.getSize();
    
    // Position container at bounds location
    L.DomUtil.setPosition(container, bounds.min);
    container.style.width = size.x + 'px';
    container.style.height = size.y + 'px';
    
    // Update background patterns
    this._updatePatterns();
  },

  _updatePatterns: function() {
    const map = this._map;
    const zoom = map.getZoom();
    const center = map.getCenter();
    const centerPx = map.project(center, zoom);
    const intensity = this.options.intensity;
    
    this._layerDivs.forEach(div => {
      const parallax = parseFloat(div.dataset.parallax);
      const baseSize = parseFloat(div.dataset.baseSize);
      const baseOpacity = parseFloat(div.dataset.baseOpacity);
      const minZoom = parseFloat(div.dataset.minZoom);
      const maxZoom = parseFloat(div.dataset.maxZoom);
      
      // Pattern size scales with zoom
      const zoomDelta = zoom - 4;
      const patternSize = baseSize * Math.pow(2, zoomDelta * 0.5);
      
      // Opacity with zoom bounds
      let opacity = baseOpacity * intensity;
      if (zoom < minZoom) {
        opacity *= Math.max(0, 1 - (minZoom - zoom) * 2);
      }
      if (zoom > maxZoom) {
        opacity *= Math.max(0, 1 - (zoom - maxZoom) * 2);
      }
      
      // Parallax offset
      const shiftX = centerPx.x * parallax;
      const shiftY = centerPx.y * parallax;
      const bgX = ((-shiftX) % patternSize + patternSize) % patternSize;
      const bgY = ((-shiftY) % patternSize + patternSize) % patternSize;
      
      div.style.backgroundSize = `${patternSize}px ${patternSize}px`;
      div.style.backgroundPosition = `${bgX}px ${bgY}px`;
      div.style.opacity = opacity > 0.01 ? opacity : 0;
    });
  },

  setIntensity: function(val) {
    this.options.intensity = val;
    if (this._map) this._updatePatterns();
    return this;
  }
});

/**
 * React wrapper
 */
function CloudLayer({ enabled = true, intensity = 1, onDiagnostics }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    onDiagnostics?.('clouds', { status: enabled ? 'ok' : 'off', message: enabled ? 'Active' : 'Disabled' });
  }, [enabled, onDiagnostics]);

  useEffect(() => {
    if (!map) return;

    if (!enabled) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    // Create cloud overlay at map bounds
    const layer = new CloudOverlay(MAP_BOUNDS, {
      intensity,
      baseUrl: import.meta.env.BASE_URL || '/',
    });
    
    layer.addTo(map);
    layerRef.current = layer;
    
    console.log('[CloudLayer] Added as L.Layer with zoomanim support');

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, enabled]);

  // Update intensity without recreating
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setIntensity(intensity);
    }
  }, [intensity]);

  return null;
}

export default CloudLayer;
