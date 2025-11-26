import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Temporary export endpoint - fetch all data as JSON
router.get('/all', async (req, res) => {
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
