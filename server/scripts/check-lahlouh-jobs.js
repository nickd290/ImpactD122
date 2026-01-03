const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const lahlouh = await prisma.company.findFirst({
    where: { name: { contains: 'lahlouh', mode: 'insensitive' } }
  });

  if (!lahlouh) {
    console.log('No Lahlouh customer found');
    return;
  }

  console.log('Lahlouh ID:', lahlouh.id);

  const jobs = await prisma.job.findMany({
    where: { customerId: lahlouh.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true, jobNo: true, title: true, customerJobNumber: true,
      customerPONumber: true, mailingVendorId: true, matchType: true,
      mailDate: true, inHomesDate: true, specs: true, notes: true, createdAt: true
    }
  });

  console.log('\nJobs found:', jobs.length);

  for (const j of jobs) {
    console.log('\n===================');
    console.log('Job:', j.jobNo, '-', j.title);
    console.log('Customer Job#:', j.customerJobNumber);
    console.log('PO#:', j.customerPONumber);
    console.log('Created:', j.createdAt);
    console.log('Mailing Vendor ID:', j.mailingVendorId || 'NONE');
    console.log('Match Type:', j.matchType || 'NONE');
    console.log('Mail Date:', j.mailDate || 'NONE');
    console.log('In-Homes Date:', j.inHomesDate || 'NONE');

    const specs = j.specs || {};
    console.log('\nSpecs analysis:');
    console.log('- Has mailing obj:', !!specs.mailing);
    console.log('- mailing.isDirectMail:', specs.mailing?.isDirectMail);
    console.log('- mailing.mailDate:', specs.mailing?.mailDate);
    console.log('- Has timeline obj:', !!specs.timeline);
    console.log('- timeline.mailDate:', specs.timeline?.mailDate);
    console.log('- timeline.inHomesDate:', specs.timeline?.inHomesDate);
    console.log('- Versions count:', specs.versions?.length || 0);
    console.log('- Components count:', specs.components?.length || 0);

    // Check for mailing keywords in notes
    const notes = j.notes || '';
    const mailingKeywords = /mail date|in-homes|in homes|usps|presort|drop date|mailing date/i;
    console.log('- Mailing keywords in notes:', mailingKeywords.test(notes));

    // Check for envelope in components
    const hasEnvelope = specs.components?.some(c =>
      c.name?.toLowerCase().includes('envelope') ||
      c.component?.toLowerCase().includes('envelope')
    );
    console.log('- Has envelope component:', hasEnvelope || false);

    // Would be classified as mailing job?
    const wouldBeMailing = (
      specs.mailing?.isDirectMail === true ||
      specs.timeline?.mailDate ||
      specs.timeline?.inHomesDate ||
      specs.mailing?.mailDate ||
      specs.mailing?.inHomesDate ||
      specs.mailing?.dropLocation ||
      specs.mailing?.mailClass ||
      specs.mailing?.presortType ||
      specs.mailing?.mailProcess ||
      j.matchType ||
      hasEnvelope ||
      mailingKeywords.test(notes)
    );
    console.log('\n>>> WOULD CLASSIFY AS MAILING JOB:', wouldBeMailing);
    console.log('>>> CURRENTLY HAS MAILING VENDOR:', !!j.mailingVendorId);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
