import { prisma } from './utils/prisma';

async function seed() {
  console.log('🌱 Seeding database...');

  // Create some sample entities (customers and vendors)
  const bradford = await prisma.entity.create({
    data: {
      name: 'Bradford Commercial Printing (JD Graphic)',
      type: 'VENDOR',
      email: 'orders@jdgraphic.com',
      phone: '555-0100',
      address: '123 Print St, City, State 12345',
      contactPerson: 'John Doe',
      isPartner: true,
      notes: 'Partner vendor - special pricing model',
    },
  });

  const customer1 = await prisma.entity.create({
    data: {
      name: 'Acme Corporation',
      type: 'CUSTOMER',
      email: 'orders@acmecorp.com',
      phone: '555-0200',
      address: '456 Business Ave, City, State 12345',
      contactPerson: 'Jane Smith',
      contacts: {
        create: [
          {
            name: 'Jane Smith',
            email: 'jane@acmecorp.com',
            phone: '555-0201',
            isPrimary: true,
          },
        ],
      },
    },
  });

  const vendor1 = await prisma.entity.create({
    data: {
      name: 'PrintWorks Inc',
      type: 'VENDOR',
      email: 'info@printworks.com',
      phone: '555-0300',
      address: '789 Print Lane, City, State 12345',
      contactPerson: 'Bob Johnson',
    },
  });

  console.log('✅ Created entities');

  // Create a sample job
  const job = await prisma.job.create({
    data: {
      number: 'J-1001',
      title: '5000 Brochures - Tri-fold',
      customerId: customer1.id,
      vendorId: bradford.id,
      status: 'QUOTED',
      notes: 'Rush order needed by end of month',
      lineItems: {
        create: [
          {
            description: '5000 8.5x11 tri-fold brochures, 4/4 color',
            quantity: 5000,
            unitCost: 0.15,
            markupPercent: 50,
            unitPrice: 0.225,
            sortOrder: 0,
          },
        ],
      },
      specs: {
        create: {
          productType: 'FOLDED',
          flatSize: '8.5x11',
          finishedSize: '3.67x8.5',
          colors: '4/4',
          coating: 'Gloss',
          paperType: '100# Gloss Text',
        },
      },
    },
  });

  console.log('✅ Created sample job');
  console.log('🎉 Seeding complete!');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
