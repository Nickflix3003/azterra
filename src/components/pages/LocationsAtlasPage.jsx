/**
 * LocationsAtlasPage.jsx
 *
 * World Atlas — three view modes:
 *
 *   BANNER VIEW  — D&D-themed region banners, click header to expand.
 *                  Each location opens as a full-width rich detail view:
 *                  description, lore, image gallery, linked NPCs, tags.
 *
 *   GRAPH VIEW   — D3 force-directed lore graph.
 *
 *   EDIT MODE    — overlaid on banner view. Region banners and location
 *                  cards get inline editors. Gallery images can be uploaded
 *                  and removed per-location.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as d3 from 'd3';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocationData } from '../../context/LocationDataContext';
import { useRegions } from '../../context/RegionDataContext';
import SecretScopeField from '../UI/SecretScopeField';
import './LocationsAtlasPage.css';

const API = '/api';

// --- Emblem catalogue ---
const EMBLEMS = [
  { value: '\u{1F409}', label: 'Dragon' },
  { value: '\u2694\uFE0F', label: 'Swords' },
  { value: '\u{1F3F0}', label: 'Castle' },
  { value: '\u{1F451}', label: 'Crown' },
  { value: '\u{1F6E1}\uFE0F', label: 'Shield' },
  { value: '\u{1F531}', label: 'Trident' },
  { value: '\u{1F985}', label: 'Eagle' },
  { value: '\u{1F981}', label: 'Lion' },
  { value: '\u{1F43A}', label: 'Wolf' },
  { value: '\u{1F43B}', label: 'Bear' },
  { value: '\u{1F98A}', label: 'Fox' },
  { value: '\u{1F98C}', label: 'Stag' },
  { value: '\u{1F30A}', label: 'Wave' },
  { value: '\u{1F525}', label: 'Fire' },
  { value: '\u26A1', label: 'Storm' },
  { value: '\u{1F319}', label: 'Moon' },
  { value: '\u2600\uFE0F', label: 'Sun' },
  { value: '\u2B50', label: 'Star' },
  { value: '\u{1F52E}', label: 'Arcane' },
  { value: '\u{1F480}', label: 'Skull' },
  { value: '\u2697\uFE0F', label: 'Alchemy' },
  { value: '\u{1F5E1}\uFE0F', label: 'Dagger' },
  { value: '\u{1F339}', label: 'Rose' },
  { value: '\u{1F332}', label: 'Forest' },
  { value: '\u26F0\uFE0F', label: 'Mountain' },
];

// --- Location type config ---
const TYPE_CONFIG = {
  city:     { label: 'City',     color: '#facc15', icon: '\u{1F3D9}' },
  town:     { label: 'Town',     color: '#fb923c', icon: '\u{1F3D8}' },
  village:  { label: 'Village',  color: '#86efac', icon: '\u{1F3E1}' },
  dungeon:  { label: 'Dungeon',  color: '#c084fc', icon: '\u2694\uFE0F' },
  ruins:    { label: 'Ruins',    color: '#94a3b8', icon: '\u{1F3DA}' },
  landmark: { label: 'Landmark', color: '#67e8f9', icon: '\u{1F5FF}' },
  forest:   { label: 'Forest',   color: '#4ade80', icon: '\u{1F332}' },
  mountain: { label: 'Mountain', color: '#a8a29e', icon: '\u26F0' },
  port:     { label: 'Port',     color: '#38bdf8', icon: '\u2693' },
  temple:   { label: 'Temple',   color: '#fda4af', icon: '\u26E9' },
};

const getTypeConfig = (type = '') => {
  const key = type.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_CONFIG)) {
    if (key.includes(k)) return v;
  }
  return { label: type || 'Location', color: '#94a3b8', icon: '\u{1F4CD}' };
};

const ICON_BASE = `${import.meta.env.BASE_URL || '/'}icons/cities/`;
function locationIconSrc(location) {
  return location.iconKey ? `${ICON_BASE}${location.iconKey}.svg` : null;
}

function groupByType(locations) {
  const groups = {};
  locations.forEach((loc) => {
    const cfg = getTypeConfig(loc.type);
    if (!groups[cfg.label]) groups[cfg.label] = { cfg, items: [] };
    groups[cfg.label].items.push(loc);
  });
  return Object.values(groups).sort((a, b) => b.items.length - a.items.length);
}

function buildLocationPatchFromDraft(draft) {
  return {
    name: draft.name,
    description: draft.description,
    lore: draft.lore,
    type: draft.type,
    secretId: draft.secretId || null,
    regionId: draft.regionId || null,
    tags: draft.tags
      ? draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      : [],
  };
}

// =============================================================================
// EmblemPicker
// =============================================================================
function EmblemPicker({ value, onChange }) {
  return (
    <div className="emblem-picker">
      <p className="emblem-picker__label">Emblem</p>
      <div className="emblem-picker__grid">
        {EMBLEMS.map((e) => (
          <button
            key={e.value}
            type="button"
            title={e.label}
            className={`emblem-picker__item ${value === e.value ? 'is-active' : ''}`}
            onClick={() => onChange(e.value)}
          >
            {e.value}
          </button>
        ))}
        <button
          type="button"
          title="Use initial letter"
          className={`emblem-picker__item emblem-picker__item--clear ${!value ? 'is-active' : ''}`}
          onClick={() => onChange('')}
        >
          A
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// BannerImageUploader
// =============================================================================
function BannerImageUploader({ currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const inputRef                  = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await fetch(`${API}/api/regions/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      const data = await res.json();
      onUploaded(data.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="banner-uploader">
      <p className="banner-uploader__label">Banner Image</p>
      {currentUrl && (
        <div className="banner-uploader__preview">
          <img src={`${API}${currentUrl}`} alt="banner preview" />
          <button
            type="button"
            className="banner-uploader__remove"
            onClick={() => onUploaded('')}
            title="Remove image"
          >&#x2715;</button>
        </div>
      )}
      <button
        type="button"
        className="banner-uploader__btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? 'Uploading\u2026' : currentUrl ? '\u2191 Replace Image' : '\u2191 Upload Image'}
      </button>
      {error && <p className="banner-uploader__error">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}

// =============================================================================
// GalleryUploader — upload images into a location's gallery
// =============================================================================
function GalleryUploader({ locationId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const inputRef                  = useRef(null);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError('');
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('image', file);
        const res = await fetch(`${API}/api/locations/${locationId}/gallery`, {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
        const data = await res.json();
        onUploaded(data.gallery);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="gallery-uploader">
      <button
        type="button"
        className="gallery-uploader__btn"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Add images to gallery"
      >
        {uploading ? '\u23F3 Uploading\u2026' : '\u{1F4F7} Add Photos'}
      </button>
      {error && <span className="gallery-uploader__error">{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
      />
    </div>
  );
}

// =============================================================================
// LocationCard — collapsed row or full-width detail panel
// =============================================================================
function LocationCard({
  location,
  regions,
  isEditMode,
  onLocationChange,
  onCommitLocation,
  onSyncLocation,
  getLocationSaveState,
  npcs,
  focusedLocationId,
}) {
  const cfg     = getTypeConfig(location.type);
  const iconSrc = locationIconSrc(location);
  const [imgErr, setImgErr]   = useState(false);
  const [isOpen, setIsOpen]   = useState(false);
  const cardRef               = useRef(null);

  // Auto-open and scroll when deep-linked via ?loc=
  useEffect(() => {
    if (focusedLocationId != null && String(focusedLocationId) === String(location.id)) {
      setIsOpen(true);
      // Small delay so the banner has time to expand first
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 180);
    }
  }, [focusedLocationId, location.id]);

  // local gallery state (optimistic updates from upload/remove)
  const [gallery, setGallery] = useState(
    Array.isArray(location.gallery) ? location.gallery : []
  );
  const [lightbox, setLightbox] = useState(null); // index of open image

  // sync gallery if location prop changes
  useEffect(() => {
    setGallery(Array.isArray(location.gallery) ? location.gallery : []);
  }, [location.gallery]);

  // Edit draft
  const [draft, setDraft] = useState(null);
  const saveState = getLocationSaveState?.(location.id) || {};

  useEffect(() => {
    if (isEditMode) {
      setDraft({
        name:        location.name        || '',
        description: location.description || '',
        lore:        location.lore        || '',
        type:        location.type        || '',
        secretId:    location.secretId    || null,
        regionId:    location.regionId != null ? String(location.regionId) : '',
        tags:        Array.isArray(location.tags) ? location.tags.join(', ') : '',
      });
    } else {
      setDraft(null);
    }
  }, [isEditMode, location.id]);

  const updateDraft = (key, val, options = {}) => {
    setDraft((current) => {
      const next = { ...current, [key]: val };
      onLocationChange?.(location.id, buildLocationPatchFromDraft(next), options);
      return next;
    });
  };

  const handleSave = () => {
    if (!draft || !onCommitLocation) return;
    onCommitLocation(location.id, {
      successMode: 'immediate',
      successMessage: `Saved "${draft.name || location.name}".`,
    });
  };

  const handleRemoveGalleryImage = async (idx) => {
    try {
      const res = await fetch(`${API}/api/locations/${location.id}/gallery/${idx}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Remove failed');
      const data = await res.json();
      setGallery(data.gallery);
      onSyncLocation?.(location.id, { gallery: data.gallery });
    } catch (err) {
      console.error('Gallery remove failed:', err);
    }
  };

  const handleFieldBlur = () => {
    onCommitLocation?.(location.id, { successMode: 'none' });
  };

  const handleSingleLineKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    }
  };

  const handleTextareaKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    }
  };

  const saveStateText = saveState.error
    ? `Retry save: ${saveState.error}`
    : saveState.saving
      ? 'Saving…'
      : saveState.dirty
        ? 'Unsaved changes'
        : saveState.lastSavedAt
          ? Date.now() - saveState.lastSavedAt < 15000
            ? 'Saved just now'
            : 'Saved'
          : '';

  const locNpcs = useMemo(
    () => (npcs || []).filter((n) => String(n.locationId) === String(location.id)),
    [npcs, location.id]
  );

  const regionName = useMemo(() => {
    if (!location.regionId || !regions) return null;
    const r = regions.find((r) => String(r.id) === String(location.regionId));
    return r ? r.name : null;
  }, [location.regionId, regions]);

  const displayCfg  = (isEditMode && draft) ? getTypeConfig(draft.type) : cfg;
  const displayName = (isEditMode && draft) ? draft.name : location.name;

  return (
    <div
      ref={cardRef}
      className={[
        'atlas-loc-card',
        isOpen         ? 'atlas-loc-card--open'      : '',
        isEditMode     ? 'atlas-loc-card--editing'   : '',
        gallery.length ? 'atlas-loc-card--has-image' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--loc-color': displayCfg.color }}
    >
      {/* ── Collapsed header (always visible) ── */}
      {gallery.length > 0 ? (
        /* ── HERO CARD — first gallery image fills the preview ── */
        <button
          type="button"
          className={`atlas-loc-card__header atlas-loc-card__header--hero ${isOpen ? 'atlas-loc-card__header--hero-open' : ''}`}
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
        >
          {/* Background image */}
          <div className="atlas-loc-card__hero-img">
            <img src={`${API}${gallery[0]}`} alt={displayName} />
          </div>
          {/* Gradient overlay + text */}
          <div className="atlas-loc-card__hero-overlay">
            <div className="atlas-loc-card__hero-text">
              <span className="atlas-loc-card__type-badge atlas-loc-card__type-badge--hero" style={{ color: displayCfg.color }}>
                {displayCfg.icon} {displayCfg.label}
                {regionName && <span className="atlas-loc-card__region-tag"> &middot; {regionName}</span>}
              </span>
              <span className="atlas-loc-card__name atlas-loc-card__name--hero">{displayName}</span>
            </div>
            <div className="atlas-loc-card__hero-meta">
              <span className="atlas-loc-card__gallery-badge" title={`${gallery.length} photo${gallery.length !== 1 ? 's' : ''}`}>
                {'\u{1F4F7}'} {gallery.length}
              </span>
              {locNpcs.length > 0 && (
                <span className="atlas-loc-card__npc-badge" title={`${locNpcs.length} character${locNpcs.length !== 1 ? 's' : ''}`}>
                  {'\u{1F9D1}'} {locNpcs.length}
                </span>
              )}
              <span className={`atlas-loc-card__chevron ${isOpen ? 'atlas-loc-card__chevron--open' : ''}`}>
                &#x203A;
              </span>
            </div>
          </div>
        </button>
      ) : (
        /* ── COMPACT ROW — no gallery image ── */
        <button
          type="button"
          className="atlas-loc-card__header"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
        >
          <div className="atlas-loc-card__icon">
            {iconSrc && !imgErr ? (
              <img src={iconSrc} alt={location.name} onError={() => setImgErr(true)} />
            ) : (
              <span className="atlas-loc-card__icon-emoji">{displayCfg.icon}</span>
            )}
          </div>
          <div className="atlas-loc-card__info">
            <span className="atlas-loc-card__name">{displayName}</span>
            <span className="atlas-loc-card__type-badge" style={{ color: displayCfg.color }}>
              {displayCfg.label}
              {regionName && <span className="atlas-loc-card__region-tag"> &middot; {regionName}</span>}
            </span>
          </div>
          <div className="atlas-loc-card__header-meta">
            {locNpcs.length > 0 && (
              <span className="atlas-loc-card__npc-badge" title={`${locNpcs.length} character${locNpcs.length !== 1 ? 's' : ''}`}>
                {'\u{1F9D1}'} {locNpcs.length}
              </span>
            )}
            <span className={`atlas-loc-card__chevron ${isOpen ? 'atlas-loc-card__chevron--open' : ''}`}>
              &#x203A;
            </span>
          </div>
        </button>
      )}

      {/* ── Expanded body ── */}
      {isOpen && (
        <div className="atlas-loc-card__body">
          {!isEditMode ? (
            /* VIEW MODE — rich detail layout */
            <div className="loc-detail">
              {/* Description */}
              {location.description && (
                <div className="loc-detail__section">
                  <p className="loc-detail__section-label">About</p>
                  <p className="loc-detail__text">{location.description}</p>
                </div>
              )}

              {/* Lore */}
              {location.lore && (
                <div className="loc-detail__section">
                  <p className="loc-detail__section-label">Lore &amp; History</p>
                  <p className="loc-detail__text loc-detail__text--lore">{location.lore}</p>
                </div>
              )}

              {!location.description && !location.lore && (
                <p className="loc-detail__empty">
                  No lore recorded yet. The DM knows more\u2026
                </p>
              )}

              {/* Gallery */}
              {gallery.length > 0 && (
                <div className="loc-detail__section">
                  <p className="loc-detail__section-label">{'\u{1F5BC}'} Gallery</p>
                  <div className="loc-gallery">
                    {gallery.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        className="loc-gallery__thumb"
                        onClick={() => setLightbox(i)}
                        title="View full size"
                      >
                        <img src={`${API}${url}`} alt={`${location.name} photo ${i + 1}`} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Characters / NPCs */}
              {locNpcs.length > 0 && (
                <div className="loc-detail__section">
                  <p className="loc-detail__section-label">{'\u{1F9D1}'} Characters Here</p>
                  <div className="loc-npcs">
                    {locNpcs.map((npc) => (
                      <div key={npc.id} className="loc-npc-card">
                        <div className="loc-npc-card__avatar">
                          {npc.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="loc-npc-card__info">
                          <span className="loc-npc-card__name">{npc.name}</span>
                          {npc.type && (
                            <span className="loc-npc-card__role">{npc.type}</span>
                          )}
                          {npc.blurb && (
                            <p className="loc-npc-card__blurb">{npc.blurb}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {Array.isArray(location.tags) && location.tags.length > 0 && (
                <div className="loc-detail__tags">
                  {location.tags.map((tag) => (
                    <span key={tag} className="atlas-loc-card__tag">{tag}</span>
                  ))}
                </div>
              )}

              {(location.hasLocalMap || location.id != null) && (
                <div className="loc-detail__actions">
                  {location.hasLocalMap && (
                    <Link to={`/location/${location.id}/map`} className="loc-detail__action-btn">
                      Open Local Map
                    </Link>
                  )}
                  <Link to={`/location/${location.id}`} className="loc-detail__action-btn loc-detail__action-btn--ghost">
                    Location Page
                  </Link>
                </div>
              )}

              {/* Attribution */}
              {(location.createdBy || location.updatedBy) && (
                <div className="loc-attribution">
                  {location.createdBy && (
                    <span className="loc-attribution__item">
                      ✍️ Added by <strong>{location.createdBy}</strong>
                    </span>
                  )}
                  {location.updatedBy && location.updatedBy !== location.createdBy && (
                    <span className="loc-attribution__item">
                      · Edited by <strong>{location.updatedBy}</strong>
                    </span>
                  )}
                  {location.updatedAt && (
                    <span className="loc-attribution__date">
                      {new Date(location.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : draft && (
            /* EDIT MODE */
            <div className="atlas-loc-card__edit">
              <div className="loc-edit-grid">
                <label className="edit-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => updateDraft('name', e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={handleSingleLineKeyDown}
                    placeholder="Location name\u2026"
                  />
                </label>
                <label className="edit-field">
                  <span>Type</span>
                  <select
                    value={draft.type}
                    onChange={(e) => updateDraft('type', e.target.value)}
                    onBlur={handleFieldBlur}
                  >
                    <option value="">-- Select type --</option>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </label>
                <SecretScopeField
                  secretId={draft.secretId || null}
                  onChange={(nextSecretId) => updateDraft('secretId', nextSecretId)}
                  className="edit-field"
                />
                <label className="edit-field edit-field--full">
                  <span>Kingdom / Region</span>
                  <select
                    value={draft.regionId}
                    onChange={(e) => updateDraft('regionId', e.target.value)}
                    onBlur={handleFieldBlur}
                  >
                    <option value="">Uncharted (no region)</option>
                    {(regions || []).map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.emblem || '\u{1F5FA}'} {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="edit-field edit-field--full">
                  <span>Description</span>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => updateDraft('description', e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={handleSingleLineKeyDown}
                    placeholder="Brief description\u2026"
                  />
                </label>
                <label className="edit-field edit-field--full edit-field--textarea">
                  <span>Lore &amp; History</span>
                  <textarea
                    value={draft.lore}
                    onChange={(e) => updateDraft('lore', e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder="History, secrets, legends\u2026"
                    rows={4}
                  />
                </label>
                <label className="edit-field edit-field--full">
                  <span>Tags (comma separated)</span>
                  <input
                    type="text"
                    value={draft.tags}
                    onChange={(e) => updateDraft('tags', e.target.value)}
                    onBlur={handleFieldBlur}
                    onKeyDown={handleSingleLineKeyDown}
                    placeholder="e.g. safe, haunted, quest-hub"
                  />
                </label>
              </div>

              {/* Gallery management in edit mode */}
              <div className="loc-edit-gallery">
                <p className="loc-edit-gallery__label">{'\u{1F5BC}'} Gallery</p>
                <div className="loc-gallery loc-gallery--editable">
                  {gallery.map((url, i) => (
                    <div key={url} className="loc-gallery__thumb loc-gallery__thumb--edit">
                      <img src={`${API}${url}`} alt={`photo ${i + 1}`} />
                      <button
                        type="button"
                        className="loc-gallery__remove"
                        onClick={() => handleRemoveGalleryImage(i)}
                        title="Remove photo"
                      >&#x2715;</button>
                    </div>
                  ))}
                  <GalleryUploader
                    locationId={location.id}
                    onUploaded={(newGallery) => {
                      setGallery(newGallery);
                      onSyncLocation?.(location.id, { gallery: newGallery });
                    }}
                  />
                </div>
              </div>

              <div className="loc-edit-actions">
                {saveStateText && (
                  <span className={`edit-status ${saveState.error ? 'edit-status--error' : ''}`}>
                    {saveStateText}
                  </span>
                )}
                <button
                  type="button"
                  className="edit-btn edit-btn--save"
                  onClick={handleSave}
                  disabled={saveState.saving}
                >
                  {saveState.saving ? 'Saving\u2026' : '\u2713 Save Location'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <>
          <div className="loc-lightbox-overlay" onClick={() => setLightbox(null)} />
          <div className="loc-lightbox">
            <button
              type="button"
              className="loc-lightbox__close"
              onClick={() => setLightbox(null)}
            >&#x2715;</button>
            {lightbox > 0 && (
              <button
                type="button"
                className="loc-lightbox__arrow loc-lightbox__arrow--prev"
                onClick={() => setLightbox((l) => l - 1)}
              >&#x2039;</button>
            )}
            <img
              src={`${API}${gallery[lightbox]}`}
              alt={`${location.name} photo ${lightbox + 1}`}
              className="loc-lightbox__img"
            />
            {lightbox < gallery.length - 1 && (
              <button
                type="button"
                className="loc-lightbox__arrow loc-lightbox__arrow--next"
                onClick={() => setLightbox((l) => l + 1)}
              >&#x203A;</button>
            )}
            <p className="loc-lightbox__counter">{lightbox + 1} / {gallery.length}</p>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// RegionBanner — clicking the whole header toggles open/closed
// =============================================================================
function RegionBanner({
  region, locations, regions,
  isOpen, onToggle,
  onSelectRegion,
  isEditMode, onSaveRegion, onLocationChange, onCommitLocation, onSyncLocation, getLocationSaveState,
  npcs, focusedLocationId,
}) {
  const bannerColor  = region.color       || '#334155';
  const bannerImage  = region.bannerImage || '';
  const emblem       = region.emblem      || '';
  const grouped      = useMemo(() => groupByType(locations), [locations]);

  // Region edit draft
  const [draft,   setDraft]   = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (isEditMode) {
      setDraft({
        name:        region.name        || '',
        description: region.description || '',
        lore:        region.lore        || '',
        emblem:      region.emblem      || '',
        bannerImage: region.bannerImage || '',
        color:       region.color       || '#334155',
        secretId:    region.secretId    || null,
      });
    } else {
      setDraft(null);
      setSaveErr('');
    }
  }, [isEditMode, region]);

  const updateDraft = (key, val) => setDraft((d) => ({ ...d, [key]: val }));

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveErr('');
    try {
      await onSaveRegion(region.id, draft);
    } catch (err) {
      setSaveErr(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft({
      name:        region.name        || '',
      description: region.description || '',
      lore:        region.lore        || '',
      emblem:      region.emblem      || '',
      bannerImage: region.bannerImage || '',
      color:       region.color       || '#334155',
      secretId:    region.secretId    || null,
    });
    setSaveErr('');
  };

  const displayColor  = isEditMode && draft ? draft.color       : bannerColor;
  const displayEmblem = isEditMode && draft ? draft.emblem      : emblem;
  const displayImg    = isEditMode && draft ? draft.bannerImage : bannerImage;
  const displayName   = isEditMode && draft ? draft.name        : region.name;

  return (
    <div
      className={[
        'atlas-banner',
        isOpen     ? 'atlas-banner--open'    : '',
        isEditMode ? 'atlas-banner--editing' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--banner-color': displayColor }}
    >
      {/* ── Header — ENTIRE header is clickable ── */}
      <div
        className="atlas-banner__header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        style={displayImg ? {
          backgroundImage: `url(${API}${displayImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        <div className="atlas-banner__header-overlay" />

        <div className="atlas-banner__header-inner">
          {/* Sigil */}
          <div className="atlas-banner__sigil">
            <div className="atlas-banner__sigil-ring" />
            <span className="atlas-banner__sigil-glyph">
              {displayEmblem || displayName.charAt(0).toUpperCase()}
            </span>
          </div>

          <div className="atlas-banner__title-block">
            <p className="atlas-banner__kingdom-label">Kingdom</p>
            <h2 className="atlas-banner__name">{displayName}</h2>
            {region.description && !isEditMode && (
              <p className="atlas-banner__tagline">{region.description}</p>
            )}
          </div>

          <div className="atlas-banner__header-actions" onClick={(e) => e.stopPropagation()}>
            <span className="atlas-banner__count">
              {locations.length} location{locations.length !== 1 ? 's' : ''}
            </span>
            {!isEditMode && (
              <button
                type="button"
                className="atlas-banner__details-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRegion({ kind: 'region', data: region, locations });
                }}
              >
                Lore
              </button>
            )}
            <span
              className="atlas-banner__toggle-icon"
              aria-hidden="true"
            >
              {isOpen ? '\u25B2' : '\u25BC'}
            </span>
          </div>
        </div>

        <div className="atlas-banner__rule" />
      </div>

      {/* ── Region edit controls (edit mode only) ── */}
      {isEditMode && draft && (
        <div className="atlas-banner__edit-body">
          <div className="atlas-banner__edit-grid">
            <div className="atlas-banner__edit-fields">
              <label className="edit-field">
                <span>Kingdom Name</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft('name', e.target.value)}
                  placeholder="Name of this realm\u2026"
                />
              </label>
              <label className="edit-field">
                <span>Tagline</span>
                <input
                  type="text"
                  value={draft.description}
                  onChange={(e) => updateDraft('description', e.target.value)}
                  placeholder="Short descriptor shown on banner\u2026"
                />
              </label>
              <label className="edit-field edit-field--textarea">
                <span>Lore</span>
                <textarea
                  value={draft.lore}
                  onChange={(e) => updateDraft('lore', e.target.value)}
                  placeholder="History, secrets, notable events\u2026"
                  rows={4}
                />
              </label>
              <SecretScopeField
                secretId={draft.secretId || null}
                onChange={(nextSecretId) => updateDraft('secretId', nextSecretId)}
                className="edit-field"
              />
              <label className="edit-field edit-field--color">
                <span>Accent Colour</span>
                <div className="color-row">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) => updateDraft('color', e.target.value)}
                  />
                  <span className="color-row__hex">{draft.color}</span>
                </div>
              </label>
            </div>
            <div className="atlas-banner__edit-visuals">
              <EmblemPicker
                value={draft.emblem}
                onChange={(val) => updateDraft('emblem', val)}
              />
              <BannerImageUploader
                currentUrl={draft.bannerImage}
                onUploaded={(url) => updateDraft('bannerImage', url)}
              />
            </div>
          </div>
          <div className="atlas-banner__edit-actions">
            {saveErr && <span className="edit-error">{saveErr}</span>}
            <button type="button" className="edit-btn edit-btn--ghost" onClick={handleDiscard}>
              Discard
            </button>
            <button
              type="button"
              className="edit-btn edit-btn--save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving\u2026' : '\u2713 Save Kingdom'}
            </button>
          </div>
        </div>
      )}

      {/* ── Location list ── */}
      {isOpen && (
        <div className="atlas-banner__body">
          {grouped.length === 0 ? (
            <p className="atlas-banner__empty">No locations assigned yet.</p>
          ) : (
            grouped.map(({ cfg, items }) => (
              <div key={cfg.label} className="atlas-banner__group">
                <p className="atlas-banner__group-label" style={{ color: cfg.color }}>
                  {cfg.icon} {cfg.label}s
                  <span className="atlas-banner__group-count">{items.length}</span>
                </p>
                <div className="atlas-banner__locs">
                  {items.map((loc) => (
                    <LocationCard
                      key={loc.id}
                      location={loc}
                      regions={regions}
                      isEditMode={isEditMode}
                      onLocationChange={onLocationChange}
                      onCommitLocation={onCommitLocation}
                      onSyncLocation={onSyncLocation}
                      getLocationSaveState={getLocationSaveState}
                      npcs={npcs}
                      focusedLocationId={focusedLocationId}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DetailPanel — slide-in panel for region lore
// =============================================================================
function DetailPanel({ selection, onClose }) {
  const isOpen = Boolean(selection);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  if (!selection) return null;
  const isRegion = selection.kind === 'region';
  const data     = selection.data;
  const locs     = selection.locations || [];
  const cfg      = isRegion ? null : getTypeConfig(data.type);

  return (
    <>
      <div className="detail-overlay" onClick={onClose} />
      <aside className="detail-panel">
        <button type="button" className="detail-panel__close" onClick={onClose}>&#x2715;</button>
        <div
          className="detail-panel__accent"
          style={{ background: isRegion ? data.color || '#334155' : cfg?.color || '#94a3b8' }}
        />
        <div className="detail-panel__scroll custom-scrollbar">
          <span className="detail-panel__kind">
            {isRegion
              ? `${data.emblem || '\u{1F5FA}'} Region`
              : `${cfg?.icon || '\u{1F4CD}'} ${cfg?.label || data.type}`}
          </span>
          <h2 className="detail-panel__name">{data.name}</h2>
          {!isRegion && data.regionName && (
            <p className="detail-panel__region-tag">In {data.regionName}</p>
          )}
          {(data.description || data.lore) ? (
            <>
              {data.description && (
                <div className="detail-panel__section">
                  <h3>Description</h3>
                  <p>{data.description}</p>
                </div>
              )}
              {data.lore && (
                <div className="detail-panel__section">
                  <h3>Lore</h3>
                  <p>{data.lore}</p>
                </div>
              )}
            </>
          ) : (
            <p className="detail-panel__empty">
              No lore written yet. The DM knows more\u2026
            </p>
          )}
          {Array.isArray(data.tags) && data.tags.length > 0 && (
            <div className="detail-panel__tags">
              {data.tags.map((tag) => (
                <span key={tag} className="detail-panel__tag">{tag}</span>
              ))}
            </div>
          )}
          {isRegion && locs.length > 0 && (
            <div className="detail-panel__section">
              <h3>{locs.length} Locations</h3>
              <ul className="detail-panel__loc-list">
                {locs.map((loc) => {
                  const lcfg = getTypeConfig(loc.type);
                  return (
                    <li key={loc.id}>
                      <span>{lcfg.icon}</span>
                      <span>{loc.name}</span>
                      <span className="detail-panel__loc-type">{lcfg.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// =============================================================================
// LoreGraph — D3 force-directed graph
// =============================================================================
function LoreGraph({ regions, locations, onSelect }) {
  const svgRef       = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const svgEl     = svgRef.current;
    if (!container || !svgEl) return;

    const width  = container.clientWidth  || 900;
    const height = container.clientHeight || 600;

    const svg = d3.select(svgEl).attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const regionNodes = regions.map((r) => ({
      id: `r-${r.id}`, kind: 'region',
      label: r.name, color: r.color || '#4a5568', radius: 28, data: r,
    }));

    const regionIdSet = new Set(regions.map((r) => String(r.id)));

    const locationNodes = locations.map((loc) => {
      const cfg = getTypeConfig(loc.type);
      return {
        id: `l-${loc.id}`, kind: 'location',
        label: loc.name, color: cfg.color, radius: 12,
        data: loc, regionId: loc.regionId ? String(loc.regionId) : null,
      };
    });

    const nodes = [...regionNodes, ...locationNodes];
    const links = locationNodes
      .filter((n) => n.regionId && regionIdSet.has(n.regionId))
      .map((n) => ({ source: n.id, target: `r-${n.regionId}` }));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(90).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => d.radius + 8).strength(0.8));

    const g = svg.append('g');
    svg.call(
      d3.zoom().scaleExtent([0.25, 3]).on('zoom', (ev) => g.attr('transform', ev.transform))
    );

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', 'rgba(255,215,0,0.18)').attr('stroke-width', 1.5);

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .attr('class', (d) => `graph-node graph-node--${d.kind}`)
      .style('cursor', 'pointer')
      .call(
        d3.drag()
          .on('start', (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag',  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
          .on('end',   (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on('click', (_ev, d) => {
        if (d.kind === 'region') {
          const locs = locationNodes
            .filter((n) => n.regionId === String(d.data.id))
            .map((n) => n.data);
          onSelect({ kind: 'region', data: d.data, locations: locs });
        } else {
          onSelect({ kind: 'location', data: d.data });
        }
      });

    node.append('circle')
      .attr('r', (d) => d.radius)
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', (d) => d.kind === 'region' ? 0.85 : 0.7)
      .attr('stroke', (d) => d.kind === 'region' ? 'rgba(255,215,0,0.6)' : 'rgba(255,255,255,0.2)')
      .attr('stroke-width', (d) => d.kind === 'region' ? 2 : 1);

    node.filter((d) => d.kind === 'region')
      .append('circle')
      .attr('r', (d) => d.radius + 6)
      .attr('fill', 'none')
      .attr('stroke', (d) => d.color)
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1.5);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => d.kind === 'region' ? '0.35em' : d.radius + 14)
      .attr('font-size', (d) => d.kind === 'region' ? '11px' : '9px')
      .attr('font-weight', (d) => d.kind === 'region' ? '700' : '400')
      .attr('fill', '#f1f5f9')
      .attr('pointer-events', 'none')
      .text((d) => d.label.length > 16 ? d.label.slice(0, 14) + '\u2026' : d.label);

    sim.on('tick', () => {
      link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
          .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [regions, locations, onSelect]);

  return (
    <div ref={containerRef} className="lore-graph">
      <svg ref={svgRef} className="lore-graph__svg" />
      <div className="lore-graph__hint">
        Drag to reposition &middot; Scroll to zoom &middot; Click for details
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================
export default function LocationsAtlasPage() {
  const { role }                       = useAuth();
  const {
    locations,
    updateLocation,
    updateLocationLocal,
    flushPendingLocationSaves,
    getLocationSaveState,
  } = useLocationData();
  const { regions = [], setRegions }   = useRegions();
  const [searchParams, setSearchParams] = useSearchParams();

  const canEdit = ['player', 'editor', 'admin'].includes(role);

  const [viewMode,          setViewMode]          = useState('banners');
  const [isEditMode,        setIsEditMode]         = useState(false);
  const [openRegionId,      setOpenRegionId]       = useState(null);
  const [focusedLocationId, setFocusedLocationId]  = useState(null);
  const [selection,         setSelection]          = useState(null);
  const [npcs,              setNpcs]               = useState([]);

  // Deep-link: ?loc=<id> — open the right banner and focus the card
  useEffect(() => {
    const locId = searchParams.get('loc');
    if (!locId || !locations.length || !regions.length) return;

    const target = locations.find((l) => String(l.id) === String(locId));
    if (!target) return;

    // Force banner view
    setViewMode('banners');

    // Open the kingdom this location belongs to
    const regionKey = target.regionId ? target.regionId : '__uncharted__';
    setOpenRegionId(regionKey);

    // Tell the card to auto-open + scroll
    setFocusedLocationId(locId);

    // Clear the param so back-navigation works cleanly
    setSearchParams({}, { replace: true });
  }, [searchParams, locations, regions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch NPCs once on mount
  useEffect(() => {
    fetch(`${API}/api/entities/npcs`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.items || data.entities || data.npcs || []);
        setNpcs(list);
      })
      .catch(() => {});
  }, []);

  const regionLocations = useMemo(() => {
    const map = new Map();
    regions.forEach((r) => map.set(String(r.id), []));
    map.set('__uncharted__', []);
    locations.forEach((loc) => {
      const key = loc.regionId ? String(loc.regionId) : '__uncharted__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(loc);
    });
    return map;
  }, [regions, locations]);

  const regionNameMap = useMemo(() => {
    const m = new Map();
    regions.forEach((r) => m.set(String(r.id), r.name));
    return m;
  }, [regions]);

  const unchartedLocs = regionLocations.get('__uncharted__') || [];

  const handleSelect = useCallback((sel) => {
    if (sel.kind === 'location') {
      const rName = sel.data.regionId
        ? regionNameMap.get(String(sel.data.regionId))
        : null;
      setSelection({ ...sel, data: { ...sel.data, regionName: rName } });
    } else {
      setSelection(sel);
    }
  }, [regionNameMap]);

  const handleSaveRegion = useCallback(async (id, updates) => {
    const res = await fetch(`${API}/api/regions/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Save failed');
    }
    const { region: saved } = await res.json();
    setRegions((prev) =>
      prev.map((r) => String(r.id) === String(id) ? { ...r, ...saved } : r)
    );
  }, [setRegions]);

  const handleLocationChange = useCallback((id, updates, options = {}) => {
    updateLocation(id, updates, options);
  }, [updateLocation]);

  const handleCommitLocation = useCallback((id, options = {}) => {
    return flushPendingLocationSaves([id], options);
  }, [flushPendingLocationSaves]);

  const handleSyncLocation = useCallback((id, updates) => {
    updateLocationLocal(id, updates);
  }, [updateLocationLocal]);

  useEffect(() => () => {
    flushPendingLocationSaves(undefined, { successMode: 'none' }).catch(() => null);
  }, [flushPendingLocationSaves]);

  return (
    <div className="locations-atlas custom-scrollbar">
      {/* ── Header ── */}
      <header className="atlas-header">
        <div className="atlas-header__top">
          <div className="atlas-header__text">
            <p className="atlas-eyebrow">World Atlas</p>
            <h1 className="atlas-title">The Realms of Azterra</h1>
            <p className="atlas-subtitle">
              Every kingdom, every dungeon, every whispered legend.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              className={`atlas-edit-btn ${isEditMode ? 'atlas-edit-btn--active' : ''}`}
              onClick={() => { setIsEditMode((v) => !v); setOpenRegionId(null); }}
            >
              {isEditMode ? '\u2713 Done Editing' : '\u270F\uFE0F Edit World'}
            </button>
          )}
        </div>

        {isEditMode && (
          <div className="atlas-edit-banner">
            <span>\u270F\uFE0F</span>
            <p>
              Edit Mode &mdash; click any kingdom banner to expand it, then expand
              individual locations to edit details and manage photos.
            </p>
          </div>
        )}

        <div className="atlas-stats">
          <div className="atlas-stat">
            <span className="atlas-stat__value">{regions.length}</span>
            <span className="atlas-stat__label">Kingdoms</span>
          </div>
          <div className="atlas-stat">
            <span className="atlas-stat__value">{locations.length}</span>
            <span className="atlas-stat__label">Locations</span>
          </div>
          <div className="atlas-stat">
            <span className="atlas-stat__value">{unchartedLocs.length}</span>
            <span className="atlas-stat__label">Uncharted</span>
          </div>
          <div className="atlas-stat">
            <span className="atlas-stat__value">{npcs.length}</span>
            <span className="atlas-stat__label">Characters</span>
          </div>
        </div>

        {!isEditMode && (
          <div className="atlas-view-toggle">
            <button
              type="button"
              className={`atlas-view-toggle__btn ${viewMode === 'banners' ? 'is-active' : ''}`}
              onClick={() => setViewMode('banners')}
            >
              {'\u{1F5FA}'} Kingdoms
            </button>
            <button
              type="button"
              className={`atlas-view-toggle__btn ${viewMode === 'graph' ? 'is-active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              &#x2736; Lore Graph
            </button>
          </div>
        )}
      </header>

      {/* ── Banner / Edit view ── */}
      {(viewMode === 'banners' || isEditMode) && (
        <div className="atlas-banners">
          {regions.length === 0 && (
            <div className="atlas-empty">
              <p>No kingdoms on the map yet.</p>
              <p className="atlas-empty__hint">
                Draw region polygons in the Map Editor and they\u2019ll appear here.
              </p>
            </div>
          )}
          {regions.map((region) => (
            <RegionBanner
              key={region.id}
              region={region}
              regions={regions}
              locations={regionLocations.get(String(region.id)) || []}
              isOpen={openRegionId === region.id}
              onToggle={() => setOpenRegionId((p) => p === region.id ? null : region.id)}
              onSelectRegion={handleSelect}
              isEditMode={isEditMode}
              onSaveRegion={handleSaveRegion}
              onLocationChange={handleLocationChange}
              onCommitLocation={handleCommitLocation}
              onSyncLocation={handleSyncLocation}
              getLocationSaveState={getLocationSaveState}
              npcs={npcs}
              focusedLocationId={focusedLocationId}
            />
          ))}
          {unchartedLocs.length > 0 && (
            <RegionBanner
              key="__uncharted__"
              region={{
                id: '__uncharted__',
                name: 'Uncharted Lands',
                color: '#1e293b',
                borderColor: '#475569',
                description: 'Not yet assigned to a region.',
              }}
              regions={regions}
              locations={unchartedLocs}
              isOpen={openRegionId === '__uncharted__'}
              onToggle={() =>
                setOpenRegionId((p) => p === '__uncharted__' ? null : '__uncharted__')
              }
              onSelectRegion={handleSelect}
              isEditMode={isEditMode}
              onSaveRegion={() => {}}
              onLocationChange={handleLocationChange}
              onCommitLocation={handleCommitLocation}
              onSyncLocation={handleSyncLocation}
              getLocationSaveState={getLocationSaveState}
              npcs={npcs}
              focusedLocationId={focusedLocationId}
            />
          )}
        </div>
      )}

      {/* ── Graph view ── */}
      {viewMode === 'graph' && !isEditMode && (
        <LoreGraph regions={regions} locations={locations} onSelect={handleSelect} />
      )}

      {/* ── Detail panel (region lore) ── */}
      <DetailPanel selection={selection} onClose={() => setSelection(null)} />
    </div>
  );
}
