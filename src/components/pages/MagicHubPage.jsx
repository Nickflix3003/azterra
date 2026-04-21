import React from 'react';
import { Link } from 'react-router-dom';
import { MAGIC_SYSTEMS } from '../../data/magicSystems';
import { useAuth } from '../../context/AuthContext';
import './MagicPage.css';

export default function MagicHubPage() {
  const { isSecretUnlocked, role } = useAuth();

  return (
    <div className="magic-page magic-page--hub custom-scrollbar">
      <div className="magic-hero">
        <div className="magic-hero__eyebrow">Compendium</div>
        <h1 className="magic-hero__title">Magic Systems of Azterra</h1>
        <p className="magic-hero__lead">
          Explore every current of power in Azterra—from verdant lifeblood to calculated sigils, rare spirits,
          unstable wild surges, and the twin gods whose dukes reshape fate.
        </p>
      </div>

      <div className="magic-grid">
        {MAGIC_SYSTEMS.map((system) => {
          const locked = system.secretId && role !== 'admin' && !isSecretUnlocked(system.secretId);
          const Wrapper = locked ? 'div' : Link;
          return (
            <Wrapper
              key={system.id}
              to={locked ? undefined : `/magic/${system.id}`}
              className={`magic-card ${locked ? 'magic-card--locked' : ''}`}
              style={{
                background: system.colors.background,
                borderColor: `${system.colors.primary}40`,
                boxShadow: `0 18px 38px ${system.colors.primary}30`,
                cursor: locked ? 'not-allowed' : 'pointer',
              }}
            >
              <div
                className="magic-card__glow"
                style={{ background: `${system.colors.primary}33` }}
                aria-hidden="true"
              />
              <div className="magic-card__header">
                <span
                  className="magic-pill"
                  style={{ color: system.colors.accent, borderColor: `${system.colors.accent}80` }}
                >
                  {system.name}
                </span>
                <h2 style={{ color: system.colors.accent }}>{system.name}</h2>
              </div>
              <p>{locked ? 'The inscription is sealed until its secret is spoken.' : system.summary}</p>
              <div className="magic-card__footer">
                <span className="magic-card__tagline" style={{ color: system.colors.accent }}>
                  {system.tagline}
                </span>
                <span className="magic-card__cta">{locked ? 'Locked' : 'Open'}</span>
              </div>
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}
