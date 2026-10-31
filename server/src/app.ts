import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import requestsRouter from './routes/requests';
import runsRouter from './routes/runs';
import approvalsRouter from './routes/approvals';
import vendorsRouter from './routes/vendors';
import auditRouter from './routes/audit';
import analyticsRouter from './routes/analytics';
import metaRouter from './routes/meta';

const app = express();

// Required behind Render's proxy so rate limiting sees real client IPs
app.set('trust proxy', 1);

app.use(helmet());

const localDevOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'];

const configuredOrigins = env.CLIENT_URL.split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([
    ...(env.NODE_ENV !== 'production' ? localDevOrigins : []),
    ...configuredOrigins
  ])
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: false
  })
);

app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));
app.use(globalLimiter);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'success',
    message: 'ProcureFlow API is running'
  });
});

// Mount routes (never add compression middleware as it buffers SSE)
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/meta', metaRouter);

// Central error handler
app.use(errorHandler);

export default app;
