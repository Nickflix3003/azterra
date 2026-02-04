import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import LoadingScreen from './UI/LoadingScreen';

// ============================================================================
// LOADING DIAGNOSTICS - Set to true to see timing info in console
// ============================================================================
const LOADING_DEBUG = true;

/**
 * Controller component that manages the loading simulation and transitions
 * Replaces the static "Welcome to Azterra" overlay with the dynamic LoadingScreen
 * 
 * Uses React Portal to render at the document root, ensuring it covers the sidebar/header.
 */
export default function IntroLoadingScreen({ onFinish, isReady = true, manualProgress = null }) {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Initializing Realm...');
    const [isFadingOut, setIsFadingOut] = useState(false);

    const startTimeRef = useRef(null);
    const completedRef = useRef(false);
    const completionSourceRef = useRef(null); // Track what triggered completion
    // Store manualProgress in a ref so the animation loop always has current value
    const manualProgressRef = useRef(manualProgress);

    // Initialize start time on mount
    useEffect(() => {
        startTimeRef.current = performance.now();
        if (LOADING_DEBUG) {
            console.log('[LoadingScreen] Mounted, timer started');
        }
    }, []);

    // Keep the ref in sync with the prop
    useEffect(() => {
        manualProgressRef.current = manualProgress;
        if (LOADING_DEBUG && manualProgress !== null) {
            const elapsed = ((performance.now() - startTimeRef.current) / 1000).toFixed(2);
            console.log(`[LoadingScreen] Progress update: ${manualProgress}% at ${elapsed}s`);
        }
    }, [manualProgress]);

    // Handle completion
    const handleLoadComplete = useCallback((source = 'unknown') => {
        if (completedRef.current) return;
        completedRef.current = true;
        completionSourceRef.current = source;

        const elapsed = ((performance.now() - startTimeRef.current) / 1000).toFixed(2);
        
        if (LOADING_DEBUG) {
            console.log(`[LoadingScreen] ✅ COMPLETED via "${source}" at ${elapsed}s`);
            console.log(`[LoadingScreen] Final progress was: ${manualProgressRef.current}%`);
            if (source === 'failsafe') {
                console.warn('[LoadingScreen] ⚠️ FAILSAFE was triggered - conditions not met in time!');
            }
        }

        setProgress(100);
        setStatus('Realm Ready');

        // Brief moment to show completion, then fade out
        setTimeout(() => {
            setIsFadingOut(true);
            setTimeout(() => {
                if (onFinish) onFinish();
            }, 800); // Match CSS transition time
        }, 600); // Reduced from 1800ms - just enough to see "Realm Ready"
    }, [onFinish]);

    // Effect for manual progress mode (real loading)
    useEffect(() => {
        if (manualProgress === null) return;
        if (completedRef.current) return;

        // Update displayed progress and status
        setProgress(manualProgress);

        if (manualProgress < 30) setStatus('Aligning Ley Lines...');
        else if (manualProgress < 60) setStatus('Summoning Terrain...');
        else if (manualProgress < 90) setStatus('Awakening Ancient Runes...');
        else if (manualProgress < 100) setStatus('Finalizing Controls...');

        // Check if complete
        if (manualProgress >= 100) {
            handleLoadComplete('manualProgress=100');
        }
    }, [manualProgress, handleLoadComplete]);

    // Failsafe timeout - only used when in manual mode
    useEffect(() => {
        if (manualProgress === null) return;
        if (completedRef.current) return;

        const FAILSAFE_DURATION = 3000; // 3 seconds max - map should load in ~1s
        const timeoutId = setTimeout(() => {
            if (!completedRef.current) {
                handleLoadComplete('failsafe');
            }
        }, FAILSAFE_DURATION);

        return () => clearTimeout(timeoutId);
    }, [manualProgress, handleLoadComplete]);

    // Effect for simulated mode (legacy/fallback)
    useEffect(() => {
        if (manualProgress !== null) return; // Skip if using manual mode
        if (completedRef.current) return;
        if (!startTimeRef.current) startTimeRef.current = performance.now();

        const DURATION = 2500; // Faster simulated duration
        let frameId;

        const animate = (currentTime) => {
            if (completedRef.current) return;

            const elapsed = currentTime - startTimeRef.current;

            // Calculate progress with easing
            const rawProgress = Math.min((elapsed / DURATION) * 100, 100);
            const easedProgress = 100 * (1 - Math.pow(1 - rawProgress / 100, 2));

            setProgress(easedProgress);

            // Update status
            if (easedProgress < 30) setStatus('Aligning Ley Lines...');
            else if (easedProgress < 60) setStatus('Summoning Terrain...');
            else if (easedProgress < 85) setStatus('Awakening Ancient Runes...');
            else setStatus('Finalizing Controls...');

            // Complete when ready and progress is high enough, or when fully done
            if ((isReady && easedProgress >= 90) || easedProgress >= 100) {
                handleLoadComplete('simulated');
                return;
            }

            frameId = requestAnimationFrame(animate);
        };

        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, [isReady, manualProgress, handleLoadComplete]);

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
