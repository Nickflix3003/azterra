import React, { useEffect, useRef } from 'react';
import './LoadingScreen.css';
import RadiantSunShader from '../visuals/RadiantSunShader';

function renderTitleLetters(title = '') {
    return title.split('').map((character, index) => (
        <span
            key={`${character}-${index}`}
            className={`loading-screen__title-letter ${character === ' ' ? 'loading-screen__title-letter--space' : ''}`}
        >
            {character === ' ' ? '\u00A0' : character}
        </span>
    ));
}

export default function LoadingScreen({
    progress = 0,
    status = 'Loading...',
    title = 'AZTERRA',
    subtitle = 'Realm of Legends',
    quote = '"The ancient maps whisper secrets of forgotten realms..."',
}) {
    const particlesRef = useRef(null);
    const isComplete = progress >= 100;

    useEffect(() => {
        if (!particlesRef.current) return;

        // Create floating particles
        const particleCount = 30;
        const particles = [];

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';

            const size = Math.random() * 3 + 1.5;
            const startX = Math.random() * 100;
            const startY = Math.random() * 100;
            const duration = Math.random() * 25 + 20;
            const delay = Math.random() * 5;
            const opacity = Math.random() * 0.4 + 0.1;

            particle.style.cssText = `
        left: ${startX}%;
        top: ${startY}%;
        width: ${size}px;
        height: ${size}px;
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
        opacity: ${opacity};
      `;

            particlesRef.current.appendChild(particle);
            particles.push(particle);
        }

        return () => {
            particles.forEach(p => p.remove());
        };
    }, []);

    // Ancient runes and symbols for the outer ring
    const outerSymbols = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ'];

    // Geometric symbols for middle ring
    const middleSymbols = ['◈', '◆', '◇', '◉', '◊', '⬡', '⬢', '⬣', '⬟', '⬠', '⬝', '⬞', '◬', '◭', '◮', '◯'];

    // Mystical marks for inner ring
    const innerSymbols = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✻', '✼', '✽', '✾', '✿'];

    return (
        <div className="loading-screen">
            {/* Animated background */}
            <div className="loading-screen__background">
                <div className="loading-screen__gradient"></div>
                <div className="loading-screen__vignette"></div>

                {/* Corner decorations */}
                <div className="loading-screen__corner loading-screen__corner--tl"></div>
                <div className="loading-screen__corner loading-screen__corner--tr"></div>
                <div className="loading-screen__corner loading-screen__corner--bl"></div>
                <div className="loading-screen__corner loading-screen__corner--br"></div>
            </div>

            {/* Floating particles */}
            <div className="loading-screen__particles" ref={particlesRef}></div>

            {/* Radiant Sun Shader - Full Screen */}
            <div className={`loading-screen__shader-container ${isComplete ? 'is-complete' : ''}`}>
                <RadiantSunShader
                    key="centered-sun"
                    intensity={isComplete ? 1.0 : 0.4}
                    centerOffset={[0, 0.1]} // Shift UP by 10% of min dimension
                />
            </div>


            {/* Main content */}
            <div className="loading-screen__content">
                {/* Multi-layered runic ring */}
                <div className={`loading-screen__ring-container ${isComplete ? 'loading-screen__ring-container--complete' : ''}`}>






                    {/* Outer ring with runes - rotates slowly */}
                    <div className="loading-screen__runic-ring loading-screen__runic-ring--outer">
                        {/* Radiating lines */}
                        {[...Array(48)].map((_, i) => (
                            <div
                                key={`line-${i}`}
                                className="loading-screen__radial-line"
                                style={{ '--angle': `${(i / 48) * 360}deg`, '--length': `${Math.random() * 30 + 20}px` }}
                            />
                        ))}

                        {/* Outer runes */}
                        {outerSymbols.map((symbol, index) => (
                            <div
                                key={`outer-${index}`}
                                className="loading-screen__rune loading-screen__rune--outer"
                                style={{
                                    '--angle': `${(index / outerSymbols.length) * 360}deg`,
                                    '--delay': `${index * 0.05}s`
                                }}
                            >
                                {symbol}
                            </div>
                        ))}
                    </div>

                    {/* Middle ring with geometric symbols - rotates opposite direction */}
                    <div className="loading-screen__runic-ring loading-screen__runic-ring--middle">
                        {middleSymbols.map((symbol, index) => (
                            <div
                                key={`middle-${index}`}
                                className="loading-screen__rune loading-screen__rune--middle"
                                style={{
                                    '--angle': `${(index / middleSymbols.length) * 360}deg`,
                                    '--delay': `${index * 0.08}s`
                                }}
                            >
                                {symbol}
                            </div>
                        ))}
                    </div>

                    {/* Inner ring with mystical marks - rotates slowly */}
                    <div className="loading-screen__runic-ring loading-screen__runic-ring--inner">
                        {innerSymbols.map((symbol, index) => (
                            <div
                                key={`inner-${index}`}
                                className="loading-screen__rune loading-screen__rune--inner"
                                style={{
                                    '--angle': `${(index / innerSymbols.length) * 360}deg`,
                                    '--delay': `${index * 0.1}s`
                                }}
                            >
                                {symbol}
                            </div>
                        ))}
                    </div>

                    {/* Centered title */}
                    <div className="loading-screen__title-container">
                        <h1 className="loading-screen__title">
                            {renderTitleLetters(title)}
                        </h1>
                        <div className="loading-screen__title-underline"></div>
                        <p className="loading-screen__subtitle">{subtitle}</p>
                    </div>

                </div>

                {/* Progress section */}
                <div className="loading-screen__progress-section">
                    <div className="loading-screen__progress-wrapper">
                        <div className="loading-screen__progress-track">
                            <div
                                className="loading-screen__progress-fill"
                                style={{ width: `${Math.min(progress, 100)}%` }}
                            >
                                <div className="loading-screen__progress-shine"></div>
                            </div>

                            {/* Progress segments */}
                            <div className="loading-screen__progress-segments">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className="loading-screen__segment"></div>
                                ))}
                            </div>
                        </div>

                        <div className="loading-screen__progress-info">
                            <span className="loading-screen__status">{status}</span>
                            <span className="loading-screen__percentage">{Math.floor(progress)}%</span>
                        </div>
                    </div>
                </div>

                {/* Flavor text */}
                <div className="loading-screen__footer">
                    <p className="loading-screen__quote">
                        {quote}
                    </p>
                </div>
            </div>
        </div>
    );
}
