import { Router } from 'express';
import { submitMailerIntake } from '../controllers/intakeController';

const router = Router();

// Public route - new mailer intake form submission (no auth)
router.post('/intake/mailer', submitMailerIntake);

export default router;
