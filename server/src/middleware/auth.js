import { getAuthAdmin } from '../config/firebaseAdmin.js';

// Verify Firebase ID token from Authorization: Bearer <token>
export async function verifyFirebaseToken(req, res, next) {
  try {
    const h = String(req.headers['authorization'] || '');
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: 'missing bearer token' });
    const idToken = m[1];
    const auth = getAuthAdmin();
    const decoded = await auth.verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture,
      email_verified: decoded.email_verified,
      claims: decoded
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}
