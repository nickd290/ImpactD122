import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
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
import webhooksRouter from './routes/webhooks';
import vendorRfqRouter from './routes/vendorRfq';
import portalRouter from './routes/portal';
import filesRouter from './routes/files';

// Load environment variables
// Use path relative to this file to find .env in the server directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
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
app.use('/api/webhooks', webhooksRouter);
app.use('/api/vendor-rfqs', vendorRfqRouter);
app.use('/api', portalRouter);
app.use('/api', filesRouter);

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
