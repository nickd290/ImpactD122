/**
 * Unify Bradford into one identity.
 *
 * Before: Company id=bradford + Vendor id=bradford-vendor (two records)
 * After:  same id "bradford" on Company (PO payee graph) and Vendor (job vendor)
 *
 * Dry run default. APPLY=1 to write.
 *
 * Usage:
 *   cd server && npx tsx scripts/unify-bradford-vendor.ts
 *   APPLY=1 npx tsx scripts/unify-bradford-vendor.ts
 */

import { prisma } from '../src/utils/prisma';

const OLD_VENDOR_ID = 'bradford-vendor';
const CANONICAL_ID = 'bradford';
const CANONICAL_NAME = 'Bradford';

async function main() {
  const apply = process.env.APPLY === '1';
  console.log(apply ? '🔧 APPLY mode' : '👀 DRY RUN (set APPLY=1 to write)');

  const company = await prisma.company.findUnique({ where: { id: CANONICAL_ID } });
  const oldVendor = await prisma.vendor.findUnique({ where: { id: OLD_VENDOR_ID } });
  const existingCanonical = await prisma.vendor.findUnique({ where: { id: CANONICAL_ID } });

  console.log('Company:', company ? `${company.id} / ${company.name}` : 'MISSING');
  console.log('Old vendor:', oldVendor ? `${oldVendor.id} / ${oldVendor.name}` : 'gone');
  console.log('Vendor@bradford:', existingCanonical ? `${existingCanonical.id} / ${existingCanonical.name}` : 'none');

  const jobCount = await prisma.job.count({ where: { vendorId: OLD_VENDOR_ID } });
  const mailCount = await prisma.job.count({ where: { mailingVendorId: OLD_VENDOR_ID } });
  const poCount = await prisma.purchaseOrder.count({ where: { targetVendorId: OLD_VENDOR_ID } });
  console.log(`Jobs.vendorId→old: ${jobCount}, mailing: ${mailCount}, PO.targetVendorId: ${poCount}`);

  if (!oldVendor && existingCanonical) {
    console.log('Already unified. Syncing name/isPartner only.');
    if (apply) {
      await prisma.$transaction([
        prisma.vendor.update({
          where: { id: CANONICAL_ID },
          data: {
            name: CANONICAL_NAME,
            isPartner: true,
            vendorCode: 'BRADFORD',
            email: existingCanonical.email || company?.email || 'steve.gustafson@bgeltd.com',
            updatedAt: new Date(),
          },
        }),
        prisma.company.update({
          where: { id: CANONICAL_ID },
          data: { name: CANONICAL_NAME, updatedAt: new Date() },
        }),
      ]);
      console.log('✅ Flags/name synced');
    }
    return;
  }

  if (!oldVendor) {
    console.error('No bradford-vendor row and no vendor@bradford — nothing to do');
    process.exit(1);
  }

  if (existingCanonical && existingCanonical.id === CANONICAL_ID) {
    console.error('Both old and new vendor ids exist — manual merge needed');
    process.exit(1);
  }

  if (!apply) {
    console.log('\nWould:');
    console.log(`  1. INSERT Vendor id=${CANONICAL_ID} name=${CANONICAL_NAME} isPartner=true`);
    console.log(`  2. UPDATE ${jobCount} jobs vendorId`);
    console.log(`  3. UPDATE ${poCount} POs targetVendorId`);
    console.log(`  4. DELETE Vendor ${OLD_VENDOR_ID}`);
    console.log(`  5. UPDATE Company name → ${CANONICAL_NAME}`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Free unique vendorCode so new row can take BRADFORD
    await tx.vendor.update({
      where: { id: OLD_VENDOR_ID },
      data: { vendorCode: null, updatedAt: new Date() },
    });

    await tx.vendor.create({
      data: {
        id: CANONICAL_ID,
        name: CANONICAL_NAME,
        email: oldVendor.email || company?.email || 'steve.gustafson@bgeltd.com',
        phone: oldVendor.phone,
        isActive: true,
        isPartner: true,
        isInternal: false,
        vendorCode: 'BRADFORD',
        streetAddress: oldVendor.streetAddress,
        city: oldVendor.city,
        state: oldVendor.state,
        zip: oldVendor.zip,
        country: oldVendor.country || 'USA',
        createdAt: oldVendor.createdAt,
        updatedAt: new Date(),
      },
    });

    if (jobCount > 0) {
      await tx.job.updateMany({
        where: { vendorId: OLD_VENDOR_ID },
        data: { vendorId: CANONICAL_ID },
      });
    }
    if (mailCount > 0) {
      await tx.job.updateMany({
        where: { mailingVendorId: OLD_VENDOR_ID },
        data: { mailingVendorId: CANONICAL_ID },
      });
    }
    if (poCount > 0) {
      await tx.purchaseOrder.updateMany({
        where: { targetVendorId: OLD_VENDOR_ID },
        data: { targetVendorId: CANONICAL_ID },
      });
    }

    await tx.jobComponent.updateMany({
      where: { vendorId: OLD_VENDOR_ID },
      data: { vendorId: CANONICAL_ID },
    });
    await tx.vendorContact.updateMany({
      where: { vendorId: OLD_VENDOR_ID },
      data: { vendorId: CANONICAL_ID },
    });
    await tx.vendorQuote.updateMany({
      where: { vendorId: OLD_VENDOR_ID },
      data: { vendorId: CANONICAL_ID },
    });
    await tx.vendorRFQVendor.updateMany({
      where: { vendorId: OLD_VENDOR_ID },
      data: { vendorId: CANONICAL_ID },
    });

    await tx.vendor.delete({ where: { id: OLD_VENDOR_ID } });

    if (company) {
      await tx.company.update({
        where: { id: CANONICAL_ID },
        data: { name: CANONICAL_NAME, updatedAt: new Date() },
      });
    }
  });

  const verify = await prisma.vendor.findUnique({ where: { id: CANONICAL_ID } });
  const leftover = await prisma.vendor.findUnique({ where: { id: OLD_VENDOR_ID } });
  const jobsNow = await prisma.job.count({ where: { vendorId: CANONICAL_ID } });
  console.log('✅ Unified. Vendor:', verify);
  console.log('   leftover old id:', leftover);
  console.log('   jobs on bradford vendor:', jobsNow);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
