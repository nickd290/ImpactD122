import express from 'express';
import { prisma } from '../utils/prisma';

const router = express.Router();

// API key authentication middleware
const requireApiKey = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.EXPORT_API_KEY;

  if (!expectedKey) {
    console.error('EXPORT_API_KEY not configured');
    return res.status(500).json({ error: 'Export endpoint not configured' });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key' });
  }

  next();
};

// Export endpoint - fetch all data as JSON (requires API key)
router.get('/all', requireApiKey, async (req, res) => {
  try {
    console.log('Exporting all database data...');

    const [companies, vendors, jobs] = await Promise.all([
      prisma.company.findMany({
        include: { Employee: true }
      }),
      prisma.vendor.findMany(),
      prisma.job.findMany({
        include: {
          Company: true,
          Vendor: true,
        }
      })
    ]);

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        companyCount: companies.length,
        vendorCount: vendors.length,
        jobCount: jobs.length
      },
      companies,
      vendors,
      jobs
    };

    res.json(exportData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed', message: (error as Error).message });
  }
});

export default router;
