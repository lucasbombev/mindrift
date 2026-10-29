import { Router } from 'express';
import { getDashboard } from '../services/dashboard.js';

export function createDashboardRouter(db) {
  const router = Router();
  router.get('/', (req, res) => {
    res.json(getDashboard(db, req.tenantId));
  });
  return router;
}
