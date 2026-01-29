import React, { useEffect, useRef, useState } from 'react';
import '../UI/PageUI.css';

const tabs = ['details', 'background', 'showcase'];
const tabLabels = {
  details: 'Details',
  background: 'Background',
  showcase: 'Mana',
};

export default function CharacterDetailView({ character: propCharacter, onClose, onNext, onPrev, nextName, prevName }) {
  const [activeTab, setActiveTab] = useState('details');
  const [isContentVisible, setIsContentVisible] = useState(true);
  const [isSwapLocked, setIsSwapLocked] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState(null);
  const [showBackdropHint, setShowBackdropHint] = useState(false);
  const [hasAnimatedInfo, setHasAnimatedInfo] = useState(false);
  const [shouldAnimateInfo, setShouldAnimateInfo] = useState(false);
  const [displayCharacter, setDisplayCharacter] = useState(propCharacter);
  const swapDelay = 250;
  const contentRef = useRef(null);
  const modalCloseRef = useRef(null);

  const renderChips = (items = [], empty = 'None listed') => (
    <div className="detail-chip-row">
      {items.length > 0 ? items.map((item) => (
        <span key={item} className="detail-chip">{item}</span>
      )) : <span className="detail-chip detail-chip--muted">{empty}</span>}
    </div>
  );

  useEffect(() => {
    setIsContentVisible(false);
    const timer = setTimeout(() => {
      setDisplayCharacter(propCharacter);
      setIsContentVisible(true);
    }, swapDelay);
    return () => clearTimeout(timer);
  }, [propCharacter?.id]);

  useEffect(() => {
    setIsContentVisible(false);
    const timer = setTimeout(() => setIsContentVisible(true), swapDelay);
    return () => clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'showcase') {
      setShowBackdropHint(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'showcase' && !hasAnimatedInfo) {
      setShouldAnimateInfo(true);
      setHasAnimatedInfo(true);
      const t = setTimeout(() => setShouldAnimateInfo(false), 300);
      return () => clearTimeout(t);
    }
  }, [activeTab, hasAnimatedInfo]);

  useEffect(() => {
    if (contentRef.current && isContentVisible) {
      contentRef.current.focus({ preventScroll: true });
    }
  }, [isContentVisible]);

  useEffect(() => {
    if (!isSwapLocked) return;
    const timer = setTimeout(() => setIsSwapLocked(false), swapDelay);
    return () => clearTimeout(timer);
  }, [isSwapLocked]);

  useEffect(() => {
    if (!expandedPanel) return;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setExpandedPanel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedPanel]);

  useEffect(() => {
    if (expandedPanel && modalCloseRef.current) {
      modalCloseRef.current.focus({ preventScroll: true });
    }
  }, [expandedPanel]);

  if (!propCharacter || !displayCharacter) return null;

  const sheet = displayCharacter.sheet || {};
  const abilityScores = sheet.abilityScores || displayCharacter.stats || {};
  const proficiencies = sheet.proficiencies || {};
  const combat = sheet.combat || {
    armorClass: displayCharacter.ac,
    initiative: '+0',
    speed: `${displayCharacter.speed} ft`,
    hitPoints: String(displayCharacter.hp),
    hitDice: '',
    passivePerception: displayCharacter.passivePerception,
    proficiencyBonus: `+${displayCharacter.profBonus}`,
  };
  const spellsDetail = sheet.spellsDetail || {};
  const equipmentDetail = sheet.equipmentDetail || { starting: displayCharacter.equipment || [], wealth: '' };

  const handlePrevTab = () => {
    if (isSwapLocked) return;
    setIsSwapLocked(true);
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIndex]);
  };

  const handleNextTab = () => {
    if (isSwapLocked) return;
    setIsSwapLocked(true);
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = (currentIndex + 1) % tabs.length;
    setActiveTab(tabs[nextIndex]);
  };

  const handlePrevCharacter = () => {
    if (isSwapLocked) return;
    setIsSwapLocked(true);
    onPrev();
  };

  const handleNextCharacter = () => {
    if (isSwapLocked) return;
    setIsSwapLocked(true);
    onNext();
  };

  const currentTabIndex = tabs.indexOf(activeTab);
  const prevTabName = tabLabels[tabs[(currentTabIndex - 1 + tabs.length) % tabs.length]];
  const nextTabName = tabLabels[tabs[(currentTabIndex + 1) % tabs.length]];
  const slideOffset = -(100 / tabs.length) * currentTabIndex;

  const handlePanelOpen = (panelId) => {
    setExpandedPanel(panelId);
  };

  const handlePanelKeyDown = (event, panelId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePanelOpen(panelId);
    }
  };

  const panelTitles = {
    core: 'Core Character Information',
    abilities: 'Ability Scores',
    proficiencies: 'Proficiencies',
    combat: 'Combat Stats',
    attacks: 'Attacks & Weapons',
    equipment: 'Equipment & Wealth',
    features: 'Features & Traits',
    spells: 'Spells & Spellcasting',
    extras: 'Extras & Languages',
    background: 'Background & Description',
    personality: 'Personality & Roleplay',
    notes: 'Notes',
  };

  const renderPanelContent = (panelId, { showHeading = true } = {}) => {
    switch (panelId) {
      case 'core':
        return (
          <>
            {showHeading && <h3>Core Character Information</h3>}
            <div className="detail-pill-row">
              <div className="detail-mini-block">
                <p className="detail-eyebrow">Class & Level</p>
                <p className="detail-line">{displayCharacter.class} — Level {displayCharacter.level} (Hit Die {sheet.core?.hitDie || '—'})</p>
              </div>
              <div className="detail-mini-block">
                <p className="detail-eyebrow">Race</p>
                <p className="detail-line">{displayCharacter.race}</p>
              </div>
              <div className="detail-mini-block">
                <p className="detail-eyebrow">Alignment</p>
                <p className="detail-line">{displayCharacter.alignment}</p>
              </div>
              <div className="detail-mini-block">
                <p className="detail-eyebrow">Background</p>
                <p className="detail-line">{displayCharacter.background}</p>
                {sheet.core?.backgroundFeature && (
                  <p className="detail-line detail-line--muted">{sheet.core.backgroundFeature}</p>
                )}
              </div>
            </div>
            <div className="detail-divider" />
            <p className="detail-eyebrow">Racial Traits</p>
            {renderChips(sheet.core?.raceTraits)}
            <p className="detail-eyebrow" style={{ marginTop: '0.8rem' }}>Class Features</p>
            {renderChips(sheet.core?.classFeatures)}
          </>
        );
      case 'abilities':
        return (
          <>
            {showHeading && <h3>Ability Scores</h3>}
            <p className="detail-line detail-line--muted">{sheet.abilityMethod || 'Manual entry'}</p>
            <div className="stat-grid custom-scrollbar expanded-stat-grid">
              {Object.entries(abilityScores).map(([key, value]) => (
                <div key={key} className="stat-pill">
                  <span className="stat-pill__label">{key.toUpperCase()}</span>
                  <span className="stat-pill__value">{value}</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'proficiencies':
        return (
          <>
            {showHeading && <h3>Proficiencies</h3>}
            <div className="detail-list-grid">
              <div>
                <p className="detail-eyebrow">Saving Throws</p>
                {renderChips(proficiencies.savingThrows)}
              </div>
              <div>
                <p className="detail-eyebrow">Armor & Weapons</p>
                {renderChips(proficiencies.armorWeapons)}
              </div>
              <div>
                <p className="detail-eyebrow">Tools</p>
                {renderChips(proficiencies.tools)}
              </div>
              <div>
                <p className="detail-eyebrow">Skills</p>
                {renderChips(proficiencies.skills || displayCharacter.skills)}
              </div>
              <div>
                <p className="detail-eyebrow">Languages</p>
                {renderChips(proficiencies.languages || sheet.extras?.languages)}
              </div>
            </div>
          </>
        );
      case 'combat':
        return (
          <>
            {showHeading && <h3>Combat Stats</h3>}
            <div className="stat-grid custom-scrollbar">
              {[
                { label: 'Armor Class', value: combat.armorClass ?? displayCharacter.ac },
                { label: 'Initiative', value: combat.initiative || '+0' },
                { label: 'Speed', value: combat.speed || `${displayCharacter.speed} ft` },
                { label: 'Hit Points', value: combat.hitPoints || displayCharacter.hp },
                { label: 'Hit Dice', value: combat.hitDice || '—' },
                { label: 'Passive Perception', value: combat.passivePerception || displayCharacter.passivePerception },
                { label: 'Proficiency', value: combat.proficiencyBonus || `+${displayCharacter.profBonus}` },
              ].map((stat) => (
                <div key={stat.label} className="stat-pill">
                  <span className="stat-pill__label">{stat.label}</span>
                  <span className="stat-pill__value stat-pill__value--tight">{stat.value}</span>
                </div>
              ))}
            </div>
          </>
        );
      case 'attacks':
        if (!sheet.attacks || sheet.attacks.length === 0) {
          return (
            <>
              {showHeading && <h3>Attacks & Weapons</h3>}
              <p className="detail-line">No attacks listed yet.</p>
            </>
          );
        }
        return (
          <>
            {showHeading && <h3>Attacks & Weapons</h3>}
            <div className="detail-attack-list">
              {(sheet.attacks || []).map((attack) => (
                <div key={attack.name} className="attack-row">
                  <div>
                    <p className="detail-line">{attack.name}</p>
                    <p className="detail-line detail-line--muted">{attack.tags?.join(' • ')}</p>
                  </div>
                  <div className="attack-metrics">
                    <span className="detail-chip">{attack.bonus}</span>
                    <span className="detail-chip">{attack.damage}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      case 'equipment':
        return (
          <>
            {showHeading && <h3>Equipment & Wealth</h3>}
            <div className="detail-block">
              {equipmentDetail.starting?.map((item) => (
                <span key={item} className="detail-line">- {item}</span>
              ))}
            </div>
            {equipmentDetail.wealth && (
              <p className="detail-line detail-line--muted" style={{ marginTop: '0.6rem' }}>
                Wealth: {equipmentDetail.wealth}
              </p>
            )}
          </>
        );
      case 'features':
        return (
          <>
            {showHeading && <h3>Features & Traits</h3>}
            <div className="detail-list-grid">
              <div>
                <p className="detail-eyebrow">Class Features</p>
                {renderChips(sheet.features?.classFeatures)}
              </div>
              <div>
                <p className="detail-eyebrow">Racial Traits</p>
                {renderChips(sheet.features?.racialTraits || sheet.core?.raceTraits)}
              </div>
              <div>
                <p className="detail-eyebrow">Background</p>
                {renderChips([sheet.features?.background].filter(Boolean))}
              </div>
              <div>
                <p className="detail-eyebrow">Feats</p>
                {renderChips(sheet.features?.feats)}
              </div>
            </div>
          </>
        );
      case 'spells':
        if (!spellsDetail.ability || spellsDetail.ability === 'None') {
          return (
            <>
              {showHeading && <h3>Spellcasting</h3>}
              <p className="detail-line">This character does not cast spells at level 1.</p>
            </>
          );
        }
        return (
          <>
            {showHeading && <h3>Spellcasting</h3>}
            <div className="detail-pill-row">
              <div className="detail-mini-block">
                <p className="detail-eyebrow">Spellcasting Ability</p>
                <p className="detail-line">{spellsDetail.ability}</p>
              </div>
              <div className="detail-mini-block">
                <p className="detail-eyebrow">Spell Save DC</p>
                <p className="detail-line">{spellsDetail.saveDC}</p>
              </div>
              <div className="detail-mini-block">
                <p className="detail-eyebrow">Spell Attack Bonus</p>
                <p className="detail-line">{spellsDetail.attackBonus}</p>
              </div>
            </div>
            {spellsDetail.slots && (
              <p className="detail-line detail-line--muted">Slots: {spellsDetail.slots}</p>
            )}
            {spellsDetail.prepared && (
              <p className="detail-line detail-line--muted">Prepared/Known: {spellsDetail.prepared}</p>
            )}
            <div className="detail-block" style={{ marginTop: '0.6rem' }}>
              {renderChips(spellsDetail.known || displayCharacter.spells || [])}
            </div>
          </>
        );
      case 'extras':
        return (
          <>
            {showHeading && <h3>Extras & Languages</h3>}
            <div className="detail-mini-block">
              <p className="detail-eyebrow">Languages</p>
              {renderChips(sheet.extras?.languages || proficiencies.languages)}
            </div>
            {sheet.extras?.inventoryWeight && (
              <p className="detail-line detail-line--muted" style={{ marginTop: '0.6rem' }}>
                Inventory Weight: {sheet.extras.inventoryWeight}
              </p>
            )}
            {(sheet.extras?.notes || displayCharacter.notes) && (
              <p className="detail-line" style={{ marginTop: '0.4rem' }}>
                {sheet.extras?.notes || displayCharacter.notes}
              </p>
            )}
          </>
        );
      case 'background':
        return (
          <>
            {showHeading && <h3>Background & Description</h3>}
            {sheet.core?.appearance && (
              <p className="detail-line">{sheet.core.appearance}</p>
            )}
            {sheet.core?.backstory && (
              <p className="detail-line detail-line--muted" style={{ marginTop: '0.5rem' }}>
                {sheet.core.backstory}
              </p>
            )}
            {displayCharacter.lore && (
              <p className="detail-line" style={{ marginTop: '0.8rem' }}>{displayCharacter.lore}</p>
            )}
          </>
        );
      case 'personality':
        return (
          <>
            {showHeading && <h3>Personality & Role-Play</h3>}
            <div className="detail-list-grid">
              <div>
                <p className="detail-eyebrow">Traits</p>
                {renderChips(sheet.personality?.traits)}
              </div>
              <div>
                <p className="detail-eyebrow">Ideals</p>
                {renderChips(sheet.personality?.ideals)}
              </div>
              <div>
                <p className="detail-eyebrow">Bonds</p>
                {renderChips(sheet.personality?.bonds)}
              </div>
              <div>
                <p className="detail-eyebrow">Flaws</p>
                {renderChips(sheet.personality?.flaws)}
              </div>
            </div>
          </>
        );
      case 'notes':
        return (
          <>
            {showHeading && <h3>Notes</h3>}
            <p className="detail-line">{displayCharacter.notes}</p>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`character-detail-overlay custom-scrollbar ${activeTab === 'showcase' ? 'is-showcase' : ''}`}>
      <div className="detail-header">
        <div className="detail-hero">
          <h1 className="detail-name">{displayCharacter.name}</h1>
          <p className="detail-title">{displayCharacter.title}</p>
          <p className="detail-meta">{displayCharacter.race} {displayCharacter.class} - Level {displayCharacter.level}</p>
        </div>
        
        <div className="expanded-toolbar">
          <button type="button" className="back-btn" onClick={onClose}>
            &lt; Back to Character List
          </button>
          
          <div className="detail-nav">
            <button className="detail-nav-btn" onClick={handlePrevCharacter} title={`Previous: ${prevName}`}>
              &lt; <span className="detail-nav-label">{prevName}</span>
            </button>
            <span className="detail-nav-divider">◆</span>
            <button className="detail-nav-btn" onClick={handleNextCharacter} title={`Next: ${nextName}`}>
              <span className="detail-nav-label">{nextName}</span> &gt;
            </button>
          </div>

        </div>
      </div>

      <div
        className="detail-tab-bar"
        role="presentation"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
          '--detail-slide-count': tabs.length
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`detail-tab-bar__segment ${activeTab === tab ? 'is-active' : ''}`}
          >
            <span>{tabLabels[tab]}</span>
          </button>
        ))}
        <div
          className="detail-tab-bar__indicator"
          style={{
            transform: `translateX(${currentTabIndex * 100}%)`,
            width: `${100 / tabs.length}%`
          }}
          aria-hidden="true"
        />
      </div>

      <div className="detail-viewport">
        <div 
          className="detail-track"
          data-state={isContentVisible ? 'visible' : 'fading'}
          data-fade={isContentVisible ? 'in' : 'out'}
          style={{ 
            '--detail-slide-count': tabs.length,
            transform: `translateX(${slideOffset}%) translateY(var(--detail-shift, 0px))` 
          }}
        >
          {/* Slide 1: Details */}
          <div
            className="detail-slide custom-scrollbar"
            role="region"
            aria-label="Character details"
            data-visible={isContentVisible ? 'in' : 'out'}
          >
            <div className="detail-content" tabIndex={0} ref={contentRef} >
              <div className="detail-columns detail-columns--tight">
                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand core information panel"
                  onClick={() => handlePanelOpen('core')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'core')}
                >
                  {renderPanelContent('core')}
                  <span className="detail-card__hint">Click to view</span>
                </div>

                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand ability scores panel"
                  onClick={() => handlePanelOpen('abilities')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'abilities')}
                >
                  {renderPanelContent('abilities')}
                  <span className="detail-card__hint">Click to view</span>
                </div>
              </div>

              <div className="detail-columns detail-columns--tight">
                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand proficiencies panel"
                  onClick={() => handlePanelOpen('proficiencies')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'proficiencies')}
                >
                  {renderPanelContent('proficiencies')}
                  <span className="detail-card__hint">Click to view</span>
                </div>

                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand combat stats panel"
                  onClick={() => handlePanelOpen('combat')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'combat')}
                >
                  {renderPanelContent('combat')}
                  <span className="detail-card__hint">Click to view</span>
                </div>
              </div>

              <div className="detail-columns detail-columns--tight">
                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand attacks panel"
                  onClick={() => handlePanelOpen('attacks')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'attacks')}
                >
                  {renderPanelContent('attacks')}
                  <span className="detail-card__hint">Click to view</span>
                </div>

                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand equipment panel"
                  onClick={() => handlePanelOpen('equipment')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'equipment')}
                >
                  {renderPanelContent('equipment')}
                  <span className="detail-card__hint">Click to view</span>
                </div>
              </div>
              
              <div className="detail-columns detail-columns--tight">
                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand features panel"
                  onClick={() => handlePanelOpen('features')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'features')}
                >
                  {renderPanelContent('features')}
                  <span className="detail-card__hint">Click to view</span>
                </div>

                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand spellcasting panel"
                  onClick={() => handlePanelOpen('spells')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'spells')}
                >
                  {renderPanelContent('spells')}
                  <span className="detail-card__hint">Click to view</span>
                </div>
              </div>
            </div>
          </div>

          {/* Slide 2: Background */}
          <div
            className="detail-slide custom-scrollbar"
            role="region"
            aria-label="Character background and role-play"
            data-visible={isContentVisible ? 'in' : 'out'}
          >
            <div className="detail-content" tabIndex={0} >
              <div
                className="detail-card detail-card--interactive"
                role="button"
                tabIndex={0}
                aria-label="Expand background panel"
                onClick={() => handlePanelOpen('background')}
                onKeyDown={(event) => handlePanelKeyDown(event, 'background')}
              >
                {renderPanelContent('background')}
                <span className="detail-card__hint">Click to view</span>
              </div>

              <div className="detail-columns detail-columns--tight">
                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand personality panel"
                  onClick={() => handlePanelOpen('personality')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'personality')}
                >
                  {renderPanelContent('personality')}
                  <span className="detail-card__hint">Click to view</span>
                </div>

                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand extras panel"
                  onClick={() => handlePanelOpen('extras')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'extras')}
                >
                  {renderPanelContent('extras')}
                  <span className="detail-card__hint">Click to view</span>
                </div>
              </div>

              {displayCharacter.notes && (
                <div
                  className="detail-card detail-card--interactive"
                  role="button"
                  tabIndex={0}
                  aria-label="Expand notes panel"
                  onClick={() => handlePanelOpen('notes')}
                  onKeyDown={(event) => handlePanelKeyDown(event, 'notes')}
                >
                  {renderPanelContent('notes')}
                  <span className="detail-card__hint">Click to view</span>
                </div>
              )}
            </div>
          </div>

          {/* Slide 3: Mana */}
          <div
            className="detail-slide backdrop-slide custom-scrollbar"
            role="region"
            aria-label="Mana view"
            data-visible={isContentVisible ? 'in' : 'out'}
          >
            <div className="detail-content backdrop-content" tabIndex={0}>
              {/* Backdrop info positioned inside the slide */}
              <div className="backdrop-info-area">
                <div className="backdrop-info-wrapper">
                  <button
                    type="button"
                    className="backdrop-info"
                    aria-label="What is this glowing circle?"
                    aria-describedby="backdrop-info-desc"
                    onClick={() => setShowBackdropHint((v) => !v)}
                  >
                    What is this glowing circle?
                  </button>
                  <span id="backdrop-info-desc" className="sr-only">
                    This is the color of your mana, visit the almanac to learn more!
                  </span>
                  {showBackdropHint && (
                    <div className="backdrop-tooltip" role="status" data-animate={shouldAnimateInfo ? 'pulse' : 'rest'}>
                      This is the color of your mana, visit the almanac to learn more!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="detail-carousel-bottom">
          <button type="button" onClick={handlePrevTab} aria-label={`Previous section: ${prevTabName}`}>
            {`< ${prevTabName}`}
          </button>
          <button type="button" onClick={handleNextTab} aria-label={`Next section: ${nextTabName}`}>
            {`${nextTabName} >`}
          </button>
        </div>
      </div>

      {expandedPanel && (
        <div className="detail-modal" role="dialog" aria-modal="true" aria-label={`Expanded view of ${panelTitles[expandedPanel]}`}>
          <div className="detail-modal__backdrop" onClick={() => setExpandedPanel(null)} />
          <div className="detail-modal__body" role="document">
            <header className="detail-modal__header">
              <div>
                <p className="detail-eyebrow">Expanded View</p>
                <h2 className="detail-modal__title">{panelTitles[expandedPanel]}</h2>
              </div>
              <button
                type="button"
                className="detail-modal__close"
                onClick={() => setExpandedPanel(null)}
                aria-label="Close expanded panel"
                ref={modalCloseRef}
              >
                Close
              </button>
            </header>
            <div className="detail-modal__content custom-scrollbar">
              {renderPanelContent(expandedPanel, { showHeading: false })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
