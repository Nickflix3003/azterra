import test from 'node:test';
import assert from 'node:assert/strict';

import { AuthRedirectError, resolveFrontendCallbackUrl } from './authRedirect.js';

const productionEnv = {
  NODE_ENV: 'production',
  SITE_URL: 'https://azterra-roan.vercel.app',
  FRONTEND_CALLBACK_URL: '',
  FRONTEND_URL: '',
  API_URL: 'https://azterra-api.onrender.com',
  ALLOWED_ORIGINS: 'https://azterra-roan.vercel.app',
  RENDER: 'true',
};

test('accepts the live Vercel callback URL', () => {
  const result = resolveFrontendCallbackUrl({
    requestRedirectTo: 'https://azterra-roan.vercel.app/auth/callback',
    env: productionEnv,
  });

  assert.equal(result.url, 'https://azterra-roan.vercel.app/auth/callback');
});

test('accepts a Vercel preview callback URL', () => {
  const result = resolveFrontendCallbackUrl({
    requestRedirectTo: 'https://azterra-git-main-nickflixs-projects.vercel.app/auth/callback',
    env: productionEnv,
  });

  assert.equal(result.url, 'https://azterra-git-main-nickflixs-projects.vercel.app/auth/callback');
});

test('rejects callback URLs that point to the API origin', () => {
  assert.throws(
    () =>
      resolveFrontendCallbackUrl({
        requestRedirectTo: 'https://azterra-api.onrender.com/auth/callback',
        env: productionEnv,
      }),
    (error) =>
      error instanceof AuthRedirectError &&
      error.message === 'Auth redirect URL cannot point to the API host.'
  );
});

test('rejects callback URLs that use an /api path', () => {
  assert.throws(
    () =>
      resolveFrontendCallbackUrl({
        requestRedirectTo: 'https://azterra-roan.vercel.app/api/auth/callback',
        env: productionEnv,
      }),
    (error) =>
      error instanceof AuthRedirectError &&
      error.message === 'Auth redirect URL cannot use an /api callback path.'
  );
});
