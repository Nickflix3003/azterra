class AuthRedirectError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AuthRedirectError';
    this.details = details;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseAbsoluteHttpUrl(rawValue) {
  if (!isNonEmptyString(rawValue)) {
    throw new AuthRedirectError('Auth redirect URL is required.', { code: 'missing_redirect' });
  }

  let url;
  try {
    url = new URL(rawValue.trim());
  } catch {
    throw new AuthRedirectError('Auth redirect URL must be an absolute URL.', {
      code: 'invalid_url',
      value: rawValue,
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AuthRedirectError('Auth redirect URL must use http or https.', {
      code: 'invalid_protocol',
      value: rawValue,
    });
  }

  return url;
}

function normalizeOrigin(rawValue) {
  if (!isNonEmptyString(rawValue)) return null;
  try {
    return new URL(rawValue.trim()).origin;
  } catch {
    return null;
  }
}

function buildCallbackFromSiteUrl(siteUrl) {
  const base = parseAbsoluteHttpUrl(siteUrl);
  const withTrailingSlash = base.href.endsWith('/') ? base.href : `${base.href}/`;
  return new URL('auth/callback', withTrailingSlash).href;
}

function getConfiguredFrontendHosts(env) {
  return [env.FRONTEND_CALLBACK_URL, env.SITE_URL, env.FRONTEND_URL]
    .map((value) => {
      try {
        return value ? new URL(value).hostname : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function isLocalhost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isProductionEnvironment(env) {
  return (
    env.NODE_ENV === 'production' ||
    env.RENDER === 'true' ||
    Boolean(env.ALLOWED_ORIGINS)
  );
}

function validateCallbackUrl(url, env) {
  const apiOrigin = normalizeOrigin(env.API_URL);
  if (apiOrigin && url.origin === apiOrigin) {
    throw new AuthRedirectError('Auth redirect URL cannot point to the API host.', {
      code: 'api_origin_not_allowed',
      value: url.href,
    });
  }

  if (url.pathname.startsWith('/api/')) {
    throw new AuthRedirectError('Auth redirect URL cannot use an /api callback path.', {
      code: 'api_path_not_allowed',
      value: url.href,
    });
  }

  const hostname = url.hostname;
  const configuredHosts = getConfiguredFrontendHosts(env);
  const isConfiguredHost = configuredHosts.includes(hostname);
  const isPreviewHost = hostname.endsWith('.vercel.app');
  const isDevHost = isLocalhost(hostname);

  if (isProductionEnvironment(env)) {
    if (!isConfiguredHost && !isPreviewHost) {
      throw new AuthRedirectError(
        'Auth redirect URL must use the configured frontend host or a Vercel preview domain.',
        {
          code: 'host_not_allowed',
          value: url.href,
        }
      );
    }
    return;
  }

  if (!isDevHost && !isConfiguredHost) {
    throw new AuthRedirectError('Auth redirect URL must use localhost during development.', {
      code: 'dev_host_not_allowed',
      value: url.href,
    });
  }
}

function pickCallbackSource({ requestRedirectTo, env }) {
  if (isNonEmptyString(requestRedirectTo)) {
    return { source: 'request', value: requestRedirectTo.trim() };
  }

  if (isNonEmptyString(env.FRONTEND_CALLBACK_URL)) {
    return { source: 'FRONTEND_CALLBACK_URL', value: env.FRONTEND_CALLBACK_URL.trim() };
  }

  if (isNonEmptyString(env.SITE_URL || env.FRONTEND_URL)) {
    return {
      source: env.SITE_URL ? 'SITE_URL' : 'FRONTEND_URL',
      value: buildCallbackFromSiteUrl(env.SITE_URL || env.FRONTEND_URL),
    };
  }

  return {
    source: 'default',
    value: 'http://localhost:5173/p15/auth/callback',
  };
}

function resolveFrontendCallbackUrl({ requestRedirectTo, env = process.env } = {}) {
  const selected = pickCallbackSource({ requestRedirectTo, env });
  const parsedUrl = parseAbsoluteHttpUrl(selected.value);
  validateCallbackUrl(parsedUrl, env);

  return {
    url: parsedUrl.href,
    source: selected.source,
  };
}

export {
  AuthRedirectError,
  buildCallbackFromSiteUrl,
  resolveFrontendCallbackUrl,
};
