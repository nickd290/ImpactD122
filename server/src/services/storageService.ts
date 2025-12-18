import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(__dirname, '../../uploads/po');

// Ensure uploads/po directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Save PDF to local uploads folder and return public URL
 */
export async function uploadPDF(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFilename = `${Date.now()}-${sanitizedFilename}`;
  const filePath = path.join(UPLOADS_DIR, uniqueFilename);

  fs.writeFileSync(filePath, buffer);

  // Return public URL
  const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
  return `${baseUrl}/uploads/po/${uniqueFilename}`;
}

/**
 * Local storage is always "configured"
 */
export function isR2Configured(): boolean {
  return true;
}
