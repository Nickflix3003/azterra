import adminRoutes from '../admin.js';
import authRoutes from '../auth.js';
import campaignsRoutes from '../campaigns.js';
import heroesRoutes from '../heroes.js';
import charactersRoutes from '../characters.js';
import contentRoutes from '../content.js';
import entitiesRoutes from '../entities.js';
import filesRoutes from '../files.js';
import locationsRoutes from '../locations.js';
import mapLabelsRoutes from '../mapLabels.js';
import portraitsRoutes from '../portraits.js';
import regionsRoutes from '../regions.js';
import secretsRoutes from '../secrets.js';
import usersRoutes from '../users.js';
import viewRoutes from '../view.js';

const routes = [
  { path: '/api/auth', router: authRoutes },
  { path: '/api/admin', router: adminRoutes },
  { path: '/api/locations', router: locationsRoutes },
  { path: '/api/map-labels', router: mapLabelsRoutes },
  { path: '/api/regions', router: regionsRoutes },
  { path: '/api/secrets', router: secretsRoutes },
  { path: '/api/characters', router: charactersRoutes },
  { path: '/api/files', router: filesRoutes },
  { path: '/api/view', router: viewRoutes },
  { path: '/api/entities', router: entitiesRoutes },
  { path: '/api/content', router: contentRoutes },
  { path: '/api/portraits', router: portraitsRoutes },
  { path: '/api/users', router: usersRoutes },
  { path: '/api/campaigns', router: campaignsRoutes },
  { path: '/api/heroes',    router: heroesRoutes    },
];

export function registerRoutes(app) {
  routes.forEach(({ path, router }) => {
    app.use(path, router);
  });
}
