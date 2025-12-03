import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';

// Get all entities (companies for customers, vendors for vendors)
export const getAllEntities = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;

    if (type === 'VENDOR') {
      // Get vendors with contacts
      const vendors = await prisma.vendor.findMany({
        where: { isActive: true },
        include: { contacts: true },
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
        contactPerson: v.contacts.find(c => c.isPrimary)?.name || v.contacts[0]?.name || '',
        isPartner: v.vendorCode === 'BRADFORD' || v.name?.toLowerCase().includes('bradford'),
        notes: '',
        contacts: v.contacts.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          title: c.title || '',
          isPrimary: c.isPrimary,
        })),
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      }));
      return res.json(entities);
    } else if (type === 'CUSTOMER') {
      // Get companies (customers only - exclude partners/brokers/manufacturers)
      const companies = await prisma.company.findMany({
        where: {
          type: {
            notIn: ['PARTNER', 'broker', 'manufacturer'],
          },
        },
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
          where: {
            type: {
              notIn: ['PARTNER', 'broker', 'manufacturer'],
            },
          },
          include: { Employee: true },
          orderBy: { name: 'asc' },
        }),
        prisma.vendor.findMany({
          where: { isActive: true },
          include: { contacts: true },
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
        contactPerson: v.contacts?.find(c => c.isPrimary)?.name || v.contacts?.[0]?.name || '',
        isPartner: v.vendorCode === 'BRADFORD' || v.name?.toLowerCase().includes('bradford'),
        notes: '',
        contacts: v.contacts?.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          title: c.title || '',
          isPrimary: c.isPrimary,
        })) || [],
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
      include: { contacts: true },
    });

    if (vendor) {
      return res.json({
        id: vendor.id,
        name: vendor.name,
        type: 'VENDOR',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: `${vendor.streetAddress || ''}, ${vendor.city || ''}, ${vendor.state || ''} ${vendor.zip || ''}`.trim(),
        contactPerson: vendor.contacts?.find(c => c.isPrimary)?.name || vendor.contacts?.[0]?.name || '',
        isPartner: vendor.vendorCode === 'BRADFORD' || vendor.name.toLowerCase().includes('bradford'),
        notes: '',
        contacts: vendor.contacts?.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          title: c.title || '',
          isPrimary: c.isPrimary,
        })) || [],
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
          contacts: contacts?.length ? {
            create: contacts.map((c: any) => ({
              name: c.name,
              email: c.email,
              title: c.title || null,
              isPrimary: c.isPrimary || false,
            })),
          } : undefined,
        },
        include: { contacts: true },
      });

      return res.status(201).json({
        id: vendor.id,
        name: vendor.name,
        type: 'VENDOR',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.streetAddress || '',
        contactPerson: vendor.contacts?.find(c => c.isPrimary)?.name || vendor.contacts?.[0]?.name || '',
        isPartner: false,
        notes: '',
        contacts: vendor.contacts?.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          title: c.title || '',
          isPrimary: c.isPrimary,
        })) || [],
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
      // Update vendor data
      await prisma.vendor.update({
        where: { id },
        data: {
          name,
          email: email || null,
          phone: phone || null,
          streetAddress: address || null,
          updatedAt: new Date(),
        },
      });

      // Update vendor contacts if provided
      if (contacts) {
        // Delete existing contacts and recreate
        await prisma.vendorContact.deleteMany({ where: { vendorId: id } });
        if (contacts.length > 0) {
          await prisma.vendorContact.createMany({
            data: contacts.map((c: any) => ({
              vendorId: id,
              name: c.name,
              email: c.email,
              title: c.title || null,
              isPrimary: c.isPrimary || false,
            })),
          });
        }
      }

      // Fetch updated vendor with contacts
      const updatedVendor = await prisma.vendor.findUnique({
        where: { id },
        include: { contacts: true },
      });

      return res.json({
        id: updatedVendor!.id,
        name: updatedVendor!.name,
        type: 'VENDOR',
        email: updatedVendor!.email || '',
        phone: updatedVendor!.phone || '',
        address: updatedVendor!.streetAddress || '',
        contactPerson: updatedVendor!.contacts?.find(c => c.isPrimary)?.name || updatedVendor!.contacts?.[0]?.name || '',
        isPartner: updatedVendor!.vendorCode === 'BRADFORD' || updatedVendor!.name.toLowerCase().includes('bradford'),
        notes: '',
        contacts: updatedVendor!.contacts?.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          title: c.title || '',
          isPrimary: c.isPrimary,
        })) || [],
        createdAt: updatedVendor!.createdAt,
        updatedAt: updatedVendor!.updatedAt,
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
