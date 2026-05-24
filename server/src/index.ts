// Build version: 2026-01-07-v2 - Fixed job creation
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Middleware
import { requireInternalAuth } from './middleware/internal-auth';

// Route imports — public (token-based, no auth)
import portalPublicRouter from './routes/portalPublic';
import vendorRfqPublicRouter from './routes/vendorRfqPublic';
import intakePublicRouter from './routes/intakePublic';
import ownerHubRouter from './routes/owner'; // bearer-token guarded inside the router

// Route imports — own auth (webhook secret / email sync secret)
import webhooksRouter from './routes/webhooks';
import emailSyncRouter from './routes/emailSync';

// Route imports — protected (behind internal auth gate)
import jobsRouter from './routes/jobs';
import entitiesRouter from './routes/entities';
import aiRouter from './routes/ai';
import pdfRouter from './routes/pdf';
import financialsRouter from './routes/financials';
import exportRouter from './routes/export';
import bradfordRouter from './routes/bradford';
import paperInventoryRouter from './routes/paperInventory';
import emailRouter from './routes/email';
import communicationsRouter from './routes/communications';
import vendorRfqAdminRouter from './routes/vendorRfqAdmin';
import portalAdminRouter from './routes/portalAdmin';
import filesRouter from './routes/files';
import proofsRouter from './routes/proofs';
import dashboardRouter from './routes/dashboard';

// Load environment variables
// Use path relative to this file to find .env in the server directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Validate required environment variables
const requiredEnvVars = ['OPENAI_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingEnvVars.length > 0) {
  console.error('❌ FATAL: Missing required environment variables:');
  missingEnvVars.forEach(v => console.error(`   - ${v}`));
  console.error('\n📋 Add these to Railway Variables or your .env file');
  process.exit(1);
}

console.log('✅ Environment variables validated');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
}

// --- OPEN ROUTES ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve public intake form
app.get('/intake', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/intake.html'));
});

// --- WEBHOOK ROUTES (own auth — X-Webhook-Secret / validateEmailSyncSecret) ---
app.use('/api/webhooks', webhooksRouter);
app.use('/api/email-sync', emailSyncRouter);

// --- PUBLIC TOKEN ROUTES (no auth — token-based access) ---
app.use('/api', portalPublicRouter);
app.use('/api/vendor-rfqs', vendorRfqPublicRouter);
app.use('/api', intakePublicRouter);

// --- OWNER HUB (own auth — Bearer OWNER_HUB_TOKEN; mounted before INTERNAL gate) ---
app.use('/api/owner', ownerHubRouter);

// --- INTERNAL AUTH GATE ---
// All routes below this line require Authorization: Bearer <INTERNAL_API_SECRET>
app.use('/api', requireInternalAuth);

// --- PROTECTED ROUTES ---
app.use('/api/jobs', jobsRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/pdf', pdfRouter);
app.use('/api/financials', financialsRouter);
app.use('/api/export', exportRouter);
app.use('/api/bradford', bradfordRouter);
app.use('/api/paper-inventory', paperInventoryRouter);
app.use('/api/email', emailRouter);
app.use('/api/communications', communicationsRouter);
app.use('/api/vendor-rfqs', vendorRfqAdminRouter);
app.use('/api', portalAdminRouter);
app.use('/api', filesRouter);
app.use('/api/proofs', proofsRouter);
app.use('/api/dashboard', dashboardRouter);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
