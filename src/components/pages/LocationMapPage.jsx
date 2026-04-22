import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useLocationData } from '../../context/LocationDataContext';
import LocalMapCanvas from '../map/LocalMapCanvas';
import './MapPage.css';
import './LocationMapPage.css';

function createMarkerId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function findSelectedMarker(locationMap, markerKey) {
  if (!markerKey || !locationMap) return null;

  if (markerKey.startsWith('poi:')) {
    const poiId = markerKey.slice(4);
    const poi = (locationMap.localPois || []).find((entry) => String(entry.id) === poiId);
    return poi ? { kind: 'poi', marker: poi } : null;
  }

  if (markerKey.startsWith('linked:')) {
    const linkedId = markerKey.slice(7);
    const marker = (locationMap.linkedLocations || []).find((entry) => String(entry.id) === linkedId);
    return marker ? { kind: 'linked', marker } : null;
  }

  return null;
}

export default function LocationMapPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { toast } = useToast();
  const { locations } = useLocationData();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [placementMode, setPlacementMode] = useState('inspect');
  const [selectedMarkerKey, setSelectedMarkerKey] = useState(null);
  const [linkedTargetId, setLinkedTargetId] = useState('');
  const [imageUrlDraft, setImageUrlDraft] = useState('');

  const canManageLocalMap = ['editor', 'admin'].includes(role) && Boolean(data?.canEdit);

  const loadLocalMap = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/locations/${id}/map`, { credentials: 'include' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Unable to load local map.');
      }
      setData(json);
      setImageUrlDraft(json.locationMap?.imageUrl || '');
    } catch (nextError) {
      setError(nextError.message || 'Unable to load local map.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadLocalMap();
  }, [loadLocalMap]);

  useEffect(() => {
    if (!canManageLocalMap) {
      setIsEditorMode(false);
      setPlacementMode('inspect');
    }
  }, [canManageLocalMap]);

  useEffect(() => {
    const selected = findSelectedMarker(data?.locationMap, selectedMarkerKey);
    if (!selected) {
      setSelectedMarkerKey(null);
    }
  }, [data?.locationMap, selectedMarkerKey]);

  const location = data?.location || null;
  const locationMap = data?.locationMap || {
    imageUrl: '',
    assetPath: '',
    width: null,
    height: null,
    minZoom: 1,
    maxZoom: 2.2,
    localPois: [],
    linkedLocations: [],
  };

  const linkableLocations = useMemo(
    () =>
      (locations || [])
        .filter((entry) => String(entry.id) !== String(id))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [id, locations]
  );

  const locationLookup = useMemo(
    () => new Map(linkableLocations.map((entry) => [String(entry.id), entry])),
    [linkableLocations]
  );

  const selectedMarker = useMemo(
    () => findSelectedMarker(locationMap, selectedMarkerKey),
    [locationMap, selectedMarkerKey]
  );

  const canvasMarkers = useMemo(() => {
    const poiMarkers = (locationMap.localPois || []).map((poi) => ({
      key: `poi:${poi.id}`,
      kind: 'poi',
      x: poi.x,
      y: poi.y,
      icon: poi.icon || '*',
      label: poi.name || 'Point of Interest',
    }));

    const linkedMarkers = (locationMap.linkedLocations || []).map((marker) => ({
      key: `linked:${marker.id}`,
      kind: 'linked',
      x: marker.x,
      y: marker.y,
      icon: marker.icon || '@',
      label: marker.location?.name || locationLookup.get(String(marker.locationId))?.name || 'Linked Location',
    }));

    return [...poiMarkers, ...linkedMarkers];
  }, [locationLookup, locationMap.linkedLocations, locationMap.localPois]);

  const updateLocalMap = useCallback((updater) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextMap = typeof updater === 'function' ? updater(prev.locationMap) : updater;
      return {
        ...prev,
        locationMap: nextMap,
      };
    });
  }, []);

  const handleAddMarker = useCallback(
    ({ x, y }) => {
      if (!isEditorMode) return;

      if (placementMode === 'add-local') {
        const nextId = createMarkerId('poi');
        updateLocalMap((prev) => ({
          ...prev,
          localPois: [
            ...(prev.localPois || []),
            {
              id: nextId,
              name: 'New Point',
              x,
              y,
              icon: '*',
              description: '',
              visible: true,
            },
          ],
        }));
        setSelectedMarkerKey(`poi:${nextId}`);
      }

      if (placementMode === 'add-linked' && linkedTargetId) {
        const linkedLocation = locationLookup.get(String(linkedTargetId));
        if (!linkedLocation) {
          toast.error('Choose a world location before placing a linked marker.');
          return;
        }

        const nextId = createMarkerId('linked');
        updateLocalMap((prev) => ({
          ...prev,
          linkedLocations: [
            ...(prev.linkedLocations || []),
            {
              id: nextId,
              locationId: String(linkedTargetId),
              x,
              y,
              icon: '@',
              visible: true,
              location: {
                id: linkedLocation.id,
                name: linkedLocation.name,
                type: linkedLocation.type,
                description: linkedLocation.description,
                hasLocalMap: Boolean(linkedLocation.hasLocalMap),
              },
            },
          ],
        }));
        setSelectedMarkerKey(`linked:${nextId}`);
      }
    },
    [isEditorMode, linkedTargetId, locationLookup, placementMode, toast, updateLocalMap]
  );

  const handleMoveMarker = useCallback((markerKey, coords) => {
    if (!isEditorMode) return;

    updateLocalMap((prev) => {
      if (markerKey.startsWith('poi:')) {
        const poiId = markerKey.slice(4);
        return {
          ...prev,
          localPois: (prev.localPois || []).map((poi) =>
            String(poi.id) === poiId ? { ...poi, ...coords } : poi
          ),
        };
      }

      if (markerKey.startsWith('linked:')) {
        const linkedId = markerKey.slice(7);
        return {
          ...prev,
          linkedLocations: (prev.linkedLocations || []).map((marker) =>
            String(marker.id) === linkedId ? { ...marker, ...coords } : marker
          ),
        };
      }

      return prev;
    });
  }, [isEditorMode, updateLocalMap]);

  const handleSelectedMarkerChange = (patch) => {
    if (!selectedMarker || !isEditorMode) return;

    updateLocalMap((prev) => {
      if (selectedMarker.kind === 'poi') {
        return {
          ...prev,
          localPois: (prev.localPois || []).map((poi) =>
            String(poi.id) === String(selectedMarker.marker.id) ? { ...poi, ...patch } : poi
          ),
        };
      }

      return {
        ...prev,
        linkedLocations: (prev.linkedLocations || []).map((marker) =>
          String(marker.id) === String(selectedMarker.marker.id) ? { ...marker, ...patch } : marker
        ),
      };
    });
  };

  const handleRemoveSelected = () => {
    if (!selectedMarker || !isEditorMode) return;

    updateLocalMap((prev) => {
      if (selectedMarker.kind === 'poi') {
        return {
          ...prev,
          localPois: (prev.localPois || []).filter((poi) => String(poi.id) !== String(selectedMarker.marker.id)),
        };
      }

      return {
        ...prev,
        linkedLocations: (prev.linkedLocations || []).filter(
          (marker) => String(marker.id) !== String(selectedMarker.marker.id)
        ),
      };
    });
    setSelectedMarkerKey(null);
  };

  const handleSaveMap = async () => {
    if (!canManageLocalMap || !location) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/locations/${location.id}/map`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: imageUrlDraft.trim(),
          assetPath: imageUrlDraft.trim() || locationMap.assetPath || '',
          width: locationMap.width,
          height: locationMap.height,
          minZoom: locationMap.minZoom,
          maxZoom: locationMap.maxZoom,
          localPois: (locationMap.localPois || []).map((poi) => ({
            id: poi.id,
            name: poi.name,
            x: poi.x,
            y: poi.y,
            icon: poi.icon,
            description: poi.description,
            visible: poi.visible !== false,
          })),
          linkedLocations: (locationMap.linkedLocations || []).map((marker) => ({
            id: marker.id,
            locationId: marker.locationId,
            x: marker.x,
            y: marker.y,
            icon: marker.icon,
            visible: marker.visible !== false,
          })),
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Unable to save local map.');
      }
      toast.success('Local map saved.');
      await loadLocalMap();
    } catch (nextError) {
      toast.error(nextError.message || 'Unable to save local map.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !location || !canManageLocalMap) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const response = await fetch(`/api/locations/${location.id}/map/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Unable to upload local map image.');
      }
      setImageUrlDraft(json.url || '');
      toast.success('Local map image uploaded.');
      await loadLocalMap();
    } catch (nextError) {
      toast.error(nextError.message || 'Unable to upload local map image.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="cp-page cp-page--loading">
        <div className="cp-spinner" />
        <p>Loading local map...</p>
      </div>
    );
  }

  if (error || !location) {
    return (
      <div className="page-container">
        <h1>Local Map</h1>
        <p className="account-error">{error || 'Location not found.'}</p>
      </div>
    );
  }

  const viewerHint = locationMap.imageUrl
    ? 'A focused map of this major location, with hand-placed points of interest.'
    : 'This location does not have a developed local map yet.';

  return (
    <div className="map-page map-page--full location-map-page">
      <div className="map-toolbar">
        <div className="map-toolbar__brand">
          <div className="map-ribbon__sigil">M</div>
          <div>
            <p className="map-eyebrow">Location Map</p>
            <h1 className="map-title">{location.name}</h1>
            <p className="location-map-page__subtitle">{viewerHint}</p>
          </div>
        </div>

        <div className="map-toolbar__actions">
          <button type="button" className="map-link location-map-page__toolbar-btn" onClick={() => navigate(-1)}>
            Back
          </button>
          <Link to={`/atlas?loc=${location.id}`} className="map-link location-map-page__toolbar-btn">
            Atlas Entry
          </Link>
          {canManageLocalMap && (
            <button
              type="button"
              className={`editor-toggle ${isEditorMode ? 'editor-toggle--active' : ''}`}
              onClick={() => setIsEditorMode((prev) => !prev)}
            >
              {isEditorMode ? 'Editing mode' : 'View mode'}
            </button>
          )}
        </div>
      </div>

      <div className="map-page__frame location-map-page__frame">
        <div className="map-page__canvas location-map-page__canvas">
          <LocalMapCanvas
            imageUrl={imageUrlDraft || locationMap.imageUrl}
            markers={canvasMarkers}
            selectedMarkerKey={selectedMarkerKey}
            editable={isEditorMode}
            placementMode={placementMode}
            minZoom={locationMap.minZoom || 1}
            maxZoom={locationMap.maxZoom || 2.2}
            onSelectMarker={setSelectedMarkerKey}
            onAddMarker={handleAddMarker}
            onMoveMarker={handleMoveMarker}
            onImageLoad={({ width, height }) =>
              updateLocalMap((prev) => ({
                ...prev,
                width,
                height,
              }))
            }
            emptyTitle="No local map image yet"
            emptyText={
              canManageLocalMap
                ? 'Upload a location map image or paste an image URL to begin laying out local points of interest.'
                : 'The DM has not prepared a local map for this location yet.'
            }
          />
        </div>

        <aside className="location-map-page__inspector custom-scrollbar">
          <div className="location-map-page__section">
            <p className="location-map-page__section-eyebrow">Overview</p>
            <h3>{location.name}</h3>
            <p>{location.description || 'No description recorded for this location yet.'}</p>
            <div className="location-map-page__quick-actions">
              <Link to={`/location/${location.id}`} className="location-map-page__action-link">
                Open Location Page
              </Link>
              <Link to={`/atlas?loc=${location.id}`} className="location-map-page__action-link">
                Open in Atlas
              </Link>
            </div>
          </div>

          {isEditorMode && canManageLocalMap && (
            <div className="location-map-page__section">
              <div className="location-map-page__section-head">
                <div>
                  <p className="location-map-page__section-eyebrow">Map Setup</p>
                  <h3>Editor Controls</h3>
                </div>
                <button
                  type="button"
                  className="cp-btn cp-btn--primary cp-btn--sm"
                  onClick={handleSaveMap}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Map'}
                </button>
              </div>

              <label className="location-map-page__field">
                <span>Map Image URL</span>
                <input
                  type="text"
                  value={imageUrlDraft}
                  onChange={(event) => setImageUrlDraft(event.target.value)}
                  placeholder="https://..."
                />
              </label>

              <label className="location-map-page__upload">
                <span>Upload / Replace Image</span>
                <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} />
                <small>{uploading ? 'Uploading image...' : 'PNG, JPG, or WEBP. Stored with other location images.'}</small>
              </label>

              <div className="location-map-page__tool-grid">
                <button
                  type="button"
                  className={`location-map-page__tool ${placementMode === 'inspect' ? 'location-map-page__tool--active' : ''}`}
                  onClick={() => setPlacementMode('inspect')}
                >
                  Inspect
                </button>
                <button
                  type="button"
                  className={`location-map-page__tool ${placementMode === 'add-local' ? 'location-map-page__tool--active' : ''}`}
                  onClick={() => setPlacementMode('add-local')}
                >
                  Add POI
                </button>
                <button
                  type="button"
                  className={`location-map-page__tool ${placementMode === 'add-linked' ? 'location-map-page__tool--active' : ''}`}
                  onClick={() => setPlacementMode('add-linked')}
                >
                  Link Location
                </button>
              </div>

              {placementMode === 'add-linked' && (
                <label className="location-map-page__field">
                  <span>Linked World Location</span>
                  <select value={linkedTargetId} onChange={(event) => setLinkedTargetId(event.target.value)}>
                    <option value="">Choose a location to place</option>
                    {linkableLocations.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="location-map-page__section">
            <div className="location-map-page__section-head">
              <div>
                <p className="location-map-page__section-eyebrow">Markers</p>
                <h3>Points on this Map</h3>
              </div>
              <span>{canvasMarkers.length}</span>
            </div>

            {canvasMarkers.length === 0 ? (
              <p className="location-map-page__empty">
                {isEditorMode
                  ? 'Use the editor tools to place local POIs or linked world locations.'
                  : 'No points of interest have been placed on this local map yet.'}
              </p>
            ) : (
              <div className="location-map-page__marker-list">
                {canvasMarkers.map((marker) => (
                  <button
                    key={marker.key}
                    type="button"
                    className={`location-map-page__marker-item ${
                      marker.key === selectedMarkerKey ? 'location-map-page__marker-item--active' : ''
                    }`}
                    onClick={() => setSelectedMarkerKey(marker.key)}
                  >
                    <span className="location-map-page__marker-pill">{marker.icon}</span>
                    <span>
                      <strong>{marker.label}</strong>
                      <small>{marker.kind === 'linked' ? 'Linked world location' : 'Local point of interest'}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedMarker && (
            <div className="location-map-page__section">
              <div className="location-map-page__section-head">
                <div>
                  <p className="location-map-page__section-eyebrow">Selection</p>
                  <h3>
                    {selectedMarker.kind === 'linked'
                      ? selectedMarker.marker.location?.name || 'Linked Location'
                      : selectedMarker.marker.name || 'Point of Interest'}
                  </h3>
                </div>
                {isEditorMode && canManageLocalMap && (
                  <button
                    type="button"
                    className="cp-chip-btn cp-chip-btn--danger"
                    onClick={handleRemoveSelected}
                  >
                    Remove
                  </button>
                )}
              </div>

              {selectedMarker.kind === 'poi' ? (
                isEditorMode && canManageLocalMap ? (
                  <div className="location-map-page__field-stack">
                    <label className="location-map-page__field">
                      <span>Name</span>
                      <input
                        type="text"
                        value={selectedMarker.marker.name || ''}
                        onChange={(event) => handleSelectedMarkerChange({ name: event.target.value })}
                      />
                    </label>
                    <label className="location-map-page__field">
                      <span>Icon</span>
                      <input
                        type="text"
                        value={selectedMarker.marker.icon || '*'}
                        maxLength={2}
                        onChange={(event) => handleSelectedMarkerChange({ icon: event.target.value.slice(0, 2) || '*' })}
                      />
                    </label>
                    <label className="location-map-page__field">
                      <span>Description</span>
                      <textarea
                        rows={4}
                        value={selectedMarker.marker.description || ''}
                        onChange={(event) => handleSelectedMarkerChange({ description: event.target.value })}
                      />
                    </label>
                  </div>
                ) : (
                  <p>{selectedMarker.marker.description || 'No extra details have been added for this point yet.'}</p>
                )
              ) : (
                <>
                  <p>{selectedMarker.marker.location?.description || 'This marker links to another location in the world atlas.'}</p>
                  <div className="location-map-page__quick-actions">
                    <Link to={`/location/${selectedMarker.marker.locationId}`} className="location-map-page__action-link">
                      Open Location Page
                    </Link>
                    <Link to={`/atlas?loc=${selectedMarker.marker.locationId}`} className="location-map-page__action-link">
                      Open in Atlas
                    </Link>
                    {selectedMarker.marker.location?.hasLocalMap && (
                      <Link
                        to={`/location/${selectedMarker.marker.locationId}/map`}
                        className="location-map-page__action-link"
                      >
                        Open Linked Map
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
