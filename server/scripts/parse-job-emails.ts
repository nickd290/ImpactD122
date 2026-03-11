/**
 * Email Parser for Job Data Extraction
 *
 * Parses emails from customers to extract job details:
 * - Lahlouh: Structured subjects with PO#, JOB#, quantity, description
 * - JJS&A: PO numbers and job descriptions
 * - Ballantine: Quickbase PO notifications
 *
 * Output: JSON file with extracted job data for matching
 *
 * Usage:
 *   cd ~/impact-direct/server
 *   npx tsx scripts/parse-job-emails.ts
 */

import * as fs from 'fs';

// Types for parsed email data
interface ParsedJob {
  source: 'lahlouh' | 'jjsa' | 'ballantine' | 'other';
  customerPO?: string;
  customerJobNo?: string;
  quantity?: number;
  description?: string;
  dueDate?: string;
  size?: string;
  emailSubject: string;
  emailDate: string;
  emailFrom: string;
  emailId: string;
}

// Lahlouh email subject patterns
// Example: "LAHLOUH BLUE ASH (PO# OHP13794 & FILES) JOB# OH175514 - 5,025 QTY PI'S PRINT & FOLD (DUE BY 1/22/26 EOD)"
// Example: "LAHLOUH OHIO (PO# OHP13572 & LINK TO FILES) JOB# OH174382 - BLUE SHIELD- SECURE MONTHLY MAILING"
function parseLahlouhSubject(subject: string): Partial<ParsedJob> {
  const result: Partial<ParsedJob> = { source: 'lahlouh' };

  // Extract PO number: PO# OHP13794 or PO# CAP13531
  const poMatch = subject.match(/PO#\s*([A-Z]{2,3}P?\d+)/i);
  if (poMatch) {
    result.customerPO = poMatch[1];
  }

  // Extract Job number: JOB# OH175514 or J# OH175514 or JOB# CA175030
  const jobMatch = subject.match(/(?:JOB#|J#)\s*([A-Z]{2}\d+)/i);
  if (jobMatch) {
    result.customerJobNo = jobMatch[1];
  }

  // Extract quantity: "5,025 QTY" or "5025 QTY"
  const qtyMatch = subject.match(/([\d,]+)\s*QTY/i);
  if (qtyMatch) {
    result.quantity = parseInt(qtyMatch[1].replace(/,/g, ''), 10);
  }

  // Extract due date: "DUE BY 1/22/26" or "DUE 1/15/26"
  const dueMatch = subject.match(/DUE\s*(?:BY\s*)?([\d\/]+)/i);
  if (dueMatch) {
    result.dueDate = dueMatch[1];
  }

  // Extract description - text after JOB# XXX -
  const descMatch = subject.match(/JOB#\s*[A-Z]{2}\d+\s*-\s*(.+?)(?:\s*\(DUE|\s*$)/i);
  if (descMatch) {
    let desc = descMatch[1].trim();
    // Clean up the description
    desc = desc.replace(/[\d,]+\s*QTY\s*/i, '').trim();
    desc = desc.replace(/\s+/g, ' ');
    if (desc) {
      result.description = desc;
    }
  }

  // Extract size if present: "6X9", "8.5X11", etc.
  const sizeMatch = subject.match(/(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)/);
  if (sizeMatch) {
    result.size = `${sizeMatch[1]}x${sizeMatch[2]}`;
  }

  return result;
}

// JJS&A email subject patterns
// Example: "PO#44495" or "PO 44430" or "NW FEB. OVERSIZED POSTCARD PO#44430"
function parseJJSASubject(subject: string): Partial<ParsedJob> {
  const result: Partial<ParsedJob> = { source: 'jjsa' };

  // Extract PO number: PO#44495 or PO 44430
  const poMatch = subject.match(/PO\s*#?\s*(\d+(?:\.\d+)?)/i);
  if (poMatch) {
    result.customerPO = poMatch[1];
  }

  // Extract description - everything before PO# or after it
  let desc = subject;
  desc = desc.replace(/(?:RE:|FW:)\s*/gi, '').trim();
  desc = desc.replace(/PO\s*#?\s*\d+(?:\.\d+)?/gi, '').trim();
  if (desc && desc.length > 3) {
    result.description = desc;
  }

  return result;
}

// Ballantine email subject patterns
// Example: "PO for Years of Ripening Buckslip (Reprint)"
// Example: "PO for Q2 Buckslip (2026)"
// Example: "PO for GOH-01/15/26-NS"
function parseBallantineSubject(subject: string): Partial<ParsedJob> {
  const result: Partial<ParsedJob> = { source: 'ballantine' };

  // Extract description from "PO for XXX"
  const poForMatch = subject.match(/PO\s+for\s+(.+)/i);
  if (poForMatch) {
    result.description = poForMatch[1].trim();

    // Check if it's a date-based code like "GOH-01/15/26-NS" or "AHI-01/09/26-NS"
    const codeMatch = result.description.match(/^([A-Z]{2,3})-(\d{2}\/\d{2}\/\d{2})-([A-Z]+)$/);
    if (codeMatch) {
      result.customerJobNo = codeMatch[1];
      result.dueDate = codeMatch[2];
    }
  }

  // Check for Change Order subjects
  if (subject.includes('Change Order')) {
    const coMatch = subject.match(/(\d+-\d+(?:\.\d+)?)\s*\|\s*(.+)/);
    if (coMatch) {
      result.customerJobNo = coMatch[1];
      result.description = coMatch[2].trim();
    }
  }

  return result;
}

// Main parser function
function parseEmailSubject(subject: string, from: string): Partial<ParsedJob> {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Determine source and parse accordingly
  if (fromLower.includes('lahlouh')) {
    // Check if it's a Lahlouh job email (has PO# or JOB# pattern)
    if (subjectLower.includes('po#') || subjectLower.includes('job#') || subjectLower.includes('j#')) {
      return parseLahlouhSubject(subject);
    }
    return { source: 'lahlouh', description: subject };
  }

  if (fromLower.includes('jjsainc') || fromLower.includes('jjs')) {
    return parseJJSASubject(subject);
  }

  if (fromLower.includes('ballantine') || fromLower.includes('jdgraphic')) {
    return parseBallantineSubject(subject);
  }

  return { source: 'other', description: subject };
}

// Test the parsers with sample subjects
function testParsers() {
  const testCases = [
    {
      subject: 'LAHLOUH BLUE ASH (PO# OHP13794 & FILES) JOB# OH175514 - 5,025 QTY PI\'S PRINT & FOLD (DUE BY 1/22/26 EOD)',
      from: 'Samantha.Lolo@lahlouh.com'
    },
    {
      subject: 'LAHLOUH OHIO (PO# OHP13572 & LINK TO FILES) JOB# OH174382 - BLUE SHIELD- SECURE MONTHLY MAILING (Blue Shield of California BSC0223 NTM26 Q1 AGE-IN 64.0 (JAN) 6X9 DM)',
      from: 'Samantha.Lolo@lahlouh.com'
    },
    {
      subject: 'Re: Lahlouh Ohio (PO# OHP13729, ART FILES & DATA+TRAY TAGS+PALLET FLAGS FOR MAIL DROP #1) JOB# OH175367 (DROP# 1 DUE 1/15/26)',
      from: 'Samantha.Lolo@lahlouh.com'
    },
    {
      subject: 'PO#44495',
      from: 'Lorie@jjsainc.com'
    },
    {
      subject: 'NW FEB. OVERSIZED POSTCARD PO#44430',
      from: 'Lorie@jjsainc.com'
    },
    {
      subject: 'PO for Years of Ripening Buckslip (Reprint)',
      from: 'ballantine@jdgraphic.com'
    },
    {
      subject: 'PO for GOH-01/15/26-NS',
      from: 'ballantine@jdgraphic.com'
    },
    {
      subject: 'Change Order Approved by Ballantine for 34750-54028.3 | February Prayer Cards',
      from: 'ballantine@jdgraphic.com'
    },
  ];

  console.log('=== Email Parser Test Results ===\n');

  for (const tc of testCases) {
    const parsed = parseEmailSubject(tc.subject, tc.from);
    console.log('Subject:', tc.subject.substring(0, 80) + (tc.subject.length > 80 ? '...' : ''));
    console.log('From:', tc.from);
    console.log('Parsed:', JSON.stringify(parsed, null, 2));
    console.log('---\n');
  }
}

// Export for use
export { parseEmailSubject, ParsedJob, parseLahlouhSubject, parseJJSASubject, parseBallantineSubject };

// Run test if executed directly
if (require.main === module) {
  testParsers();
}
