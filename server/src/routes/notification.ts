import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { isRead, page = '1', pageSize = '20' } = req.query;

    const where: any = { userId: req.user!.id };
    if (isRead !== undefined) {
      where.isRead = isRead === 'true';
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId: req.user!.id, isRead: false },
      }),
    ]);

    res.json({ notifications, total, unreadCount, page: Number(page), pageSize: Number(pageSize) });
  } catch (error) {
    res.status(500).json({ error: '获取通知失败' });
  }
});

notificationRouter.put('/:id/read', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { id, userId: req.user!.id },
      data: { isRead: true },
    });

    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: '标记已读失败' });
  }
});

notificationRouter.put('/read-all', async (req: AuthRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: '已全部标记已读' });
  } catch (error) {
    res.status(500).json({ error: '标记已读失败' });
  }
});

notificationRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.notification.delete({
      where: { id, userId: req.user!.id },
    });

    res.json({ message: '通知已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除通知失败' });
  }
});
