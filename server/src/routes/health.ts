import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const time = new Date().toISOString();
  res.json({
    status: 'ok',
    time,
    timestamp: time,
    uptime: process.uptime(),
    service: 'ProcureFlow Backend'
  });
});

export default router;
