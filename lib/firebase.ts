/**
 * firebase.ts
 *
 * Firebase is no longer used for authentication in this project.
 * Auth has been replaced with a direct Google OAuth 2.0 flow via:
 *   - GET  /api/auth/google          (initiate)
 *   - GET  /api/auth/callback/google (callback)
 *   - POST /api/auth/token           (refresh)
 *   - POST /api/auth/logout          (logout)
 *   - lib/oauth.ts                   (client helpers)
 *
 * This file is kept as a placeholder in case Firestore or other
 * Firebase services are needed in the future.
 */

// No-op exports to prevent import errors in any file that hasn't been updated yet.
export {};
