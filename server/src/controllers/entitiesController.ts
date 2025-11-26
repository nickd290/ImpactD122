import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

// Get all entities (companies for customers, vendors for vendors)
export const getAllEntities = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    if (type === 'VENDOR') {
      // Get vendors
      const vendors = await prisma.vendor.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
      // Transform to match expected Entity shape
      const entities = vendors.map(v => ({
        id: v.id,
        name: v.name,
        type: 'VENDOR',
        email: v.email || '',
        phone: v.phone || '',
        address: `${v.streetAddress || ''}, ${v.city || ''}, ${v.state || ''} ${v.zip || ''}`.trim(),
        contactPerson: '',
        isPartner: false, // Could check vendor code for Bradford
        notes: '',
        contacts: [],
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      }));
      return res.json(entities);
    } else if (type === 'CUSTOMER') {
      // Get companies (customers)
      const companies = await prisma.company.findMany({
        include: { Employee: true },
        orderBy: { name: 'asc' },
      });
      // Transform to match expected Entity shape
      const entities = companies.map(c => ({
        id: c.id,
        name: c.name,
        type: 'CUSTOMER',
        email: c.email || '',
        phone: c.phone || '',
        address: c.address || '',
        contactPerson: c.Employee.find(e => e.isPrimary)?.name || c.Employee[0]?.name || '',
        isPartner: false,
        notes: '',
        contacts: c.Employee.map(e => ({
          id: e.id,
          name: e.name,
          email: e.email,
          phone: e.phone || '',
          isPrimary: e.isPrimary,
        })),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
      return res.json(entities);
    } else {
      // Get both - return companies as customers and vendors
      const [companies, vendors] = await Promise.all([
        prisma.company.findMany({
          include: { Employee: true },
          orderBy: { name: 'asc' },
        }),
        prisma.vendor.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
      ]);

      const customerEntities = companies.map(c => ({
        id: c.id,
        name: c.name,
        type: 'CUSTOMER',
        email: c.email || '',
        phone: c.phone || '',
        address: c.address || '',
        contactPerson: c.Employee.find(e => e.isPrimary)?.name || c.Employee[0]?.name || '',
        isPartner: false,
        notes: '',
        contacts: c.Employee.map(e => ({
          id: e.id,
          name: e.name,
          email: e.email,
          phone: e.phone || '',
          isPrimary: e.isPrimary,
        })),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));

      const vendorEntities = vendors.map(v => ({
        id: v.id,
        name: v.name,
        type: 'VENDOR',
        email: v.email || '',
        phone: v.phone || '',
        address: `${v.streetAddress || ''}, ${v.city || ''}, ${v.state || ''} ${v.zip || ''}`.trim(),
        contactPerson: '',
        isPartner: v.vendorCode === 'BRADFORD' || v.name.toLowerCase().includes('bradford'),
        notes: '',
        contacts: [],
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      }));

      return res.json([...customerEntities, ...vendorEntities]);
    }
  } catch (error) {
    console.error('Get entities error:', error);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
};

// Get single entity
export const getEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Try company first
    const company = await prisma.company.findUnique({
      where: { id },
      include: { Employee: true },
    });

    if (company) {
      return res.json({
        id: company.id,
        name: company.name,
        type: 'CUSTOMER',
        email: company.email || '',
        phone: company.phone || '',
        address: company.address || '',
        contactPerson: company.Employee.find(e => e.isPrimary)?.name || company.Employee[0]?.name || '',
        isPartner: false,
        notes: '',
        contacts: company.Employee.map(e => ({
          id: e.id,
          name: e.name,
          email: e.email,
          phone: e.phone || '',
          isPrimary: e.isPrimary,
        })),
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      });
    }

    // Try vendor
    const vendor = await prisma.vendor.findUnique({
      where: { id },
    });

    if (vendor) {
      return res.json({
        id: vendor.id,
        name: vendor.name,
        type: 'VENDOR',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: `${vendor.streetAddress || ''}, ${vendor.city || ''}, ${vendor.state || ''} ${vendor.zip || ''}`.trim(),
        contactPerson: '',
        isPartner: vendor.vendorCode === 'BRADFORD' || vendor.name.toLowerCase().includes('bradford'),
        notes: '',
        contacts: [],
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      });
    }

    return res.status(404).json({ error: 'Entity not found' });
  } catch (error) {
    console.error('Get entity error:', error);
    res.status(500).json({ error: 'Failed to fetch entity' });
  }
};

// Create entity
export const createEntity = async (req: Request, res: Response) => {
  try {
    const { type, contacts, name, email, phone, address, ...rest } = req.body;

    if (type === 'VENDOR') {
      const vendor = await prisma.vendor.create({
        data: {
          id: crypto.randomUUID(),
          name,
          email: email || null,
          phone: phone || null,
          streetAddress: address || null,
          updatedAt: new Date(),
        },
      });

      return res.status(201).json({
        id: vendor.id,
        name: vendor.name,
        type: 'VENDOR',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.streetAddress || '',
        contactPerson: '',
        isPartner: false,
        notes: '',
        contacts: [],
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      });
    } else {
      // Create company (customer)
      const company = await prisma.company.create({
        data: {
          id: crypto.randomUUID(),
          name,
          type: 'CUSTOMER',
          email: email || null,
          phone: phone || null,
          address: address || null,
          updatedAt: new Date(),
          Employee: contacts?.length ? {
            create: contacts.map((c: any) => ({
              id: crypto.randomUUID(),
              name: c.name,
              email: c.email,
              phone: c.phone || null,
              isPrimary: c.isPrimary || false,
              updatedAt: new Date(),
            })),
          } : undefined,
        },
        include: { Employee: true },
      });

      return res.status(201).json({
        id: company.id,
        name: company.name,
        type: 'CUSTOMER',
        email: company.email || '',
        phone: company.phone || '',
        address: company.address || '',
        contactPerson: company.Employee.find(e => e.isPrimary)?.name || company.Employee[0]?.name || '',
        isPartner: false,
        notes: '',
        contacts: company.Employee.map(e => ({
          id: e.id,
          name: e.name,
          email: e.email,
          phone: e.phone || '',
          isPrimary: e.isPrimary,
        })),
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      });
    }
  } catch (error) {
    console.error('Create entity error:', error);
    res.status(500).json({ error: 'Failed to create entity' });
  }
};

// Update entity
export const updateEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, contacts, name, email, phone, address, ...rest } = req.body;

    // Check if it's a vendor
    const existingVendor = await prisma.vendor.findUnique({ where: { id } });
    if (existingVendor) {
      const vendor = await prisma.vendor.update({
        where: { id },
        data: {
          name,
          email: email || null,
          phone: phone || null,
          streetAddress: address || null,
          updatedAt: new Date(),
        },
      });

      return res.json({
        id: vendor.id,
        name: vendor.name,
        type: 'VENDOR',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.streetAddress || '',
        contactPerson: '',
        isPartner: vendor.vendorCode === 'BRADFORD' || vendor.name.toLowerCase().includes('bradford'),
        notes: '',
        contacts: [],
        createdAt: vendor.createdAt,
        updatedAt: vendor.updatedAt,
      });
    }

    // Update company
    const company = await prisma.company.update({
      where: { id },
      data: {
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        updatedAt: new Date(),
      },
      include: { Employee: true },
    });

    // Update employees if provided
    if (contacts) {
      // Delete existing employees and recreate
      await prisma.employee.deleteMany({ where: { companyId: id } });
      if (contacts.length > 0) {
        await prisma.employee.createMany({
          data: contacts.map((c: any) => ({
            id: crypto.randomUUID(),
            companyId: id,
            name: c.name,
            email: c.email,
            phone: c.phone || null,
            isPrimary: c.isPrimary || false,
            updatedAt: new Date(),
          })),
        });
      }
    }

    // Fetch updated company with employees
    const updatedCompany = await prisma.company.findUnique({
      where: { id },
      include: { Employee: true },
    });

    return res.json({
      id: updatedCompany!.id,
      name: updatedCompany!.name,
      type: 'CUSTOMER',
      email: updatedCompany!.email || '',
      phone: updatedCompany!.phone || '',
      address: updatedCompany!.address || '',
      contactPerson: updatedCompany!.Employee.find(e => e.isPrimary)?.name || updatedCompany!.Employee[0]?.name || '',
      isPartner: false,
      notes: '',
      contacts: updatedCompany!.Employee.map(e => ({
        id: e.id,
        name: e.name,
        email: e.email,
        phone: e.phone || '',
        isPrimary: e.isPrimary,
      })),
      createdAt: updatedCompany!.createdAt,
      updatedAt: updatedCompany!.updatedAt,
    });
  } catch (error) {
    console.error('Update entity error:', error);
    res.status(500).json({ error: 'Failed to update entity' });
  }
};

// Delete entity
export const deleteEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if it's a vendor with jobs
    const vendorJobs = await prisma.job.findFirst({
      where: { vendorId: id },
    });

    if (vendorJobs) {
      return res.status(400).json({
        error: 'Cannot delete vendor with associated jobs'
      });
    }

    // Check if it's a company with jobs
    const companyJobs = await prisma.job.findFirst({
      where: { customerId: id },
    });

    if (companyJobs) {
      return res.status(400).json({
        error: 'Cannot delete company with associated jobs'
      });
    }

    // Try to delete as vendor first
    try {
      await prisma.vendor.delete({ where: { id } });
      return res.status(204).send();
    } catch {
      // Not a vendor, try company
    }

    // Delete as company (will cascade delete employees)
    await prisma.company.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete entity error:', error);
    res.status(500).json({ error: 'Failed to delete entity' });
  }
};
