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
  assert.equal(result.source, 'request');
});

test('accepts a Vercel preview callback URL', () => {
  const result = resolveFrontendCallbackUrl({
    requestRedirectTo: 'https://azterra-git-main-nickflixs-projects.vercel.app/auth/callback',
    env: productionEnv,
  });

  assert.equal(result.url, 'https://azterra-git-main-nickflixs-projects.vercel.app/auth/callback');
  assert.equal(result.source, 'request');
});

test('accepts localhost during development', () => {
  const result = resolveFrontendCallbackUrl({
    requestRedirectTo: 'http://localhost:5173/p15/auth/callback',
    env: {
      NODE_ENV: 'development',
      SITE_URL: '',
      FRONTEND_CALLBACK_URL: '',
      FRONTEND_URL: '',
      API_URL: 'http://localhost:3000',
      ALLOWED_ORIGINS: '',
      RENDER: '',
    },
  });

  assert.equal(result.url, 'http://localhost:5173/p15/auth/callback');
  assert.equal(result.source, 'request');
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

test('falls back to FRONTEND_CALLBACK_URL when request input is absent', () => {
  const result = resolveFrontendCallbackUrl({
    env: {
      ...productionEnv,
      FRONTEND_CALLBACK_URL: 'https://azterra-roan.vercel.app/auth/callback',
      SITE_URL: 'https://wrong.example.com',
    },
  });

  assert.equal(result.url, 'https://azterra-roan.vercel.app/auth/callback');
  assert.equal(result.source, 'FRONTEND_CALLBACK_URL');
});
