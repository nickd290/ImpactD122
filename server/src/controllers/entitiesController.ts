import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

// Get all entities
export const getAllEntities = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    const entities = await prisma.entity.findMany({
      where: type ? { type: type as any } : undefined,
      include: {
        contacts: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
    res.json(entities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
};

// Get single entity
export const getEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entity = await prisma.entity.findUnique({
      where: { id },
      include: {
        contacts: true,
      },
    });

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    res.json(entity);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch entity' });
  }
};

// Create entity
export const createEntity = async (req: Request, res: Response) => {
  try {
    const { contacts, ...entityData } = req.body;

    const entity = await prisma.entity.create({
      data: {
        ...entityData,
        contacts: contacts ? {
          create: contacts,
        } : undefined,
      },
      include: {
        contacts: true,
      },
    });

    res.status(201).json(entity);
  } catch (error) {
    console.error('Create entity error:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
};

// Update entity
export const updateEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { contacts, ...entityData } = req.body;

    const entity = await prisma.entity.update({
      where: { id },
      data: {
        ...entityData,
        contacts: contacts ? {
          deleteMany: {},
          create: contacts,
        } : undefined,
      },
      include: {
        contacts: true,
      },
    });

    res.json(entity);
  } catch (error) {
    console.error('Update entity error:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
};

// Delete entity
export const deleteEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if entity has jobs
    const jobs = await prisma.job.findFirst({
      where: {
        OR: [
          { customerId: id },
          { vendorId: id },
        ],
      },
    });

    if (jobs) {
      return res.status(400).json({
        error: 'Cannot delete entity with associated jobs'
      });
    }

    await prisma.entity.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete entity' });
  }
};
