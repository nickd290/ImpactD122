/**
 * Job QC & Readiness Controller
 *
 * Handles job readiness status, QC flags, and component management.
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  calculateReadiness,
  updateJobReadiness,
  getReadinessSummary,
  determineInitialQcFlags,
  isMailingJob,
} from '../../services/readinessService';

const prisma = new PrismaClient();

/**
 * GET /api/jobs/:id/readiness
 * Get readiness status and blockers for a job
 */
export const getJobReadiness = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await getReadinessSummary(id);

    res.json({
      jobId: id,
      jobNo: result.job.jobNo,
      readinessStatus: result.status,
      blockers: result.blockers,
      warnings: result.warnings,
      qcFlags: {
        artwork: result.job.qcArtwork,
        dataFiles: result.job.qcDataFiles,
        mailing: result.job.qcMailing,
        suppliedMaterials: result.job.qcSuppliedMaterials,
        versions: result.job.qcVersions,
      },
      notes: {
        artwork: result.job.qcArtworkNote,
        dataFiles: result.job.qcDataFilesNote,
        mailing: result.job.qcMailingNote,
        suppliedMaterials: result.job.qcSuppliedMaterialsNote,
        versions: result.job.qcVersionsNote,
      },
      isMailing: isMailingJob(result.job),
      componentCount: result.job.JobComponent?.length || 0,
    });
  } catch (error) {
    console.error('Error getting job readiness:', error);
    res.status(500).json({ error: 'Failed to get job readiness' });
  }
};

/**
 * PATCH /api/jobs/:id/qc
 * Update QC flags for a job
 */
export const updateJobQcFlags = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      qcArtwork,
      qcDataFiles,
      qcMailing,
      qcSuppliedMaterials,
      qcVersions,
      qcArtworkNote,
      qcDataFilesNote,
      qcMailingNote,
      qcSuppliedMaterialsNote,
      qcVersionsNote,
    } = req.body;

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};

    if (qcArtwork !== undefined) updateData.qcArtwork = qcArtwork;
    if (qcDataFiles !== undefined) updateData.qcDataFiles = qcDataFiles;
    if (qcMailing !== undefined) updateData.qcMailing = qcMailing;
    if (qcSuppliedMaterials !== undefined) updateData.qcSuppliedMaterials = qcSuppliedMaterials;
    if (qcVersions !== undefined) updateData.qcVersions = qcVersions;
    if (qcArtworkNote !== undefined) updateData.qcArtworkNote = qcArtworkNote;
    if (qcDataFilesNote !== undefined) updateData.qcDataFilesNote = qcDataFilesNote;
    if (qcMailingNote !== undefined) updateData.qcMailingNote = qcMailingNote;
    if (qcSuppliedMaterialsNote !== undefined) updateData.qcSuppliedMaterialsNote = qcSuppliedMaterialsNote;
    if (qcVersionsNote !== undefined) updateData.qcVersionsNote = qcVersionsNote;

    // Update the job
    await prisma.job.update({
      where: { id },
      data: updateData,
    });

    // Recalculate readiness
    const result = await updateJobReadiness(id);

    res.json({
      success: true,
      readinessStatus: result.status,
      blockers: result.blockers,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('Error updating job QC flags:', error);
    res.status(500).json({ error: 'Failed to update job QC flags' });
  }
};

/**
 * POST /api/jobs/:id/readiness/recalculate
 * Force recalculation of readiness status
 */
export const recalculateReadiness = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await updateJobReadiness(id);

    res.json({
      success: true,
      readinessStatus: result.status,
      blockers: result.blockers,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('Error recalculating readiness:', error);
    res.status(500).json({ error: 'Failed to recalculate readiness' });
  }
};

/**
 * GET /api/jobs/:id/components
 * Get all components for a job
 */
export const getJobComponents = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const components = await prisma.jobComponent.findMany({
      where: { jobId: id },
      orderBy: { sortOrder: 'asc' },
    });

    res.json(components);
  } catch (error) {
    console.error('Error getting job components:', error);
    res.status(500).json({ error: 'Failed to get job components' });
  }
};

/**
 * POST /api/jobs/:id/components
 * Create a new component for a job
 */
export const createJobComponent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      quantity,
      supplier,
      supplierName,
      artworkStatus,
      artworkLink,
      materialStatus,
      trackingNumber,
      trackingCarrier,
      expectedArrival,
      specs,
      notes,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Component name is required' });
    }

    // Get max sortOrder for this job
    const maxSort = await prisma.jobComponent.aggregate({
      where: { jobId: id },
      _max: { sortOrder: true },
    });

    const component = await prisma.jobComponent.create({
      data: {
        jobId: id,
        name,
        description,
        quantity,
        supplier: supplier || 'JD',
        supplierName,
        artworkStatus: artworkStatus || 'PENDING',
        artworkLink,
        artworkReceivedAt: artworkStatus === 'RECEIVED' ? new Date() : null,
        materialStatus: materialStatus || 'NA',
        trackingNumber,
        trackingCarrier,
        expectedArrival: expectedArrival ? new Date(expectedArrival) : null,
        specs,
        notes,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });

    // Recalculate readiness
    await updateJobReadiness(id);

    res.status(201).json(component);
  } catch (error) {
    console.error('Error creating job component:', error);
    res.status(500).json({ error: 'Failed to create job component' });
  }
};

/**
 * PUT /api/jobs/:id/components/:componentId
 * Update a job component
 */
export const updateJobComponent = async (req: Request, res: Response) => {
  try {
    const { id, componentId } = req.params;
    const {
      name,
      description,
      quantity,
      supplier,
      supplierName,
      artworkStatus,
      artworkLink,
      materialStatus,
      trackingNumber,
      trackingCarrier,
      expectedArrival,
      receivedAt,
      specs,
      notes,
      sortOrder,
    } = req.body;

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (supplier !== undefined) updateData.supplier = supplier;
    if (supplierName !== undefined) updateData.supplierName = supplierName;
    if (artworkStatus !== undefined) {
      updateData.artworkStatus = artworkStatus;
      if (artworkStatus === 'RECEIVED') {
        updateData.artworkReceivedAt = new Date();
      }
    }
    if (artworkLink !== undefined) updateData.artworkLink = artworkLink;
    if (materialStatus !== undefined) {
      updateData.materialStatus = materialStatus;
      if (materialStatus === 'RECEIVED') {
        updateData.receivedAt = new Date();
      }
    }
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
    if (trackingCarrier !== undefined) updateData.trackingCarrier = trackingCarrier;
    if (expectedArrival !== undefined) updateData.expectedArrival = expectedArrival ? new Date(expectedArrival) : null;
    if (receivedAt !== undefined) updateData.receivedAt = receivedAt ? new Date(receivedAt) : null;
    if (specs !== undefined) updateData.specs = specs;
    if (notes !== undefined) updateData.notes = notes;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const component = await prisma.jobComponent.update({
      where: { id: componentId },
      data: updateData,
    });

    // Recalculate readiness
    await updateJobReadiness(id);

    res.json(component);
  } catch (error) {
    console.error('Error updating job component:', error);
    res.status(500).json({ error: 'Failed to update job component' });
  }
};

/**
 * DELETE /api/jobs/:id/components/:componentId
 * Delete a job component
 */
export const deleteJobComponent = async (req: Request, res: Response) => {
  try {
    const { id, componentId } = req.params;

    await prisma.jobComponent.delete({
      where: { id: componentId },
    });

    // Recalculate readiness
    await updateJobReadiness(id);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting job component:', error);
    res.status(500).json({ error: 'Failed to delete job component' });
  }
};
