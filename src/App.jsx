import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import MapPage from './components/pages/MapPage';
import AlmanacPage from './components/pages/AlmanacPage';
import CharactersPage from './components/pages/CharactersPage';
import WorldRaces from './components/pages/WorldRaces';
import AdminDashboard from './components/pages/AdminDashboard';
import LocationsAtlasPage from './components/pages/LocationsAtlasPage';
import LocationsEditorPage from './components/pages/LocationsEditorPage';
import AccountSettingsPage from './components/pages/AccountSettingsPage';
import SecretsPage from './components/pages/SecretsPage';
import LorePlaceholderPage from './components/pages/lore/LorePlaceholderPage';
import PlayersPage from './components/pages/PlayersPage';
import PlayerPublicPage from './components/pages/PlayerPublicPage';
import DashboardPage from './components/pages/DashboardPage';
import AboutPage from './components/pages/AboutPage';
import PeoplePage from './components/pages/ViewingPage';
import AdminEntitiesPage from './components/pages/AdminEntitiesPage';
import RegionDetailPage from './components/pages/RegionDetailPage';
import LocationDetailPage from './components/pages/LocationDetailPage';
import LoginPage from './components/pages/LoginPage';
import SignupPage from './components/pages/SignupPage';
import Header from './components/UI/Header';
import PageLayout from './components/UI/PageLayout';
import './components/UI/PageUI.css';
import AuthCallback from './components/auth/AuthCallback';
import AuthLandingPage from './components/pages/AuthLandingPage';
import CharacterSheetPage from './components/pages/CharacterSheetPage';
import CampaignIndexPage from './components/pages/CampaignIndexPage';
import CampaignWorkspacePage from './components/pages/CampaignWorkspacePage';
import MagicHubPage from './components/pages/MagicHubPage';
import MagicSystemPage from './components/pages/MagicSystemPage';
import LoadingScreenDemo from './components/pages/LoadingScreenDemo';
import ServerWarmingBanner from './components/UI/ServerWarmingBanner';

/** Normalize pathname for comparison (no trailing slash except root). */
function normalizePathname(pathname) {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

/**
 * True when the browser hit the OAuth return URL on the real path (not hash).
 * Tolerates trailing slashes and Vite `base` (e.g. /p15).
 */
function isAuthCallbackPath(pathname, baseUrl) {
  const rawBase = (baseUrl || '/').replace(/\/$/, '');
  const base = rawBase === '/' ? '' : rawBase;
  const expected = normalizePathname(`${base}/auth/callback`);
  return normalizePathname(pathname) === expected;
}

function HashApp() {
  return (
    <HashRouter>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <Header />
        <ServerWarmingBanner />
        <main id="main-content" className="app-content" role="main">
          <Routes>
            {/* 1. Map (Default Home) */}
            <Route path="/" element={<MapPage />} />
            <Route path="/map" element={<Navigate to="/" replace />} />

            {/* About */}
            <Route path="/about" element={<AboutPage />} />

            {/* 2. CAMPAIGN (User's campaigns and characters) */}
            <Route path="/campaign" element={<CampaignIndexPage />} />
            <Route path="/campaign/:id" element={<CampaignWorkspacePage />} />

            {/* Character Sheet */}
            <Route path="/character-sheet" element={<CharacterSheetPage />} />

            {/* 3. ATLAS (Promoted to its own top-level view) */}
            <Route path="/atlas" element={<PageLayout title="World Atlas" tabs={[
              { to: "", label: "View Map", end: true },
              { to: "editor", label: "Map Editor" },
            ]} />}>
              <Route index element={<LocationsAtlasPage />} />
              <Route path="editor" element={<LocationsEditorPage />} />
            </Route>

            {/* 4. COMPENDIUM (The Big Merge) */}
            {/* We merge People, Magic, and Almanac here to clean up the Sidebar */}
            <Route path="/compendium" element={<PageLayout title="Azterra Compendium" renderBottomTabs tabs={[
              { to: "", label: "Almanac", end: true },
              { to: "societies", label: "Societies" },
              { to: "heroes", label: "Heroes" },
            ]} />}>
              <Route index element={<AlmanacPage />} />
              <Route path="societies" element={<WorldRaces />} />
              <Route path="heroes" element={<CharactersPage />} />
            </Route>

            {/* Magic Systems */}
            <Route path="/magic" element={<MagicHubPage />} />
            <Route path="/magic/:id" element={<MagicSystemPage />} />

            {/* Secrets */}
            <Route path="/secrets" element={<SecretsPage />} />
            <Route path="/progress" element={<Navigate to="/secrets" replace />} />

            {/* Hidden Lore (PLACEHOLDER) */}
            <Route path="/lore/aurora-ember" element={<LorePlaceholderPage secretId="aurora-ember" />} />
            <Route path="/lore/silent-archive" element={<LorePlaceholderPage secretId="silent-archive" />} />
            <Route path="/lore/gilded-horizon" element={<LorePlaceholderPage secretId="gilded-horizon" />} />

            {/* Account & Auth */}
            <Route path="/account" element={<AccountSettingsPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/auth/callback" element={<AuthLandingPage />} />

            {/* Players */}
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/players/:id" element={<PlayerPublicPage />} />

            {/* People (formerly Viewing) */}
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/viewing" element={<Navigate to="/people" replace />} />

            {/* Admin Entities */}
            <Route path="/admin/entities" element={<AdminEntitiesPage />} />

            {/* Detail pages */}
            <Route path="/region/:id" element={<RegionDetailPage />} />
            <Route path="/location/:id" element={<LocationDetailPage />} />

            {/* Admin */}
            <Route path="/admin" element={<AdminDashboard />} />

            {/* Loading Screen Demo */}
            <Route path="/loading-demo" element={<LoadingScreenDemo />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}

function App() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';
  const basenameForRouter = base === '/' ? '/' : base;
  const isAuthCallback =
    typeof window !== 'undefined' && isAuthCallbackPath(window.location.pathname, import.meta.env.BASE_URL);

  if (isAuthCallback) {
    return (
      <BrowserRouter basename={basenameForRouter}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return <HashApp />;
}
export default App;
