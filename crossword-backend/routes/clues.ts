import { Router } from 'express';
import { getCrosswordClues } from '../utils/openai';

const router = Router();

// Transcribe clues from image
router.post('/from-image', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const base64Image = image.replace(/^data:image\/\w+;base64,/, '');

  try {
    const clues = await getCrosswordClues(base64Image);
    res.json(clues);
  } catch (error: any) {
    console.error('Error transcribing clues:', error);
    res.status(500).json({ error: 'Failed to transcribe clues', details: error.message });
  }
});

export default router;
