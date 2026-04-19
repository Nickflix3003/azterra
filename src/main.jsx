import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
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
            <ContentProvider>
              <App />
              {/* Global toast notifications — rendered outside the router so they
                  always appear regardless of which page is active. */}
              <ToastContainer />
            </ContentProvider>
          </RegionDataProvider>
        </LocationDataProvider>
      </MapEffectsProvider>
    </AuthProvider>
  </ToastProvider>
);
