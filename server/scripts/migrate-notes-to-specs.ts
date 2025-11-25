import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ParsedSpecs {
  productType?: string;
  colors?: string;
  coating?: string;
  finishing?: string;
  flatSize?: string;
  finishedSize?: string;
  paperType?: string;
  pageCount?: number;
  bindingStyle?: string;
  coverType?: string;
  coverPaperType?: string;
}

function parseNotesToSpecs(notes: string): ParsedSpecs | null {
  if (!notes || notes.trim() === '') {
    return null;
  }

  const specs: ParsedSpecs = {};

  try {
    // Try to parse as JSON first
    const jsonMatch = notes.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[0]);

      // Map JSON fields to specs
      if (jsonData.paperType || jsonData.paper) {
        specs.paperType = jsonData.paperType || jsonData.paper;
      }
      if (jsonData.colors) {
        specs.colors = typeof jsonData.colors === 'number'
          ? jsonData.colors.toString()
          : jsonData.colors;
      }
      if (jsonData.size || jsonData.foldedSize) {
        specs.finishedSize = jsonData.size || jsonData.foldedSize;
      }
      if (jsonData.flatSize) {
        specs.flatSize = jsonData.flatSize;
      }
      if (jsonData.finishing) {
        specs.finishing = jsonData.finishing;
      }
      if (jsonData.bindery) {
        specs.finishing = specs.finishing
          ? `${specs.finishing}, ${jsonData.bindery}`
          : jsonData.bindery;
      }

      // Extract coating from finishing or notes
      const finishingLower = (specs.finishing || '').toLowerCase();
      if (finishingLower.includes('gloss') || finishingLower.includes('aqueous')) {
        specs.coating = 'Gloss Aqueous';
      } else if (finishingLower.includes('matte')) {
        specs.coating = 'Matte';
      } else if (finishingLower.includes('uv')) {
        specs.coating = 'UV Coating';
      }
    }
  } catch (e) {
    // Not JSON, try to parse as plain text
  }

  // Parse plain text notes for common patterns
  const text = notes.toLowerCase();

  // Extract paper type from plain text
  if (!specs.paperType) {
    const paperMatch = notes.match(/(\d+#?\s*(?:gloss|matte|uncoated|dull|silk)\s*(?:text|cover|cardstock))/i);
    if (paperMatch) {
      specs.paperType = paperMatch[1];
    }
  }

  // Extract colors from plain text
  if (!specs.colors) {
    const colorsMatch = notes.match(/(\d\/\d)/);
    if (colorsMatch) {
      specs.colors = colorsMatch[1];
    }
  }

  // Extract size from plain text
  if (!specs.finishedSize) {
    const sizeMatch = notes.match(/(\d+\.?\d*\s*x\s*\d+\.?\d*)/i);
    if (sizeMatch) {
      specs.finishedSize = sizeMatch[1];
    }
  }

  // Detect product type
  if (text.includes('self mailer') || text.includes('selfmailer')) {
    specs.productType = 'FOLDED';
  } else if (text.includes('postcard')) {
    specs.productType = 'FLAT';
  } else if (text.includes('book') || text.includes('booklet') || text.includes('manual')) {
    specs.productType = 'BOOK';

    // Try to extract page count for books
    const pageMatch = notes.match(/(\d+)\s*page/i);
    if (pageMatch) {
      specs.pageCount = parseInt(pageMatch[1]);
    }

    // Detect binding
    if (text.includes('saddle') || text.includes('stitch')) {
      specs.bindingStyle = 'Saddle Stitch';
    } else if (text.includes('perfect')) {
      specs.bindingStyle = 'Perfect Bound';
    }
  } else {
    specs.productType = 'OTHER';
  }

  // Return null if no specs were extracted
  return Object.keys(specs).length > 0 ? specs : null;
}

async function migrateNotesToSpecs() {
  console.log('🔍 Finding jobs with notes but no specs...\n');

  const jobsWithNotes = await prisma.job.findMany({
    where: {
      notes: {
        not: '',
      },
      specs: null,
    },
    select: {
      id: true,
      title: true,
      notes: true,
    },
  });

  console.log(`Found ${jobsWithNotes.length} jobs to migrate\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const job of jobsWithNotes) {
    try {
      const specs = parseNotesToSpecs(job.notes);

      if (specs) {
        await prisma.jobSpecs.create({
          data: {
            jobId: job.id,
            productType: specs.productType || 'OTHER',
            colors: specs.colors || null,
            coating: specs.coating || null,
            finishing: specs.finishing || null,
            flatSize: specs.flatSize || null,
            finishedSize: specs.finishedSize || null,
            paperType: specs.paperType || null,
            pageCount: specs.pageCount || null,
            bindingStyle: specs.bindingStyle || null,
            coverType: specs.coverType || null,
            coverPaperType: specs.coverPaperType || null,
          },
        });

        console.log(`✅ ${job.title}`);
        console.log(`   Paper: ${specs.paperType || 'N/A'}`);
        console.log(`   Size: ${specs.finishedSize || 'N/A'}`);
        console.log(`   Colors: ${specs.colors || 'N/A'}`);
        console.log(`   Type: ${specs.productType || 'OTHER'}\n`);
        successCount++;
      } else {
        console.log(`⏭️  Skipped: ${job.title} (no parseable specs)\n`);
        skipCount++;
      }
    } catch (error: any) {
      console.error(`❌ Error migrating ${job.title}: ${error.message}\n`);
      errorCount++;
    }
  }

  console.log('\n📊 Migration Summary:');
  console.log(`   ✅ Successfully migrated: ${successCount}`);
  console.log(`   ⏭️  Skipped (no specs): ${skipCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📝 Total processed: ${jobsWithNotes.length}`);
}

migrateNotesToSpecs()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('Migration failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
