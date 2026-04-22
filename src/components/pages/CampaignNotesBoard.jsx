import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BOARD_WIDTH = 1600;
const BOARD_HEIGHT = 920;
const NOTE_COLORS = ['#f4cf73', '#d9e2a4', '#9fd7d3', '#efbf98', '#d8b1d9'];
const FALLBACK_BOARD = {
  initialized: true,
  notes: [],
  strokes: [],
  connectors: [],
  version: 1,
  updatedAt: null,
  updatedBy: null,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function formatRelativeTime(value) {
  if (!value) return 'Not saved yet';
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return 'Recently updated';
  const diff = Date.now() - stamp;
  const seconds = Math.max(1, Math.round(diff / 1000));
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days}d ago`;
}

function pathFromPoints(points = []) {
  if (!Array.isArray(points) || points.length < 2) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function initialsForName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '?';
  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

function authorLabel(authorNames, authorId) {
  if (!authorId) return 'Shared';
  return authorNames?.[String(authorId)] || 'Shared';
}

function createNoteAtPoint(point, color, userId) {
  const now = new Date().toISOString();
  return {
    id: createId('note'),
    text: '',
    x: clamp(point.x - 130, 24, BOARD_WIDTH - 284),
    y: clamp(point.y - 90, 24, BOARD_HEIGHT - 234),
    width: 260,
    height: 210,
    color,
    createdBy: userId || null,
    updatedBy: userId || null,
    createdAt: now,
    updatedAt: now,
  };
}

function distanceToStroke(stroke, point) {
  if (!stroke?.points?.length) return Number.POSITIVE_INFINITY;
  return stroke.points.reduce((smallest, current) => {
    const dx = current.x - point.x;
    const dy = current.y - point.y;
    return Math.min(smallest, Math.sqrt(dx * dx + dy * dy));
  }, Number.POSITIVE_INFINITY);
}

export default function CampaignNotesBoard({
  boardState,
  canEdit,
  canManage,
  currentUser,
  authorNames,
  loading,
  onPersist,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [localBoard, setLocalBoard] = useState(boardState || FALLBACK_BOARD);
  const [draftVersion, setDraftVersion] = useState(0);
  const [saveState, setSaveState] = useState('idle');
  const [tool, setTool] = useState('select');
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState(null);
  const [connectorStartId, setConnectorStartId] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.68);
  const [interaction, setInteraction] = useState(null);
  const [activeStroke, setActiveStroke] = useState(null);
  const viewportRef = useRef(null);
  const boardRef = useRef(localBoard || FALLBACK_BOARD);
  const dirtyRef = useRef(false);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const interactionRef = useRef(interaction);

  useEffect(() => {
    boardRef.current = localBoard || FALLBACK_BOARD;
  }, [localBoard]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  useEffect(() => {
    if (!boardState) return;
    if (dirtyRef.current || interactionRef.current || activeStroke) return;
    setLocalBoard(boardState);
  }, [activeStroke, boardState]);

  const mutateBoard = useCallback((updater) => {
    setLocalBoard((prev) => {
      const base = prev || FALLBACK_BOARD;
      const next = typeof updater === 'function' ? updater(base) : updater;
      if (!next) return base;
      dirtyRef.current = true;
      setSaveState('saving');
      setDraftVersion((value) => value + 1);
      return next;
    });
  }, []);

  const persistBoard = useCallback(
    async (boardToPersist) => {
      if (!canEdit) return;
      setSaveState('saving');
      try {
        await onPersist(boardToPersist);
        dirtyRef.current = false;
        setSaveState('saved');
      } catch {
        dirtyRef.current = true;
        setSaveState('error');
      }
    },
    [canEdit, onPersist]
  );

  useEffect(() => {
    if (!canEdit || draftVersion === 0 || !dirtyRef.current) return undefined;
    const timeoutId = window.setTimeout(() => {
      persistBoard(boardRef.current);
    }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [canEdit, draftVersion, persistBoard]);

  const getBoardPoint = useCallback((event) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 120, y: 120 };
    return {
      x: clamp((event.clientX - rect.left - panRef.current.x) / zoomRef.current, 0, BOARD_WIDTH),
      y: clamp((event.clientY - rect.top - panRef.current.y) / zoomRef.current, 0, BOARD_HEIGHT),
    };
  }, []);

  const removeSelectedConnector = useCallback(() => {
    if (!canManage || !selectedConnectorId) return;
    mutateBoard((prev) => ({
      ...prev,
      connectors: (prev.connectors || []).filter((connector) => connector.id !== selectedConnectorId),
    }));
    setSelectedConnectorId(null);
  }, [canManage, mutateBoard, selectedConnectorId]);

  const handleSurfacePointerDown = useCallback(
    (event) => {
      if (!canEdit) return;
      if (event.button !== 0) return;
      if (event.target.closest('[data-note-card="true"]')) return;
      if (event.target.closest('[data-connector-list="true"]')) return;
      const point = getBoardPoint(event);

      if (tool === 'note') {
        const note = createNoteAtPoint(point, selectedColor, currentUser?.id ? String(currentUser.id) : null);
        mutateBoard((prev) => ({
          ...prev,
          notes: [...(prev.notes || []), note],
        }));
        setSelectedNoteId(note.id);
        setSelectedConnectorId(null);
        return;
      }

      if (tool === 'pen') {
        setActiveStroke({
          id: createId('stroke'),
          points: [point],
          color: selectedColor,
          width: 5,
          createdBy: currentUser?.id ? String(currentUser.id) : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setInteraction({ type: 'draw' });
        return;
      }

      if (tool === 'eraser') {
        setInteraction({ type: 'erase' });
        mutateBoard((prev) => ({
          ...prev,
          strokes: (prev.strokes || []).filter((stroke) => distanceToStroke(stroke, point) > 24),
        }));
        return;
      }

      setSelectedNoteId(null);
      setSelectedConnectorId(null);
      setInteraction({
        type: 'pan',
        originClientX: event.clientX,
        originClientY: event.clientY,
        originPanX: panRef.current.x,
        originPanY: panRef.current.y,
      });
    },
    [canEdit, currentUser?.id, getBoardPoint, mutateBoard, selectedColor, tool]
  );

  const beginNoteDrag = useCallback(
    (event, noteId) => {
      if (!canEdit) return;
      event.preventDefault();
      event.stopPropagation();
      const point = getBoardPoint(event);
      const note = (boardRef.current.notes || []).find((entry) => entry.id === noteId);
      if (!note) return;
      setSelectedNoteId(noteId);
      setSelectedConnectorId(null);
      setInteraction({
        type: 'note-drag',
        noteId,
        offsetX: point.x - note.x,
        offsetY: point.y - note.y,
      });
    },
    [canEdit, getBoardPoint]
  );

  const handleNoteSelect = useCallback(
    (event, noteId) => {
      event.stopPropagation();
      if (tool === 'link' && canEdit) {
        if (!connectorStartId) {
          setConnectorStartId(noteId);
          setSelectedNoteId(noteId);
          return;
        }
        if (connectorStartId === noteId) {
          setConnectorStartId(null);
          return;
        }
        const now = new Date().toISOString();
        mutateBoard((prev) => ({
          ...prev,
          connectors: [
            ...(prev.connectors || []).filter(
              (connector) =>
                !(
                  (connector.fromNoteId === connectorStartId && connector.toNoteId === noteId) ||
                  (connector.fromNoteId === noteId && connector.toNoteId === connectorStartId)
                )
            ),
            {
              id: createId('link'),
              fromNoteId: connectorStartId,
              toNoteId: noteId,
              label: '',
              color: '#e7c98e',
              createdBy: currentUser?.id ? String(currentUser.id) : null,
              createdAt: now,
              updatedAt: now,
            },
          ],
        }));
        setConnectorStartId(null);
        setSelectedNoteId(noteId);
        return;
      }
      setConnectorStartId(null);
      setSelectedNoteId(noteId);
      setSelectedConnectorId(null);
    },
    [canEdit, connectorStartId, currentUser?.id, mutateBoard, tool]
  );

  useEffect(() => {
    if (!interaction) return undefined;

    const handlePointerMove = (event) => {
      const currentInteraction = interactionRef.current;
      if (!currentInteraction) return;
      if (currentInteraction.type === 'pan') {
        setPan({
          x: currentInteraction.originPanX + (event.clientX - currentInteraction.originClientX),
          y: currentInteraction.originPanY + (event.clientY - currentInteraction.originClientY),
        });
        return;
      }

      const point = getBoardPoint(event);

      if (currentInteraction.type === 'note-drag') {
        mutateBoard((prev) => ({
          ...prev,
          notes: (prev.notes || []).map((note) =>
            note.id === currentInteraction.noteId
              ? {
                  ...note,
                  x: clamp(point.x - currentInteraction.offsetX, 16, BOARD_WIDTH - (note.width || 260) - 16),
                  y: clamp(point.y - currentInteraction.offsetY, 16, BOARD_HEIGHT - (note.height || 210) - 16),
                  updatedBy: currentUser?.id ? String(currentUser.id) : note.updatedBy,
                  updatedAt: new Date().toISOString(),
                }
              : note
          ),
        }));
        return;
      }

      if (currentInteraction.type === 'draw') {
        setActiveStroke((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            points: [...prev.points, point],
            updatedAt: new Date().toISOString(),
          };
        });
        return;
      }

      if (currentInteraction.type === 'erase') {
        mutateBoard((prev) => ({
          ...prev,
          strokes: (prev.strokes || []).filter((stroke) => distanceToStroke(stroke, point) > 24),
        }));
      }
    };

    const handlePointerUp = () => {
      const currentInteraction = interactionRef.current;
      if (currentInteraction?.type === 'draw' && activeStroke?.points?.length > 1) {
        mutateBoard((prev) => ({
          ...prev,
          strokes: [...(prev.strokes || []), activeStroke],
        }));
      }
      setActiveStroke(null);
      setInteraction(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeStroke, currentUser?.id, getBoardPoint, interaction, mutateBoard]);

  const noteMap = useMemo(
    () => new Map((localBoard?.notes || []).map((note) => [note.id, note])),
    [localBoard?.notes]
  );

  const selectedNote = useMemo(
    () => (localBoard?.notes || []).find((note) => note.id === selectedNoteId) || null,
    [localBoard?.notes, selectedNoteId]
  );

  const selectedConnector = useMemo(
    () => (localBoard?.connectors || []).find((connector) => connector.id === selectedConnectorId) || null,
    [localBoard?.connectors, selectedConnectorId]
  );

  const handleWheel = useCallback((event) => {
    if (!isOpen) return;
    event.preventDefault();
    const nextZoom = clamp(zoomRef.current + (event.deltaY < 0 ? 0.08 : -0.08), 0.45, 1.35);
    setZoom(nextZoom);
  }, [isOpen]);

  const previewNotes = (boardState?.notes || []).slice(0, 4);
  const previewStrokes = (boardState?.strokes || []).slice(0, 8);
  const previewConnectors = (boardState?.connectors || []).slice(0, 6);
  const updatedByLabel = authorLabel(authorNames, boardState?.updatedBy);

  return (
    <>
      <section
        className={`cpt-panel cnb-preview ${canEdit ? 'cnb-preview--interactive' : ''}`}
        role={canEdit ? 'button' : undefined}
        tabIndex={canEdit ? 0 : undefined}
        onClick={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (canEdit && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        <div className="cpt-section-head">
          <div>
            <p className="cpt-card-eyebrow">Shared Notes Board</p>
            <h3>Campaign Board</h3>
          </div>
          <div className="cnb-preview__meta">
            <span>{(boardState?.notes || []).length} notes</span>
            <span>{(boardState?.connectors || []).length} links</span>
            <span>{(boardState?.strokes || []).length} strokes</span>
          </div>
        </div>

        <div className="cnb-preview__body">
          <div className="cnb-preview__board">
            <svg className="cnb-preview__svg" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
              {previewConnectors.map((connector) => {
                const fromNote = noteMap.get(connector.fromNoteId);
                const toNote = noteMap.get(connector.toNoteId);
                if (!fromNote || !toNote) return null;
                return (
                  <line
                    key={connector.id}
                    x1={fromNote.x + fromNote.width / 2}
                    y1={fromNote.y + fromNote.height / 2}
                    x2={toNote.x + toNote.width / 2}
                    y2={toNote.y + toNote.height / 2}
                    stroke={connector.color || '#e7c98e'}
                    strokeWidth="10"
                    strokeLinecap="round"
                    opacity="0.55"
                  />
                );
              })}
              {previewStrokes.map((stroke) => (
                <path
                  key={stroke.id}
                  d={pathFromPoints(stroke.points)}
                  fill="none"
                  stroke={stroke.color || '#cfaa68'}
                  strokeWidth={Math.max(2, Number(stroke.width || 4))}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.55"
                />
              ))}
            </svg>
            {previewNotes.map((note) => (
              <article
                key={note.id}
                className="cnb-preview-note"
                style={{
                  left: `${(note.x / BOARD_WIDTH) * 100}%`,
                  top: `${(note.y / BOARD_HEIGHT) * 100}%`,
                  width: `${Math.max(18, (note.width / BOARD_WIDTH) * 100)}%`,
                  height: `${Math.max(18, (note.height / BOARD_HEIGHT) * 100)}%`,
                  background: note.color,
                }}
              >
                <p>{note.text || 'New clue'}</p>
              </article>
            ))}
            {loading && <div className="cnb-preview__veil">Loading board...</div>}
          </div>
          <div className="cnb-preview__summary">
            <p>{formatRelativeTime(boardState?.updatedAt)}</p>
            <span>Last touched by {updatedByLabel}</span>
            <button type="button" className="cp-btn cp-btn--primary cp-btn--sm">
              Open Board
            </button>
          </div>
        </div>
      </section>

      {isOpen && (
        <div className="cnb-overlay">
          <div className="cnb-shell">
            <header className="cnb-topbar">
              <div>
                <p className="cpt-card-eyebrow">Campaign Board</p>
                <h2>Shared investigation wall</h2>
              </div>
              <div className="cnb-topbar__actions">
                <span className={`cnb-save-state cnb-save-state--${saveState}`}>{saveState === 'error' ? 'Save failed' : saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Ready'}</span>
                {saveState === 'error' && canEdit && (
                  <button type="button" className="cp-chip-btn" onClick={() => persistBoard(boardRef.current)}>
                    Retry Save
                  </button>
                )}
                <button type="button" className="cp-chip-btn" onClick={() => setZoom((value) => clamp(value - 0.12, 0.45, 1.35))}>
                  -
                </button>
                <button type="button" className="cp-chip-btn" onClick={() => setZoom(0.68)}>
                  Reset View
                </button>
                <button type="button" className="cp-chip-btn" onClick={() => setZoom((value) => clamp(value + 0.12, 0.45, 1.35))}>
                  +
                </button>
                <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={() => setIsOpen(false)}>
                  Close Board
                </button>
              </div>
            </header>

            <div className="cnb-main">
              <div className="cnb-tools">
                <div className="cnb-tool-group">
                  {[
                    ['select', 'Move'],
                    ['note', 'Note'],
                    ['pen', 'Pen'],
                    ['eraser', 'Erase'],
                    ['link', connectorStartId ? 'Pick Target' : 'Link'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`cp-chip-btn ${tool === value ? 'cp-chip-btn--active' : ''}`}
                      onClick={() => {
                        setTool(value);
                        if (value !== 'link') setConnectorStartId(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="cnb-tool-group">
                  {NOTE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`cnb-color-swatch ${selectedColor === color ? 'cnb-color-swatch--active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setSelectedColor(color)}
                      aria-label={`Select ${color} color`}
                    />
                  ))}
                </div>

                {canManage && (
                  <button
                    type="button"
                    className="cp-chip-btn"
                    onClick={() =>
                      mutateBoard((prev) => ({
                        ...prev,
                        notes: [],
                        strokes: [],
                        connectors: [],
                      }))
                    }
                  >
                    Clear Board
                  </button>
                )}
              </div>

              <div className="cnb-board-wrap">
                <div className="cnb-board-readout">
                  <span>{connectorStartId ? 'Select a second note to finish the link.' : 'Click the board to place notes, draw, or pan the wall.'}</span>
                  <strong>{Math.round(zoom * 100)}%</strong>
                </div>
                <div
                  ref={viewportRef}
                  className="cnb-viewport"
                  onPointerDown={handleSurfacePointerDown}
                  onWheel={handleWheel}
                >
                  <div
                    className="cnb-surface"
                    style={{
                      width: BOARD_WIDTH,
                      height: BOARD_HEIGHT,
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    }}
                  >
                    <svg className="cnb-svg" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}>
                      {(localBoard?.connectors || []).map((connector) => {
                        const fromNote = noteMap.get(connector.fromNoteId);
                        const toNote = noteMap.get(connector.toNoteId);
                        if (!fromNote || !toNote) return null;
                        const isActive = selectedConnectorId === connector.id;
                        return (
                          <line
                            key={connector.id}
                            x1={fromNote.x + fromNote.width / 2}
                            y1={fromNote.y + fromNote.height / 2}
                            x2={toNote.x + toNote.width / 2}
                            y2={toNote.y + toNote.height / 2}
                            stroke={isActive ? '#ffe3a8' : connector.color || '#e7c98e'}
                            strokeWidth={isActive ? 8 : 6}
                            strokeLinecap="round"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedConnectorId(connector.id);
                              setSelectedNoteId(null);
                            }}
                          />
                        );
                      })}
                      {(localBoard?.strokes || []).map((stroke) => (
                        <path
                          key={stroke.id}
                          d={pathFromPoints(stroke.points)}
                          fill="none"
                          stroke={stroke.color || '#cfaa68'}
                          strokeWidth={Math.max(2, Number(stroke.width || 4))}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                      {activeStroke && (
                        <path
                          d={pathFromPoints(activeStroke.points)}
                          fill="none"
                          stroke={activeStroke.color || '#cfaa68'}
                          strokeWidth={Math.max(2, Number(activeStroke.width || 4))}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </svg>

                    {(localBoard?.notes || []).map((note) => (
                      <article
                        key={note.id}
                        data-note-card="true"
                        className={`cnb-note ${selectedNoteId === note.id ? 'cnb-note--active' : ''}`}
                        style={{
                          left: note.x,
                          top: note.y,
                          width: note.width,
                          minHeight: note.height,
                          background: note.color,
                        }}
                        onClick={(event) => handleNoteSelect(event, note.id)}
                      >
                        <button
                          type="button"
                          className="cnb-note__grab"
                          onPointerDown={(event) => beginNoteDrag(event, note.id)}
                        >
                          drag
                        </button>
                        <textarea
                          value={note.text}
                          placeholder="Drop a clue, rumor, or reminder here..."
                          onChange={(event) =>
                            mutateBoard((prev) => ({
                              ...prev,
                              notes: (prev.notes || []).map((entry) =>
                                entry.id === note.id
                                  ? {
                                      ...entry,
                                      text: event.target.value,
                                      updatedBy: currentUser?.id ? String(currentUser.id) : entry.updatedBy,
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : entry
                              ),
                            }))
                          }
                          disabled={!canEdit}
                        />
                        <footer className="cnb-note__footer">
                          <span className="cnb-note__badge">
                            {initialsForName(authorLabel(authorNames, note.createdBy))}
                          </span>
                          <span>{authorLabel(authorNames, note.createdBy)}</span>
                        </footer>
                      </article>
                    ))}
                  </div>
                </div>
              </div>

              <aside className="cnb-sidepanel">
                <section className="cnb-sidepanel__section">
                  <div className="cpt-section-head">
                    <div>
                      <p className="cpt-card-eyebrow">Selection</p>
                      <h4>{selectedNote ? 'Sticky note' : selectedConnector ? 'Connector' : 'Nothing selected'}</h4>
                    </div>
                    {selectedNote && canManage && (
                      <button
                        type="button"
                        className="cp-chip-btn"
                        onClick={() =>
                          mutateBoard((prev) => ({
                            ...prev,
                            notes: (prev.notes || []).filter((note) => note.id !== selectedNote.id),
                            connectors: (prev.connectors || []).filter(
                              (connector) =>
                                connector.fromNoteId !== selectedNote.id && connector.toNoteId !== selectedNote.id
                            ),
                          }))
                        }
                      >
                        Delete Note
                      </button>
                    )}
                    {selectedConnector && canManage && (
                      <button type="button" className="cp-chip-btn" onClick={removeSelectedConnector}>
                        Remove Link
                      </button>
                    )}
                  </div>

                  {selectedNote ? (
                    <div className="cnb-selection">
                      <label>
                        <span>Color</span>
                        <div className="cnb-tool-group">
                          {NOTE_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              className={`cnb-color-swatch ${selectedNote.color === color ? 'cnb-color-swatch--active' : ''}`}
                              style={{ background: color }}
                              onClick={() =>
                                mutateBoard((prev) => ({
                                  ...prev,
                                  notes: (prev.notes || []).map((note) =>
                                    note.id === selectedNote.id
                                      ? { ...note, color, updatedAt: new Date().toISOString(), updatedBy: currentUser?.id ? String(currentUser.id) : note.updatedBy }
                                      : note
                                  ),
                                }))
                              }
                            />
                          ))}
                        </div>
                      </label>
                      <p>{formatRelativeTime(selectedNote.updatedAt)}</p>
                      <span>Created by {authorLabel(authorNames, selectedNote.createdBy)}</span>
                    </div>
                  ) : selectedConnector ? (
                    <div className="cnb-selection">
                      <p>
                        {authorLabel(authorNames, selectedConnector.createdBy)} linked{' '}
                        <strong>{noteMap.get(selectedConnector.fromNoteId)?.text?.split('\n')[0] || 'Note A'}</strong>{' '}
                        to{' '}
                        <strong>{noteMap.get(selectedConnector.toNoteId)?.text?.split('\n')[0] || 'Note B'}</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="cnb-selection">
                      <p>Select a sticky note or link to inspect it.</p>
                    </div>
                  )}
                </section>

                <section className="cnb-sidepanel__section" data-connector-list="true">
                  <div className="cpt-section-head">
                    <div>
                      <p className="cpt-card-eyebrow">Links</p>
                      <h4>{(localBoard?.connectors || []).length} connectors</h4>
                    </div>
                  </div>
                  <div className="cnb-connector-list">
                    {(localBoard?.connectors || []).length === 0 ? (
                      <p className="cnb-empty-copy">Link two notes together to build your thread wall.</p>
                    ) : (
                      (localBoard?.connectors || []).map((connector) => (
                        <button
                          key={connector.id}
                          type="button"
                          className={`cnb-connector-chip ${selectedConnectorId === connector.id ? 'cnb-connector-chip--active' : ''}`}
                          onClick={() => {
                            setSelectedConnectorId(connector.id);
                            setSelectedNoteId(null);
                          }}
                        >
                          <span>{noteMap.get(connector.fromNoteId)?.text?.split('\n')[0] || 'Note A'}</span>
                          <strong>to</strong>
                          <span>{noteMap.get(connector.toNoteId)?.text?.split('\n')[0] || 'Note B'}</span>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
