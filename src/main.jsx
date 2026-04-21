import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { LabelDataProvider } from './context/LabelDataContext';
import { MapEffectsProvider } from './context/MapEffectsContext';
import { LocationDataProvider } from './context/LocationDataContext';
import { RegionDataProvider } from './context/RegionDataContext';
import { ContentProvider } from './context/ContentContext';
import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/UI/ToastContainer';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <AuthProvider>
      <MapEffectsProvider>
        <LocationDataProvider>
          <RegionDataProvider>
            <LabelDataProvider>
              <ContentProvider>
                <App />
                {/* Global toast notifications render outside the router so they
                    always appear regardless of which page is active. */}
                <ToastContainer />
              </ContentProvider>
            </LabelDataProvider>
          </RegionDataProvider>
        </LocationDataProvider>
      </MapEffectsProvider>
    </AuthProvider>
  </ToastProvider>
);
