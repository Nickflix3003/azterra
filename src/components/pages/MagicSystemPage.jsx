import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MAGIC_SYSTEMS, getMagicSystem } from '../../data/magicSystems';
import './MagicPage.css';
import { useAuth } from '../../context/AuthContext';
import ShaderBackground from '../visuals/ShaderBackground';
import MathEffects from './MathEffects';

function AzterraEffects() {
  const spores = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 10 + Math.random() * 16,
        dur: 9 + Math.random() * 14,
        delay: Math.random() * 6,
        drift: Math.random() * 8 + 4,
      })),
    []
  );

  const leaves = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 10 + Math.random() * 14,
        rot: Math.random() * 180,
        delay: Math.random() * 10,
        dur: 12 + Math.random() * 12,
      })),
    []
  );

  return (
    <div className="azterra-effects" aria-hidden="true">
      <div className="azterra-veins" />
      <div className="azterra-vignette" />
      {spores.map((s) => (
        <span
          key={s.id}
          className="azterra-spore"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
            '--drift': `${s.drift}px`,
          }}
        />
      ))}
      {leaves.map((leaf) => (
        <span
          key={leaf.id}
          className="azterra-leaf"
          style={{
            left: `${leaf.x}%`,
            top: `${leaf.y}%`,
            width: `${leaf.size}px`,
            height: `${leaf.size * 0.6}px`,
            transform: `rotate(${leaf.rot}deg)`,
            animationDuration: `${leaf.dur}s`,
            animationDelay: `${leaf.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function KayaEffects() {
  const embers = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 4 + Math.random() * 8,
        dur: 6 + Math.random() * 8,
        delay: Math.random() * 8,
      })),
    []
  );

  return (
    <div className="kaya-effects" aria-hidden="true">
      <div className="kaya-beams" />
      {embers.map((e) => (
        <span
          key={e.id}
          className="kaya-ember"
          style={{
            left: `${e.x}%`,
            top: `${e.y}%`,
            width: `${e.size}px`,
            height: `${e.size}px`,
            animationDuration: `${e.dur}s`,
            animationDelay: `${e.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function KroviEffects() {
  const stars = useMemo(
    () =>
      Array.from({ length: 32 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 3 + Math.random() * 3,
        delay: Math.random() * 10,
        dur: 9 + Math.random() * 6,
        hue: Math.random() * 10 + 205, // tight hue range
        hero: Math.random() > 0.92,
      })),
    []
  );

  return (
    <div className="krovi-effects" aria-hidden="true">
      {stars.map((s) => (
        <span
          key={s.id}
          className="krovi-star krovi-star--pulse"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            '--k-dur': `${s.dur}s`,
            '--k-delay': `${s.delay}s`,
            '--k-hue': `${s.hue}deg`,
            '--k-alpha': s.hero ? 0.9 : 0.7,
            '--k-glow': s.hero ? 6 : 4,
          }}
        />
      ))}
    </div>
  );
}

function SpiritsEffects() {
  const rings = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 80 + Math.random() * 180,
        delay: Math.random() * 6,
        duration: 12 + Math.random() * 10,
      })),
    []
  );

  return (
    <div className="spirits-effects" aria-hidden="true">
      <div className="spirits-glow" />
      {rings.map((ring) => (
        <span
          key={ring.id}
          className="spirit-ring"
          style={{
            left: `${ring.x}%`,
            top: `${ring.y}%`,
            width: `${ring.size}px`,
            height: `${ring.size}px`,
            animationDuration: `${ring.duration}s`,
            animationDelay: `${ring.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function WildEffects() {
  return (
    <div className="wild-effects" aria-hidden="true">
      <div className="wild-storm wild-storm--a" />
      <div className="wild-storm wild-storm--b" />
      <div className="wild-rays" />
      <div className="wild-noise" />
    </div>
  );
}

function InteractiveDukeTree({ god, color }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 900 });
  const [positions, setPositions] = useState({});
  const [expanded, setExpanded] = useState({});
  const positionsRef = useRef({});
  const velocitiesRef = useRef({});
  const [driftSeed] = useState(() => Math.random() * 1000);
  const nodes = useMemo(() => {
    const root = { id: `${god.name}-root`, name: god.name, effect: god.description, isRoot: true };
    const children = (god.entries || []).map((entry, idx) => ({
      id: `${god.name}-${entry.name}-${idx}`,
      name: entry.name,
      effect: entry.effect,
      lockedHint: god.lockedHint,
    }));
    return [root, ...children];
  }, [god]);

  useEffect(() => {
    const updateDims = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height || 520 });
    };
    updateDims();
    window.addEventListener('resize', updateDims);
    return () => window.removeEventListener('resize', updateDims);
  }, []);

  useEffect(() => {
    if (!dimensions.width) return;
    const rootY = 60;
    const rowY = 320;
    const spacing = 220;
    const centerX = dimensions.width / 2;
    const childCount = nodes.length - 1;
    const startX = centerX - ((childCount - 1) * spacing) / 2;
    const nextPositions = {};
    nodes.forEach((node, idx) => {
      if (node.isRoot) {
        nextPositions[node.id] = { x: centerX, y: rootY };
      } else {
        const childIndex = idx - 1;
        nextPositions[node.id] = {
          x: startX + childIndex * spacing,
          y: rowY + (childIndex % 2 === 0 ? -40 : 60),
        };
      }
    });
    setPositions(nextPositions);
    positionsRef.current = nextPositions;
    velocitiesRef.current = nodes.reduce((acc, node) => {
      acc[node.id] = { vx: 0, vy: 0 };
      return acc;
    }, {});
  }, [dimensions.width, nodes]);

  const [dragging, setDragging] = useState(null);

  const onPointerDown = (id) => (event) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = positions[id] || { x: 0, y: 0 };
    const offsetX = event.clientX - (rect.left + pos.x);
    const offsetY = event.clientY - (rect.top + pos.y);
    setDragging({ id, offsetX, offsetY });
  };

  const onPointerMove = (event) => {
    if (!dragging || dragging.id.endsWith('-root')) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left - dragging.offsetX;
    const y = event.clientY - rect.top - dragging.offsetY;
    setPositions((prev) => ({
      ...prev,
      [dragging.id]: {
        x: Math.min(Math.max(x, 20), rect.width - 120),
        y: Math.min(Math.max(y, 80), rect.height - 80),
      },
    }));
  };

  const onPointerUp = () => setDragging(null);

  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const root = nodes.find((n) => n.isRoot);
  const children = nodes.filter((n) => !n.isRoot);

  const getBoxSize = (node, isExpanded) => {
    if (node.isRoot) return { w: 240, h: isExpanded ? 220 : 120 };
    if (isExpanded) return { w: 280, h: 220 };
    return { w: 180, h: 110 };
  };

  const getCenter = (node, pos) => {
    const size = getBoxSize(node, expanded[node.id]);
    return { x: (pos?.x || 0) + size.w / 2, y: (pos?.y || 0) + size.h / 2 };
  };

  const computeAnchors = () => {
    const anchors = {};
    const rootPos = positions[root.id] || { x: 0, y: 0 };
    const rootSize = getBoxSize(root, false);
    const rootCenter = getCenter(root, rootPos);
    const count = children.length || 1;
    const angleStart = -Math.PI / 2;
    const angleStep = (Math.PI * 2) / count;
    children.forEach((child, idx) => {
      const childPos = positions[child.id] || { x: 0, y: 0 };
      const childSize = getBoxSize(child, expanded[child.id]);
      const angle = angleStart + idx * angleStep;
      const start = {
        x: rootCenter.x + Math.cos(angle) * (Math.min(rootSize.w, rootSize.h) / 2),
        y: rootCenter.y + Math.sin(angle) * (Math.min(rootSize.w, rootSize.h) / 2),
      };
      const childCenter = getCenter(child, childPos);
      // pick anchor on child edge facing start
      const dx = start.x - childCenter.x;
      const dy = start.y - childCenter.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      let end = { x: childCenter.x, y: childCenter.y };
      if (absDx > absDy) {
        end.x = childCenter.x + (dx > 0 ? childSize.w / 2 : -childSize.w / 2);
        end.y = childCenter.y + (dy / (absDx || 1)) * (childSize.h / 2);
      } else {
        end.y = childCenter.y + (dy > 0 ? childSize.h / 2 : -childSize.h / 2);
        end.x = childCenter.x + (dx / (absDy || 1)) * (childSize.w / 2);
      }
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const ctrl = { x: mid.x - dy * 0.25, y: mid.y + dx * 0.25 };
      anchors[child.id] = { start, end, ctrl };
    });
    return anchors;
  };

  const anchors = computeAnchors();
  const noiseTimeRef = useRef(0);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    let raf;
    const simulate = () => {
      const current = { ...positionsRef.current };
      const velocities = { ...velocitiesRef.current };
      const w = dimensions.width || 1000;
      const h = dimensions.height || 900;
      const margin = 32;

      const ids = Object.keys(current);
      ids.forEach((id) => {
        if (!velocities[id]) velocities[id] = { vx: 0, vy: 0 };
      });

      // Separation + boundary
      ids.forEach((id, i) => {
        const posA = current[id];
        const sizeA = getBoxSize(nodes.find((n) => n.id === id), expanded[id]);
        const radA = Math.max(sizeA.w, sizeA.h) / 2;
        const velA = velocities[id];
        const isRoot = nodes.find((n) => n.id === id)?.isRoot;
        if (isRoot) {
          // gently return to center horizontally
          const centerX = w / 2;
          const centerY = 120;
          velA.vx += (centerX - posA.x) * 0.0025;
          velA.vy += (centerY - posA.y) * 0.0025;
        }

        // Bounds
        const leftOverlap = margin - (posA.x - radA);
        const rightOverlap = (posA.x + radA) - (w - margin);
        const topOverlap = margin - (posA.y - radA);
        const bottomOverlap = (posA.y + radA) - (h - margin);
        const boundaryForce = isRoot ? 0.02 : 0.08;
        if (leftOverlap > 0) velA.vx += boundaryForce * leftOverlap;
        if (rightOverlap > 0) velA.vx -= boundaryForce * rightOverlap;
        if (topOverlap > 0) velA.vy += boundaryForce * topOverlap;
        if (bottomOverlap > 0) velA.vy -= boundaryForce * bottomOverlap;

        for (let j = i + 1; j < ids.length; j += 1) {
          const idB = ids[j];
          const posB = current[idB];
          const sizeB = getBoxSize(nodes.find((n) => n.id === idB), expanded[idB]);
          const radB = Math.max(sizeB.w, sizeB.h) / 2;
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const dist = Math.max(Math.hypot(dx, dy), 0.001);
          const minDist = radA + radB + 24;
          if (dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const push = overlap * 0.05;
            velocities[id].vx -= nx * push * (isRoot ? 0.35 : 1);
            velocities[id].vy -= ny * push * (isRoot ? 0.35 : 1);
            velocities[idB].vx += nx * push;
            velocities[idB].vy += ny * push;
          }
        }
      });

      // Drift, friction, integrate
      noiseTimeRef.current += 0.016;
      ids.forEach((id, idx) => {
        const v = velocities[id];
        const noise = 0.12;
        const isRoot = nodes.find((n) => n.id === id)?.isRoot;
        const t = noiseTimeRef.current;
        v.vx += Math.sin(driftSeed + t * 0.25 + idx) * noise * (isRoot ? 0.15 : 0.6);
        v.vy += Math.cos(driftSeed + t * 0.28 + idx * 0.4) * noise * (isRoot ? 0.15 : 0.6);
        // viscous damping for "thick liquid"
        const damping = isRoot ? 0.97 : 0.94;
        v.vx *= damping;
        v.vy *= damping;
        const speed = Math.hypot(v.vx, v.vy);
        const maxSpeed = isRoot ? 1.2 : 2.5;
        if (speed > maxSpeed) {
          v.vx = (v.vx / speed) * maxSpeed;
          v.vy = (v.vy / speed) * maxSpeed;
        }
        current[id] = {
          x: current[id].x + v.vx,
          y: current[id].y + v.vy,
        };
      });

      positionsRef.current = current;
      velocitiesRef.current = velocities;
      setPositions(current);
      raf = requestAnimationFrame(simulate);
    };
    raf = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(raf);
  }, [nodes, dimensions.width, dimensions.height, expanded, driftSeed]);

  return (
    <div
      className="magic-tree-playground"
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{ '--branch-accent': color }}
    >
      <div className="magic-tree-bg" />
      <svg className="magic-tree-lines" aria-hidden="true">
        {children.map((child) => {
          const a = anchors[child.id];
          if (!a) return null;
          return (
            <path
              key={child.id}
              d={`M ${a.start.x} ${a.start.y} Q ${a.ctrl.x} ${a.ctrl.y} ${a.end.x} ${a.end.y}`}
              fill="none"
              stroke={color}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeOpacity="0.75"
              strokeDasharray="2 0"
            />
          );
        })}
      </svg>
      {nodes.map((node) => {
        const pos = positions[node.id] || { x: 0, y: 0 };
        const isExpanded = expanded[node.id];
        const size = getBoxSize(node, isExpanded);
        const labelInitial = node.name?.[0] || '?';
        return (
          <div
            key={node.id}
            className={`magic-draggable ${node.isRoot ? 'magic-draggable--root' : ''} ${isExpanded ? 'magic-draggable--expanded' : ''}`}
            style={{ '--tx': `${pos.x}px`, '--ty': `${pos.y}px`, width: `${size.w}px`, height: `${size.h}px` }}
            onPointerDown={onPointerDown(node.id)}
            onClick={() => !node.isRoot && toggleExpand(node.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => !node.isRoot && e.key === 'Enter' && toggleExpand(node.id)}
          >
            <div className="magic-draggable__handle" />
            <div className="magic-draggable__icon" aria-hidden="true">{labelInitial}</div>
            <div className="magic-draggable__title">{node.name}</div>
            {node.isRoot && <div className="magic-draggable__subtitle">{god.aura}</div>}
            {node.lockedHint && <div className="magic-draggable__hint">{node.lockedHint}</div>}
            {isExpanded && !node.isRoot && (
              <div className="magic-draggable__body">
                <p>{node.effect}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NatureVines() {
  const leftPaths = [
    'M10 480 C 40 410, 60 360, 30 300 S 20 220, 70 180 S 90 120, 60 70 S 100 30, 140 10',
    'M110 520 C 140 450, 160 380, 130 330 S 110 260, 150 220 S 170 150, 140 110 S 180 70, 210 40',
    'M60 520 C 50 430, 70 350, 90 300 S 120 240, 100 200 S 80 140, 120 90 S 90 40, 150 20',
  ];
  const rightPaths = [
    'M310 480 C 280 410, 260 360, 290 300 S 300 220, 250 180 S 230 120, 260 70 S 220 30, 180 10',
    'M200 520 C 170 450, 150 380, 180 330 S 200 260, 160 220 S 140 150, 170 110 S 130 70, 100 40',
    'M250 520 C 270 430, 240 350, 220 300 S 200 240, 230 200 S 260 140, 230 90 S 260 50, 200 20',
  ];

  return (
    <div className="nature-vines" aria-hidden="true">
      <svg className="nature-vines__svg nature-vines__svg--left" viewBox="0 0 320 520" preserveAspectRatio="none">
        {leftPaths.map((d, idx) => (
          <path key={d} d={d} className={`nature-vine nature-vine--${idx}`} />
        ))}
      </svg>
      <svg className="nature-vines__svg nature-vines__svg--right" viewBox="0 0 320 520" preserveAspectRatio="none">
        {rightPaths.map((d, idx) => (
          <path key={d} d={d} className={`nature-vine nature-vine--${idx}`} />
        ))}
      </svg>
    </div>
  );
}

export default function MagicSystemPage() {
  const { id } = useParams();
  const system = getMagicSystem(id) || MAGIC_SYSTEMS[0];
  const isGods = system.id === 'gods';
  const { isSecretUnlocked, role } = useAuth();
  const locked = system.secretId && role !== 'admin' && !isSecretUnlocked(system.secretId);
  const [selectedGod, setSelectedGod] = useState('kaya');
  const activeGod = isGods ? system.dukes[selectedGod] : null;

  const godTheme = isGods
    ? selectedGod === 'kaya'
      ? {
          primary: system.dukes.kaya.color,
          accent: '#d97706',
          secondary: '#fef8eb',
          background: 'linear-gradient(135deg, #f8e5c0 0%, #f6d59f 45%, #f3c680 100%)',
          pageBackground: 'radial-gradient(circle at 18% 22%, rgba(255, 205, 120, 0.25) 0, transparent 35%), radial-gradient(circle at 82% 10%, rgba(255, 163, 64, 0.25) 0, transparent 40%), linear-gradient(140deg, #f5deba 0%, #f2d099 50%, #e8b86f 100%)',
          card: 'rgba(255, 255, 255, 0.9)',
          text: '#1f1305',
          muted: '#3b2410',
          playground: 'linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.55))',
          heroTitle: '#8b4000',
        }
      : {
          primary: system.dukes.krovi.color,
          accent: '#c7e0ff',
          secondary: '#050914',
          background: 'linear-gradient(135deg, #050914 0%, #0a1020 45%, #02060f 100%)',
          pageBackground: undefined,
          card: 'rgba(255, 255, 255, 0.06)',
          text: '#f5e5c9',
          muted: 'rgba(245, 229, 201, 0.78)',
          playground: undefined,
          heroTitle: '#dbeafe',
        }
    : null;

  const themeStyle = useMemo(
    () => ({
      '--magic-primary': isGods ? godTheme.primary : system.colors.primary,
      '--magic-secondary': isGods ? godTheme.secondary : system.colors.secondary,
      '--magic-accent': isGods ? godTheme.accent : system.colors.accent,
      '--magic-card': isGods ? (godTheme.card || system.colors.card) : system.colors.card,
      '--magic-bg': isGods ? (godTheme.pageBackground || godTheme.background) : system.colors.background,
      '--magic-bg-color': isGods ? (godTheme.backgroundColor || (selectedGod === 'kaya' ? '#fff7eb' : '#050914')) : (system.colors.secondary || '#0c0b0f'),
      '--magic-text': isGods ? godTheme.text : undefined,
      '--magic-muted': isGods ? godTheme.muted : undefined,
      '--magic-playground-bg': isGods ? godTheme.playground : undefined,
      '--magic-hero-title': isGods ? godTheme.heroTitle : undefined,
    }),
    [system, isGods, godTheme, selectedGod]
  );

  return (
    <div className={`magic-page magic-page--layered ${isGods ? `magic-page--${selectedGod}` : ''}`} style={themeStyle}>
      {system.id === 'wild' && <WildEffects />}
      {isGods && <div className="magic-fade-layer" aria-hidden="true" />}
      {isGods && selectedGod === 'kaya' && (
        <div className="magic-feature magic-feature--sun">
          <div className="magic-feature__sun-glow" />
          <div className="magic-feature__sun-rays" />
          <ShaderBackground modA={[1.8, 1.2, 0.6, 0.9]} />
          <div className="magic-feature__label">Kaya's Radiance</div>
        </div>
      )}
      {isGods && selectedGod === 'kaya' && <KayaEffects />}
      {isGods && selectedGod === 'krovi' && <KroviEffects />}
      <div className="magic-hero" style={{ background: isGods ? godTheme.background : system.colors.background }}>
        <div className="magic-hero__eyebrow">Magic System</div>
        <h1 className="magic-hero__title">{system.name}</h1>
        <p className="magic-hero__lead">{locked ? 'Glyphs shimmer, but the page will not open.' : system.summary}</p>
        {isGods && !locked && (
          <div className="magic-god-toggle" role="tablist" aria-label="Select god">
            <button
              type="button"
              className={`magic-god-toggle__half ${selectedGod === 'kaya' ? 'is-active' : ''}`}
              onClick={() => setSelectedGod('kaya')}
              role="tab"
              aria-selected={selectedGod === 'kaya'}
            >
              Kaya
            </button>
            <button
              type="button"
              className={`magic-god-toggle__half magic-god-toggle__half--right ${selectedGod === 'krovi' ? 'is-active' : ''}`}
              onClick={() => setSelectedGod('krovi')}
              role="tab"
              aria-selected={selectedGod === 'krovi'}
            >
              Krovi
            </button>
            <div className={`magic-god-toggle__indicator magic-god-toggle__indicator--${selectedGod}`} aria-hidden="true" />
          </div>
        )}
        <div className="magic-hero__meta">
          <span className="magic-pill" style={{ borderColor: `${system.colors.accent}80` }}>
            {isGods ? system.focus : system.focus}
          </span>
          <Link to="/magic" className="magic-pill magic-pill--ghost">
            Back to all systems
          </Link>
        </div>
      </div>

      {!isGods && (
        <section className="magic-section">
          <div className="magic-section__header">
            <p className="magic-eyebrow">Summary</p>
            <h2 className="magic-title">{system.name}</h2>
            <p className="magic-subtitle">{locked ? '????? ??? ???? ?? ???????? ??????? ?????' : system.summary}</p>
          </div>
          {system.highlights && !locked && (
            <div className="magic-grid magic-grid--highlights">
              {system.highlights.map((item) => (
                <div className="magic-card magic-card--inline" key={item} style={{ background: system.colors.card }}>
                  <div className="magic-card__dot" />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {locked ? (
        <section className="magic-section">
          <div className="magic-section__header">
            <p className="magic-eyebrow">Locked</p>
            <h2 className="magic-title">Sealed entry</h2>
            <p className="magic-subtitle">ᛞᚱᚨᚲᛟᚾᛁᚲ ᛒᛚᛟᛟᛞᛋ ᚨᚱᛖ ᛋᛏᛟᚾᛖᛞ; ᛁᚾᚲᚱᛁᛈᛏᛖᛞ ᛏᛖᛆᛉᛏ ᛋᛁᚷᛖᛚᛋ ᛋᛚᛟᚹᛚᚣ.</p>
          </div>
          <div className="magic-steps">
            <div className="magic-step" style={{ background: system.colors.card }}>
              <h3>Locked</h3>
              <p>ᚠᚢᛏᚢᚱᛖ ᚲᛚᚢᛖᛋ ᚱᛖᚻᛖᚪᚱᛋᛖ ᛏᚺᛁᛋ ᛋᛟᚾᚷ.</p>
            </div>
          </div>
        </section>
      
      ) : isGods ? (
        <div className={`gods-revamp gods-revamp--${selectedGod}`}>
          <div className="gods-hero">
            <div className="gods-hero__content">
              <p className="gods-eyebrow">
                {selectedGod === 'kaya' ? 'Goddess of Light, Order, and Control' : 'God of Darkness, Freedom, and Defiance'}
              </p>
              <h1 className="gods-hero__title">{selectedGod === 'kaya' ? 'KAYA' : 'KROVI'}</h1>
              <p className="gods-hero__lead">{activeGod?.description}</p>
              <div className="gods-hero__meta">
                <span className="gods-chip">{activeGod?.aura}</span>
                <span className="gods-chip">{selectedGod === 'kaya' ? 'Radiant authority' : 'Shadowed rebellion'}</span>
                <span className="gods-chip">Dukes: {(activeGod?.entries || []).length}</span>
              </div>
            </div>
            <button
              type="button"
              className={`gods-switch gods-switch--${selectedGod === 'kaya' ? 'right' : 'left'}`}
              onClick={() => setSelectedGod(selectedGod === 'kaya' ? 'krovi' : 'kaya')}
              aria-label={`Show ${selectedGod === 'kaya' ? 'Krovi' : 'Kaya'}`}
            >
              <span>{selectedGod === 'kaya' ? 'KROVI' : 'KAYA'}</span>
            </button>
          </div>

          <div className="gods-panels">
            <section className="gods-panel gods-panel--summary">
              <p className="gods-kicker">After Year 0</p>
              <h3>The fall of the dragon gods</h3>
              <p>
                Year 0 marks the duel where Kaya and Krovi killed each other. Their mountain-range bodies fell; their dukes?dragons the
                size of hills?remain scattered. Some bones became temples, others weapons or sealed sanctuaries. Oaths to a duke channel
                fragments of the dead gods, bending battles, morale, and fate itself.
              </p>
            </section>

            <section className="gods-panel gods-panel--dukes">
              <div className="magic-section__header magic-section__header--tight">
                <p className="magic-eyebrow">Dukes of {selectedGod === 'kaya' ? 'Kaya' : 'Krovi'}</p>
                <h3 className="magic-title">Lieutenants of a fallen god</h3>
              </div>
              <div className="gods-dukes-grid">
                {(activeGod?.entries || []).map((entry) => (
                  <div key={entry.name} className="gods-duke-card">
                    <div className="gods-duke-card__head">
                      <div className="gods-card__dot" style={{ background: activeGod?.color || system.colors.primary }} />
                      <h4>{entry.name}</h4>
                    </div>
                    <p>{entry.effect}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : system.id === 'azterra' ? (
        <>
          <section className="magic-section nature-layout">
            <div className="magic-section__header">
              <p className="magic-eyebrow">Green Lifeblood</p>
              <h2 className="magic-title">The world breathes, and life answers</h2>
              <p className="magic-subtitle">
                Verdant power courses through every root, storm, and creature born of the land. When it condenses, nature remakes itself.
              </p>
            </div>
            <NatureVines />

            <div className="nature-grid">
              <div className="nature-card nature-card--hero">
                <p className="nature-kicker">What it creates</p>
                <h3 className="nature-card__title">Wild wonders born from concentrated life</h3>
                <ul className="nature-list">
                  {[
                    'Sky whales drifting through cloud seas',
                    'Colossal worms tunneling like earthquakes',
                    'Forests that walk',
                    'Storms that think',
                    'Beasts that guard the balance',
                  ].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="nature-pill-row">
                  <span className="nature-pill">Life condensed into power</span>
                  <span className="nature-pill">Balance over vengeance</span>
                  <span className="nature-pill">Everywhere, always moving</span>
                </div>
              </div>

              <div className="nature-card">
                <p className="nature-kicker">Core concept</p>
                <h3 className="nature-card__title">Life condensed into power</h3>
                <ul className="nature-list">
                  {system.concept?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="nature-card">
                <p className="nature-kicker">How it works</p>
                <h3 className="nature-card__title">When it condenses, nature evolves</h3>
                <ul className="nature-list">
                  {system.how?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="nature-card">
                <p className="nature-kicker">Druids</p>
                <h3 className="nature-card__title">Listeners, not controllers</h3>
                <ul className="nature-list">
                  {system.druids?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="nature-card">
                <p className="nature-kicker">Nature's defense</p>
                <h3 className="nature-card__title">Balance over wrath</h3>
                <ul className="nature-list">
                  {system.defense?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="nature-card">
                <p className="nature-kicker">Aesthetic</p>
                <h3 className="nature-card__title">It feels alive because it is</h3>
                <ul className="nature-list">
                  {system.aesthetic?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          <AzterraEffects />
        </>
      ) : system.id === 'spirits' ? (
        <>
          <section className="magic-section spirits-layout">
            <div className="magic-section__header">
              <p className="magic-eyebrow">Sigils & echoes</p>
              <h2 className="magic-title">Golden stories given form</h2>
              <p className="magic-subtitle">
                Spirits are timeless emotions and ideas, born outside Azterra's green flow. Their power lives in hidden circular sigils no mortal has fully seen.
              </p>
            </div>
            <SpiritsEffects />

            <div className="spirits-grid">
              <div className="spirit-card spirit-card--hero">
                <p className="spirit-kicker">Essence</p>
                <h3 className="spirit-card__title">Beings of story, emotion, and place</h3>
                <ul className="spirit-list">
                  {system.essence?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="spirit-pill-row">
                  <span className="spirit-pill">Timeless</span>
                  <span className="spirit-pill">Story-bound</span>
                  <span className="spirit-pill">Not of Azterra's green</span>
                </div>
              </div>

              <div className="spirit-card">
                <p className="spirit-kicker">Sigils</p>
                <h3 className="spirit-card__title">Circles unlock innate power</h3>
                <ul className="spirit-list">
                  {system.sigils?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="spirit-chip-row">
                  <span className="spirit-chip">Teleport curls</span>
                  <span className="spirit-chip">Weight shells</span>
                  <span className="spirit-chip">Ripple forms</span>
                </div>
              </div>

              <div className="spirit-card">
                <p className="spirit-kicker">Scholars</p>
                <h3 className="spirit-card__title">Research meets mystery</h3>
                <ul className="spirit-list">
                  {system.scholars?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="spirit-card">
                <p className="spirit-kicker">Manifestations</p>
                <h3 className="spirit-card__title">Emotions turned to guardians</h3>
                <ul className="spirit-list">
                  {system.expressions?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="spirit-card">
                <p className="spirit-kicker">Aesthetic</p>
                <h3 className="spirit-card__title">Golden ripples, dreamlike motion</h3>
                <ul className="spirit-list">
                  {system.aesthetic?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </>
      ) : system.id === 'wild' ? (
        <>
          <section className="magic-section wild-layout">
            <div className="magic-section__header">
              <p className="magic-eyebrow">Riftborn chaos</p>
              <h2 className="magic-title">Wild Magic (Purple)</h2>
              <p className="magic-subtitle">
                The rarest current: rule-breaking, unpredictable, and seen only when rifts connect Azterra to elsewhere. Every surge is unique.
              </p>
            </div>

            <div className="wild-grid">
              <div className="wild-card">
                <p className="wild-kicker">What we see</p>
                <h3 className="wild-card__title">Manifestations</h3>
                <ul className="wild-list">
                  <li>Sudden surges and mutations that vanish as quickly as they appear.</li>
                  <li>Impossible geometry, warped space, and time hiccups.</li>
                  <li>Illusions or realities in butterfly-wing palettes of shifting color.</li>
                  <li>Effects that react to emotion, intention, or nothing at all.</li>
                </ul>
              </div>

              <div className="wild-card">
                <p className="wild-kicker">Known facts</p>
                <h3 className="wild-card__title">Rift rules</h3>
                <ul className="wild-list">
                  {system.highlights?.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="wild-card">
                <p className="wild-kicker">Study</p>
                <h3 className="wild-card__title">Why it eludes control</h3>
                <ul className="wild-list">
                  <li>No spellcaster has stabilized or contained a surge.</li>
                  <li>No two manifestations have behaved the same twice.</li>
                  <li>Origin is unknown; patterns collapse on observation.</li>
                  <li>Best treated as narrative spice, not a tool.</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      ) : system.id === 'math' ? (
        <>
          <section className="magic-section math-layout">
            <div className="math-panel math-panel--hero" style={{ background: system.colors.card }}>
              <div className="math-panel__header">
                <p className="magic-eyebrow">Core concept</p>
                <h2 className="magic-title">Understanding is Power</h2>
                <p className="magic-subtitle">
                  Math Mages calculate magic instead of channeling it; spells are equations solved in motion.
                </p>
              </div>
              <ul className="math-panel__list">
                {system.concept.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="math-panel" style={{ background: system.colors.card }}>
              <div className="math-panel__header">
                <p className="magic-eyebrow">How it works</p>
                <h3 className="magic-title">Equations in motion</h3>
              </div>
              <ul className="math-panel__list">
                {system.how.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="math-panel math-panel--frames" style={{ background: system.colors.card }}>
              <div className="math-panel__header">
                <p className="magic-eyebrow">Frames</p>
                <h3 className="magic-title">The Math Mage's Sight</h3>
                <p className="magic-subtitle">Geometric overlays, vectors, and flows to read, rewrite, and counter magic.</p>
              </div>
              <div className="math-panel__chips">
                {system.frames.map((item) => (
                  <span key={item} className="math-chip">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="math-panel math-panel--split" style={{ background: system.colors.card }}>
              <div>
                <h3>Why humans excel</h3>
                <ul className="math-panel__list">
                  {system.humans.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Wizards & math magic</h3>
                <ul className="math-panel__list">
                  {system.wizards.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="math-panel" style={{ background: system.colors.card }}>
              <div className="math-panel__header">
                <p className="magic-eyebrow">Aesthetic</p>
                <h3 className="magic-title">Cyan geometry</h3>
              </div>
              <p className="magic-subtitle">{system.aesthetic}</p>
            </div>
          </section>
          <MathEffects />
        </>
      ) : (
        <section className="magic-section">
          <div className="magic-section__header">
            <p className="magic-eyebrow">Depth</p>
            <h2 className="magic-title">How it works</h2>
            <p className="magic-subtitle">{system.focus}</p>
          </div>
          <div className="magic-steps">
            {system.sections?.map((section) => (
              <div key={section.id} className="magic-step" style={{ background: system.colors.card }}>
                <h3>{section.label}</h3>
                <p>
                  {section.id === 'concept' && system.summary}
                  {section.id === 'practice' && system.tagline}
                  {section.id === 'risk' &&
                    'Use with care: power shapes the land, and the land shapes back. Each current comes with consequences when pushed.'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
