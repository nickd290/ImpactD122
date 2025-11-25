import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Temporary export endpoint - fetch all data as JSON
router.get('/all', async (req, res) => {
  try {
    console.log('Exporting all database data...');

    const [entities, jobs] = await Promise.all([
      prisma.entity.findMany({
        include: { contacts: true }
      }),
      prisma.job.findMany({
        include: {
          lineItems: true,
          specs: true,
          financials: true
        }
      })
    ]);

    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        entityCount: entities.length,
        jobCount: jobs.length
      },
      entities,
      jobs
    };

    res.json(exportData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed', message: (error as Error).message });
  }
});

export default router;
