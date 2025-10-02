import { Router } from 'express';
import { verifyFirebaseToken } from '../middleware/auth.js';

const r = Router();

// Verify token and return current user profile
r.get('/me', verifyFirebaseToken, async (req, res) => {
  // req.user is set by middleware
  return res.json({ user: req.user });
});

export default r;
