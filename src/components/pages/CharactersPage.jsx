import React, { useRef, useEffect, useState, useCallback } from 'react';
import staticCharacters from '../../data/characters_heroes';
import '../UI/PageUI.css';
import ShaderBackgroundDualCrossfade from '../visuals/ShaderBackgroundDualCrossfade';
import CardShader from '../visuals/CardShader';
import CharacterCard from '../cards/CharacterCard';
import CharacterDetailView from './CharacterDetailView';

// Merge live server data (editable fields) over static data (colors + sheets).
// Falls back to static-only if the API is unavailable.
function mergeHeroes(staticList, liveList) {
  if (!liveList || liveList.length === 0) return staticList;
  return staticList.map((s) => {
    const live = liveList.find((l) => l.id === s.id);
    if (!live) return s;
    // Live wins for all editable text fields; static keeps color + sheet
    return {
      ...s,
      name:           live.name           ?? s.name,
      title:          live.title          ?? s.title,
      player:         live.player         ?? s.player,
      race:           live.race           ?? s.race,
      class:          live.class          ?? s.class,
      subclass:       live.subclass       ?? s.subclass,
      alignment:      live.alignment      ?? s.alignment,
      level:          live.level          ?? s.level,
      hp:             live.hp             ?? s.hp,
      ac:             live.ac             ?? s.ac,
      speed:          live.speed          ?? s.speed,
      notes:          live.notes          ?? s.notes,
      lore:           live.lore           ?? s.lore,
      profilePicture: live.profilePicture ?? s.profilePicture,
    };
  });
}

// Card class for carousel
const getCardClass = (index, activeIndex, total) => {
  if (index === activeIndex) return 'card card-active';

  // Calculate circular indices
  const prevIndex = (activeIndex - 1 + total) % total;
  const nextIndex = (activeIndex + 1) % total;

  if (index === prevIndex) return 'card card-left';
  if (index === nextIndex) return 'card card-right';

  return 'card card-hidden';
};

export default function CharactersPage() {
  const [characters, setCharacters] = useState(staticCharacters);

  // Load live server data and merge with static
  useEffect(() => {
    fetch('/api/heroes', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.heroes) {
          setCharacters(mergeHeroes(staticCharacters, data.heroes));
        }
      })
      .catch(() => { /* silently keep static data */ });
  }, []);

  const [currentColor, setCurrentColor] = useState(staticCharacters[0].color);
  const [targetColor, setTargetColor] = useState(staticCharacters[0].color);
  const [fade, setFade] = useState(0);
  const animationRef = useRef();

  const [expandedIndex, setExpandedIndex] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isExpanded = expandedIndex !== null;
  const expandedCharacter = isExpanded ? characters[expandedIndex] : null;

  // Utility to start fade to new color, always from visual color AT THAT MOMENT
  function startColorFade(newColor) {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    // Interpolate from actual visible color if in progress
    let start;
    if (fade > 0 && fade < 1) {
      start = [
        currentColor[0] + (targetColor[0] - currentColor[0]) * fade,
        currentColor[1] + (targetColor[1] - currentColor[1]) * fade,
        currentColor[2] + (targetColor[2] - currentColor[2]) * fade,
        currentColor[3] + (targetColor[3] - currentColor[3]) * fade,
      ];
    } else {
      start = targetColor;
    }
    setCurrentColor(start);
    setTargetColor(newColor);
    setFade(0);

    let t0 = performance.now();
    function stepFade(now) {
      let f = Math.min(1, (now - t0) / 800); // 800ms fade
      setFade(f);
      if (f < 1) {
        animationRef.current = requestAnimationFrame(stepFade);
      } else {
        setCurrentColor(newColor);
        setFade(0);
        animationRef.current = null;
      }
    }
    animationRef.current = requestAnimationFrame(stepFade);
  }

  // Update target color on activeIndex change
  useEffect(() => {
    startColorFade(characters[activeIndex].color);
  }, [activeIndex]);

  // Navigation handlers use callback to ensure correct activeIndex
  const goPrev = useCallback(() => {
    setActiveIndex(prev => (prev - 1 + characters.length) % characters.length);
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex(prev => (prev + 1) % characters.length);
  }, []);

  const handleCardClick = useCallback((index) => {
    setActiveIndex(index);
    if (index === activeIndex) {
      setExpandedIndex(index);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeIndex]);

  const handleBackToCarousel = useCallback(() => {
    setExpandedIndex(null);
  }, []);

  return (
    <div className={`characters-page custom-scrollbar ${isExpanded ? 'is-expanded' : ''}`}>
      <ShaderBackgroundDualCrossfade
        modA={currentColor}
        modB={targetColor}
        fade={fade}
      />

      <>
          <div className={`carousel-section ${isExpanded ? 'fade-out' : ''}`}>
             <h1 className="page-title">Stars of Azterra</h1>
             <div className="characters-wrapper">
               <p className="nav-hint">Use the on-screen controls to view our Heroes</p>
               <div className="carousel-controls">
                 <button
                   className="arrow-btn arrow-left"
                   onClick={goPrev}
                   aria-label="Previous character"
                   disabled={isExpanded}
                 >
                   ‹
                 </button>
                 <div className="carousel-frame" role="region" aria-live="polite">
                   <div className="sun-overlay" aria-hidden="true" />
                   <div className="carousel-track">
                     {characters.map((char, index) => {
                       const isActive = index === activeIndex;
                       return (
                         <div
                           key={char.id}
                           className={getCardClass(index, activeIndex, characters.length)}
                           onClick={() => handleCardClick(index)}
                         >
                           {isActive && (
                             <CardShader
                               modA={currentColor}
                               modB={targetColor}
                               fade={fade}
                             />
                           )}
                           <CharacterCard character={char} />
                         </div>
                       );
                     })}
                   </div>
                 </div>
                 <button
                   className="arrow-btn arrow-right"
                   onClick={goNext}
                   aria-label="Next character"
                   disabled={isExpanded}
                 >
                   ›
                 </button>
               </div>
             </div>
          </div>

          {isExpanded && (
            <CharacterDetailView 
              character={expandedCharacter} 
              onClose={handleBackToCarousel}
              onNext={() => {
                goNext();
                setExpandedIndex((prev) => (prev + 1) % characters.length);
              }}
              onPrev={() => {
                goPrev();
                setExpandedIndex((prev) => (prev - 1 + characters.length) % characters.length);
              }}
              nextName={characters[(expandedIndex + 1) % characters.length].name}
              prevName={characters[(expandedIndex - 1 + characters.length) % characters.length].name}
            />
          )}
        </>
      </div>
  );
}
