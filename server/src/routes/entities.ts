import { Router } from 'express';
import {
  getAllEntities,
  getEntity,
  createEntity,
  updateEntity,
  deleteEntity,
} from '../controllers/entitiesController';

const router = Router();

router.get('/', getAllEntities);
router.get('/:id', getEntity);
router.post('/', createEntity);
router.put('/:id', updateEntity);
router.delete('/:id', deleteEntity);

export default router;
