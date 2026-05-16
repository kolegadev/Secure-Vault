import { Router } from 'express';
import { loginHandler, logoutHandler, statusHandler } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/login', authRateLimiter, loginHandler);
router.post('/logout', logoutHandler);
router.get('/status', statusHandler);

export default router;
