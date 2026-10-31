import app from './app';
import { env } from './config/env';
import { recoverStaleRunsOnBoot } from './agents/orchestrator';

recoverStaleRunsOnBoot().finally(() => {
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 ProcureFlow Backend Server running on http://localhost:${env.PORT}`);
    console.log(`⚡ LLM Mode: ${env.LLM_MODE} | Fallbacks enabled: ${env.LLM_FALLBACK}`);
    console.log(`📡 Health Check: http://localhost:${env.PORT}/api/health`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing HTTP server...');
    server.close(() => {
      console.log('Server terminated.');
    });
  });
});
