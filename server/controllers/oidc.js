import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { getAuthConfiguration } from '../config/auth.js';
import { isEmailEnabled } from '../config/email.js';
import { oidcService } from '../services/auth/oidc.js';
import { createAuthenticatedSession, createEmailEnrollmentResponse } from '../services/auth/session.js';

const COOKIE_NAME = 'rssmonster_oidc';
const cookieOptions = configuration => ({
  httpOnly: true, secure: new URL(configuration.redirectUri).protocol === 'https:',
  sameSite: 'lax', path: '/api/auth/oidc', maxAge: 10 * 60_000
});
const browserCookie = req => {
  const cookies = (req.headers.cookie || '').split(';').map(part => part.trim());
  const matches = cookies.filter(part => part.startsWith(`${COOKIE_NAME}=`));
  return matches.length === 1 ? matches[0].slice(COOKIE_NAME.length + 1) : null;
};

const failure = res => res.status(401).json({
  message: 'Provider sign-in could not be completed. Please start again or link your account first.'
});

// Error messages and provider responses may contain credentials; log only error categories.
const logFailure = (stage, error) => {
  console.warn(`[OIDC] ${stage} failed`, error?.code || error?.name || 'UnknownError');
};

// A configured origin is authoritative; forwarded or Host headers never select redirects.
export const requireOidc = (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  const configuration = getAuthConfiguration();
  if (!configuration.oidcEnabled) return res.status(404).json({ message: 'Not found.' });
  req.oidcConfiguration = configuration.oidc;
  if (req.method === 'POST' && req.get('origin') !== new URL(configuration.oidc.frontendUrl).origin) {
    return res.status(403).json({ message: 'Invalid request origin.' });
  }
  next();
};

const login = async (req, res) => {
  try {
    const result = await oidcService.start(req.oidcConfiguration);
    res.cookie(COOKIE_NAME, result.browser, cookieOptions(req.oidcConfiguration));
    return res.redirect(302, result.authorizationUrl);
  } catch (error) {
    logFailure('login', error);
    return res.status(503).json({ message: 'Provider sign-in is temporarily unavailable.' });
  }
};

const link = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.userData.userId);
    const password = req.body?.password;
    if (!user?.password || typeof password !== 'string' || password.length > 128 || !await bcrypt.compare(password, user.password)) return failure(res);
    const result = await oidcService.start(req.oidcConfiguration, { linkUser: user });
    res.cookie(COOKIE_NAME, result.browser, cookieOptions(req.oidcConfiguration));
    return res.json({ authorizationUrl: result.authorizationUrl });
  } catch (error) {
    logFailure('link', error);
    return failure(res);
  }
};

const callback = async (req, res) => {
  const configuration = req.oidcConfiguration;
  const destination = new URL(configuration.frontendUrl);
  try {
    const url = new URL(configuration.redirectUri);
    url.search = new URL(req.originalUrl, url).search;
    const code = await oidcService.callback(configuration, url, browserCookie(req));
    res.cookie(COOKIE_NAME, browserCookie(req), { ...cookieOptions(configuration), maxAge: 60_000 });
    destination.hash = new URLSearchParams({ 'oidc-code': code }).toString();
  } catch (error) {
    logFailure('callback', error);
    destination.hash = 'oidc-error=failed';
  }
  return res.redirect(303, destination.href);
};

const exchange = async (req, res) => {
  try {
    const { user, linked } = await oidcService.exchange(req.oidcConfiguration, req.body?.code, browserCookie(req));
    res.clearCookie(COOKIE_NAME, cookieOptions(req.oidcConfiguration));
    if (isEmailEnabled() && !user.emailVerifiedAt) return res.json(createEmailEnrollmentResponse(user));
    const session = await createAuthenticatedSession(user);
    return res.json({ ...session, oidcLinked: linked });
  } catch (error) {
    logFailure('exchange', error);
    return failure(res);
  }
};

export default { login, link, callback, exchange };
