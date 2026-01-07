import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let secrets;
try {
  secrets = require('../secrets.js');
} catch (e) {
  // Fallback if running from a different directory or secrets missing
  secrets = {};
}

export const ADMIN_PASSWORD = secrets.authorizationCode || 'roche';
export const COOKIE_SECRET = secrets.cookieSecret || 'supersecretkey';
export const SESSION_TOKEN = 'admin-session-token'; // Simple token to store in cookie
