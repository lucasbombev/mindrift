import { Router } from 'express';
import { getDashboard } from '../services/dashboard.js';

export function createDashboardRouter(db) {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(getDashboard(db));
  });
  return router;
}
