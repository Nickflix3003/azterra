import React, { useState, useEffect } from 'react';
import LoadingScreen from '../UI/LoadingScreen';

export default function LoadingScreenDemo() {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Initializing...');

    useEffect(() => {
        const statuses = [
            'Initializing...',
            'Loading map tiles...',
            'Fetching locations...',
            'Loading regions...',
            'Preparing effects...',
            'Almost ready...',
        ];

        let currentProgress = 0;
        let statusIndex = 0;

        const interval = setInterval(() => {
            currentProgress += Math.random() * 15;

            if (currentProgress >= 100) {
                currentProgress = 100;
                setStatus('Complete!');
                clearInterval(interval);
            } else {
                statusIndex = Math.floor((currentProgress / 100) * statuses.length);
                setStatus(statuses[Math.min(statusIndex, statuses.length - 1)]);
            }

            setProgress(currentProgress);
        }, 500);

        return () => clearInterval(interval);
    }, []);

    return <LoadingScreen progress={progress} status={status} />;
}
