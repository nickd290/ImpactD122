import { Router } from 'express';
import { parseSpecs, parsePO, generateEmail } from '../controllers/aiController';
import { upload } from '../middleware/upload';

const router = Router();

router.post('/parse-specs', parseSpecs);
router.post('/parse-po', upload.single('file'), parsePO);
router.post('/generate-email', generateEmail);

export default router;
