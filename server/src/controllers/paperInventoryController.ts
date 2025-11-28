import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

/**
 * GET /api/paper-inventory
 * Get all paper inventory items with low stock alerts
 */
export async function getAllPaperInventory(req: Request, res: Response) {
  try {
    const inventory = await prisma.paperInventory.findMany({
      include: {
        PaperTransaction: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 transactions
        },
      },
      orderBy: [
        { paperType: 'asc' },
        { rollWidth: 'asc' },
      ],
    });

    // Add low stock flag
    const inventoryWithAlerts = inventory.map(item => ({
      ...item,
      isLowStock: item.reorderPoint ? item.quantity <= item.reorderPoint : false,
      totalWeight: item.weightPerRoll ? Number(item.weightPerRoll) * item.quantity : null,
    }));

    res.json(inventoryWithAlerts);
  } catch (error) {
    console.error('Error fetching paper inventory:', error);
    res.status(500).json({ error: 'Failed to fetch paper inventory' });
  }
}

/**
 * GET /api/paper-inventory/:id
 * Get a single inventory item with full transaction history
 */
export async function getPaperInventory(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const inventory = await prisma.paperInventory.findUnique({
      where: { id },
      include: {
        PaperTransaction: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Paper inventory item not found' });
    }

    res.json(inventory);
  } catch (error) {
    console.error('Error fetching paper inventory item:', error);
    res.status(500).json({ error: 'Failed to fetch paper inventory item' });
  }
}

/**
 * POST /api/paper-inventory
 * Create a new paper inventory item
 */
export async function createPaperInventory(req: Request, res: Response) {
  try {
    const {
      rollType,
      rollWidth,
      paperPoint,
      paperType,
      quantity,
      weightPerRoll,
      reorderPoint,
      companyId,
    } = req.body;

    if (!rollType || !paperType) {
      return res.status(400).json({ error: 'Roll type and paper type are required' });
    }

    // Get default company if not provided (Bradford or JD)
    let finalCompanyId = companyId;
    if (!finalCompanyId) {
      const company = await prisma.company.findFirst({
        where: {
          OR: [
            { name: { contains: 'Bradford' } },
            { name: { contains: 'JD' } },
          ],
        },
      });
      finalCompanyId = company?.id || 'default';
    }

    const inventory = await prisma.paperInventory.create({
      data: {
        id: crypto.randomUUID(),
        rollType,
        rollWidth: parseInt(rollWidth) || 0,
        paperPoint: parseInt(paperPoint) || 0,
        paperType,
        quantity: parseInt(quantity) || 0,
        weightPerRoll: weightPerRoll ? parseFloat(weightPerRoll) : null,
        reorderPoint: reorderPoint ? parseInt(reorderPoint) : null,
        companyId: finalCompanyId,
        updatedAt: new Date(),
      },
    });

    // Create initial transaction if quantity > 0
    if (quantity > 0) {
      await prisma.paperTransaction.create({
        data: {
          id: crypto.randomUUID(),
          inventoryId: inventory.id,
          type: 'INITIAL',
          quantity: parseInt(quantity),
          notes: 'Initial inventory',
        },
      });
    }

    res.status(201).json(inventory);
  } catch (error) {
    console.error('Error creating paper inventory:', error);
    res.status(500).json({ error: 'Failed to create paper inventory' });
  }
}

/**
 * PUT /api/paper-inventory/:id
 * Update a paper inventory item
 */
export async function updatePaperInventory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const {
      rollType,
      rollWidth,
      paperPoint,
      paperType,
      weightPerRoll,
      reorderPoint,
    } = req.body;

    const inventory = await prisma.paperInventory.update({
      where: { id },
      data: {
        rollType,
        rollWidth: rollWidth !== undefined ? parseInt(rollWidth) : undefined,
        paperPoint: paperPoint !== undefined ? parseInt(paperPoint) : undefined,
        paperType,
        weightPerRoll: weightPerRoll !== undefined ? parseFloat(weightPerRoll) : undefined,
        reorderPoint: reorderPoint !== undefined ? parseInt(reorderPoint) : undefined,
        updatedAt: new Date(),
      },
    });

    res.json(inventory);
  } catch (error) {
    console.error('Error updating paper inventory:', error);
    res.status(500).json({ error: 'Failed to update paper inventory' });
  }
}

/**
 * DELETE /api/paper-inventory/:id
 * Delete a paper inventory item
 */
export async function deletePaperInventory(req: Request, res: Response) {
  try {
    const { id } = req.params;

    await prisma.paperInventory.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting paper inventory:', error);
    res.status(500).json({ error: 'Failed to delete paper inventory' });
  }
}

/**
 * POST /api/paper-inventory/:id/adjust
 * Adjust inventory quantity (add rolls, use for job, etc.)
 */
export async function adjustInventory(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { type, quantity, jobId, notes } = req.body;

    if (!type || quantity === undefined) {
      return res.status(400).json({ error: 'Type and quantity are required' });
    }

    const inventory = await prisma.paperInventory.findUnique({
      where: { id },
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Paper inventory item not found' });
    }

    const adjustmentQty = parseInt(quantity);
    let newQuantity = inventory.quantity;

    // Handle different transaction types
    switch (type) {
      case 'ADD':
      case 'RECEIVE':
      case 'RETURN':
        newQuantity += adjustmentQty;
        break;
      case 'USE':
      case 'JOB_USAGE':
      case 'WASTE':
      case 'ADJUSTMENT_DOWN':
        newQuantity -= adjustmentQty;
        break;
      case 'ADJUSTMENT':
        // Direct set to quantity
        newQuantity = adjustmentQty;
        break;
      default:
        return res.status(400).json({ error: `Invalid transaction type: ${type}` });
    }

    if (newQuantity < 0) {
      return res.status(400).json({
        error: 'Insufficient inventory',
        currentQuantity: inventory.quantity,
        requestedDeduction: adjustmentQty,
      });
    }

    // Update inventory and create transaction
    const [updatedInventory, transaction] = await prisma.$transaction([
      prisma.paperInventory.update({
        where: { id },
        data: {
          quantity: newQuantity,
          updatedAt: new Date(),
        },
      }),
      prisma.paperTransaction.create({
        data: {
          id: crypto.randomUUID(),
          inventoryId: id,
          type,
          quantity: type === 'ADJUSTMENT' ? newQuantity - inventory.quantity : adjustmentQty,
          jobId: jobId || null,
          notes: notes || null,
        },
      }),
    ]);

    res.json({
      inventory: updatedInventory,
      transaction,
      previousQuantity: inventory.quantity,
      newQuantity,
    });
  } catch (error) {
    console.error('Error adjusting paper inventory:', error);
    res.status(500).json({ error: 'Failed to adjust paper inventory' });
  }
}

/**
 * GET /api/paper-inventory/:id/transactions
 * Get transaction history for an inventory item
 */
export async function getTransactionHistory(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const transactions = await prisma.paperTransaction.findMany({
      where: { inventoryId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
}

/**
 * GET /api/paper-inventory/summary
 * Get inventory summary by company (Bradford vs JD)
 */
export async function getInventorySummary(req: Request, res: Response) {
  try {
    const inventory = await prisma.paperInventory.findMany({
      include: {
        PaperTransaction: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        },
      },
    });

    // Group by paper type
    const byPaperType = inventory.reduce((acc: any, item) => {
      if (!acc[item.paperType]) {
        acc[item.paperType] = {
          paperType: item.paperType,
          totalRolls: 0,
          totalWeight: 0,
          lowStockCount: 0,
          items: [],
        };
      }
      acc[item.paperType].totalRolls += item.quantity;
      acc[item.paperType].totalWeight += item.weightPerRoll ? Number(item.weightPerRoll) * item.quantity : 0;
      if (item.reorderPoint && item.quantity <= item.reorderPoint) {
        acc[item.paperType].lowStockCount++;
      }
      acc[item.paperType].items.push(item);
      return acc;
    }, {});

    // Calculate usage from transactions
    const usageStats = inventory.reduce((acc: any, item) => {
      const usageTransactions = item.PaperTransaction.filter(t =>
        ['USE', 'JOB_USAGE', 'WASTE'].includes(t.type)
      );
      const totalUsed = usageTransactions.reduce((sum, t) => sum + t.quantity, 0);
      return {
        totalUsed: acc.totalUsed + totalUsed,
        transactionCount: acc.transactionCount + usageTransactions.length,
      };
    }, { totalUsed: 0, transactionCount: 0 });

    const lowStockItems = inventory.filter(item =>
      item.reorderPoint && item.quantity <= item.reorderPoint
    );

    res.json({
      totalItems: inventory.length,
      totalRolls: inventory.reduce((sum, item) => sum + item.quantity, 0),
      totalWeight: inventory.reduce((sum, item) => sum + (item.weightPerRoll ? Number(item.weightPerRoll) * item.quantity : 0), 0),
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.map(item => ({
        id: item.id,
        paperType: item.paperType,
        rollType: item.rollType,
        rollWidth: item.rollWidth,
        quantity: item.quantity,
        reorderPoint: item.reorderPoint,
      })),
      byPaperType: Object.values(byPaperType),
      usageLast30Days: usageStats,
    });
  } catch (error) {
    console.error('Error fetching inventory summary:', error);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
}

/**
 * POST /api/paper-inventory/apply-job-usage
 * Apply paper usage from a job to inventory
 */
export async function applyJobUsage(req: Request, res: Response) {
  try {
    const { jobId, inventoryId, rollsUsed, notes } = req.body;

    if (!jobId || !inventoryId || !rollsUsed) {
      return res.status(400).json({ error: 'Job ID, inventory ID, and rolls used are required' });
    }

    const inventory = await prisma.paperInventory.findUnique({
      where: { id: inventoryId },
    });

    if (!inventory) {
      return res.status(404).json({ error: 'Paper inventory item not found' });
    }

    const rollsToDeduct = parseInt(rollsUsed);

    if (inventory.quantity < rollsToDeduct) {
      return res.status(400).json({
        error: 'Insufficient inventory',
        currentQuantity: inventory.quantity,
        requested: rollsToDeduct,
      });
    }

    // Get job info for notes
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { jobNo: true, title: true },
    });

    const [updatedInventory, transaction] = await prisma.$transaction([
      prisma.paperInventory.update({
        where: { id: inventoryId },
        data: {
          quantity: inventory.quantity - rollsToDeduct,
          updatedAt: new Date(),
        },
      }),
      prisma.paperTransaction.create({
        data: {
          id: crypto.randomUUID(),
          inventoryId,
          type: 'JOB_USAGE',
          quantity: rollsToDeduct,
          jobId,
          notes: notes || `Used for job ${job?.jobNo || jobId}: ${job?.title || ''}`,
        },
      }),
    ]);

    res.json({
      inventory: updatedInventory,
      transaction,
      job: job,
    });
  } catch (error) {
    console.error('Error applying job usage:', error);
    res.status(500).json({ error: 'Failed to apply job usage' });
  }
}
