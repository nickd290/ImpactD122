import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  getJobFiles,
  uploadJobFile,
  deleteJobFile,
  downloadFile,
} from '../controllers/filesController';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads/');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for job file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow almost any file type - be permissive for artwork and documents
  const blockedExtensions = /exe|bat|cmd|sh|ps1|msi|dll|sys/i;
  const extname = path.extname(file.originalname).toLowerCase();

  if (blockedExtensions.test(extname)) {
    cb(new Error('Executable files are not allowed'));
  } else {
    return cb(null, true);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 250 * 1024 * 1024, // 250MB — print packages can be large (Shaw-style)
    files: 20,
  },
  fileFilter: fileFilter
});

// Job file routes — accept single `file` or multi `files[]`
router.get('/jobs/:jobId/files', getJobFiles);
router.post(
  '/jobs/:jobId/files',
  (req, res, next) => {
    // Prefer multi-field; fall back to single
    const multi = upload.array('files', 20);
    multi(req, res, (err) => {
      if (err) return next(err);
      if (req.files && (req.files as Express.Multer.File[]).length > 0) return next();
      upload.single('file')(req, res, next);
    });
  },
  uploadJobFile
);
router.delete('/jobs/:jobId/files/:fileId', deleteJobFile);

// General file download
router.get('/files/:fileId/download', downloadFile);

export default router;
