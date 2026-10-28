import { Router } from 'express';
import { deleteConversation, getConversation, listConversations, listMessages } from '../db/index.js';

export const conversationsRouter = Router();

conversationsRouter.get('/', (_req, res) => {
  res.json(listConversations());
});

conversationsRouter.get('/:id', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json({ ...conversation, messages: listMessages(conversation.id) });
});

conversationsRouter.delete('/:id', (req, res) => {
  deleteConversation(req.params.id);
  res.status(204).end();
});
