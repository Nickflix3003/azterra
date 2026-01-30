import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import LoadingScreen from './UI/LoadingScreen';

/**
 * Controller component that managing the loading simulation and transitions
 * Replaces the static "Welcome to Azterra" overlay with the dynamic LoadingScreen
 * 
 * Uses React Portal to render at the document root, ensuring it covers the sidebar/header.
 */
export default function IntroLoadingScreen({ onFinish, isReady = true, manualProgress = null }) {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Initializing Realm...');
    const [isFadingOut, setIsFadingOut] = useState(false);

    // UseRef to persist start time even if props change (isReady)
    const startTimeRef = useRef(null);
    const completedRef = useRef(false);

    // Effect for handling progress updates
    useEffect(() => {
        const handleLoadComplete = () => {
            if (completedRef.current) return;
            completedRef.current = true;

            setProgress(100);
            setStatus('Realm Ready');

            // Allow the completion effect (shader burst) to shine for a moment
            setTimeout(() => {
                handleCompleteAndDisconnect();
            }, 1800);
        };

        // CASE 1: Manual/Real Progress Mode
        if (manualProgress !== null) {
            if (!startTimeRef.current) startTimeRef.current = performance.now();

            let frameId;
            const animateManual = () => {
                if (completedRef.current) return;

                const elapsed = performance.now() - startTimeRef.current;
                const FAILSAFE_DURATION = 7000;

                // Force finish if timeout reached
                if (elapsed > FAILSAFE_DURATION) {
                    handleLoadComplete();
                    return;
                }

                setProgress(manualProgress);

                // Update Status based on Real Progress
                if (manualProgress < 30) setStatus('Aligning Ley Lines...');
                else if (manualProgress < 60) setStatus('Summoning Terrain...');
                else if (manualProgress < 90) setStatus('Awakening Ancient Runes...');
                else if (manualProgress < 100) {
                    if (elapsed > 4000) setStatus('Waiting for Map Engine...');
                    else setStatus('Finalizing Controls...');
                }

                if (manualProgress >= 100) {
                    handleLoadComplete();
                } else {
                    // Keep checking time
                    frameId = requestAnimationFrame(animateManual);
                }
            };

            frameId = requestAnimationFrame(animateManual);
            return () => cancelAnimationFrame(frameId);
        }


        // CASE 2: Simulated Mode (Legacy behavior)
        if (!startTimeRef.current) startTimeRef.current = performance.now();

        const DURATION = 3500; // Simulated duration
        const FAILSAFE_DURATION = 7000; // Max wait time if map is slow/broken
        let frameId;

        const animate = (currentTime) => {
            if (completedRef.current) return;

            const elapsed = currentTime - startTimeRef.current;

            // Should we force finish? (Map is ready OR Failsafe timeout reached)
            const shouldFinish = isReady || (elapsed > FAILSAFE_DURATION);

            // Calculate simulated progress up to 90%
            const rawProgress = Math.min((elapsed / DURATION) * 90, 90);

            // Non-linear easing for more realistic feel
            const easedProgress = 90 * (1 - Math.pow(1 - rawProgress / 90, 3));

            // Only advance if completed
            if (shouldFinish && (rawProgress >= 89 || elapsed > DURATION)) {
                handleLoadComplete();
                return;
            }

            setProgress(shouldFinish ? Math.max(easedProgress, 99) : easedProgress);

            // Update status text based on progress
            if (easedProgress < 30) setStatus('Aligning Ley Lines...');
            else if (easedProgress < 60) setStatus('Summoning Terrain...');
            else if (easedProgress < 85) setStatus('Awakening Ancient Runes...');
            else if (shouldFinish) setStatus('Finalizing Controls...');
            else setStatus('Waiting for Map Engine...'); // Hint to user we are waiting

            frameId = requestAnimationFrame(animate);
        };

        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, [isReady, manualProgress]); // Re-run check when isReady changes, but use ref for time


    const handleCompleteAndDisconnect = () => {
        setIsFadingOut(true);
        // Wait for fade out animation to finish before unmounting
        setTimeout(() => {
            if (onFinish) onFinish();
        }, 1000); // Match CSS transition time
    };

    // Render via Portal to cover the entire app (Sidebar included)
    return ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999, // Super high z-index
                opacity: isFadingOut ? 0 : 1,
                transition: 'opacity 1s ease-in-out',
                pointerEvents: isFadingOut ? 'none' : 'auto'
            }}
        >
            <LoadingScreen progress={progress} status={status} />
        </div>,
        document.body
    );
}
