import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get('/overview', async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      monthIdeas,
      monthAdoptedIdeas,
      monthPublishedNotes,
      notesWithMetrics,
    ] = await Promise.all([
      prisma.idea.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.idea.count({ where: { status: 'ADOPTED', updatedAt: { gte: startOfMonth } } }),
      prisma.publishedNote.count({ where: { publishedAt: { gte: startOfMonth } } }),
      prisma.publishedNote.findMany({
        where: { publishedAt: { gte: startOfMonth } },
        include: {
          metrics: { orderBy: { recordedAt: 'desc' }, take: 1 },
        },
      }),
    ]);

    let totalViews = 0, totalLikes = 0, totalCollects = 0, totalComments = 0;
    let totalNewFollowers = 0, totalDMs = 0, totalOrders = 0, totalOrderAmount = 0, totalPaidAmount = 0;

    for (const note of notesWithMetrics) {
      const latest = note.metrics[0];
      if (latest) {
        totalViews += latest.views || 0;
        totalLikes += latest.likes || 0;
        totalCollects += latest.collects || 0;
        totalComments += latest.comments || 0;
        totalNewFollowers += latest.newFollowers || 0;
        totalDMs += latest.dmCount || 0;
        totalOrders += latest.orders || 0;
        totalOrderAmount += Number(latest.orderAmount || 0);
        totalPaidAmount += Number(latest.paidAmount || 0);
      }
    }

    const totalInteractions = totalLikes + totalCollects + totalComments;

    res.json({
      monthIdeas,
      monthAdoptedIdeas,
      monthPublishedNotes,
      monthViews: totalViews,
      monthLikes: totalLikes,
      monthCollects: totalCollects,
      monthComments: totalComments,
      monthNewFollowers: totalNewFollowers,
      monthDMs: totalDMs,
      monthOrders: totalOrders,
      monthOrderAmount: totalOrderAmount,
      monthPaidAmount: totalPaidAmount,
      avgInteractionRate: totalViews > 0 ? ((totalInteractions / totalViews) * 100).toFixed(2) + '%' : '0.00%',
      avgCollectRate: totalViews > 0 ? ((totalCollects / totalViews) * 100).toFixed(2) + '%' : '0.00%',
      avgDMRate: totalViews > 0 ? ((totalDMs / totalViews) * 100).toFixed(2) + '%' : '0.00%',
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ error: '获取概览失败' });
  }
});

dashboardRouter.get('/weekly', async (req: AuthRequest, res) => {
  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [
      weekIdeas,
      weekAdoptedIdeas,
      weekPublishedNotes,
      weekViews,
    ] = await Promise.all([
      prisma.idea.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.idea.count({ where: { status: 'ADOPTED', updatedAt: { gte: weekAgo } } }),
      prisma.publishedNote.count({ where: { publishedAt: { gte: weekAgo } } }),
      prisma.noteMetric.aggregate({
        where: { recordedAt: { gte: weekAgo } },
        _sum: { views: true },
      }),
    ]);

    res.json({
      weekIdeas,
      weekAdoptedIdeas,
      weekPublishedNotes,
      weekViews: weekViews._sum.views || 0,
    });
  } catch (error) {
    res.status(500).json({ error: '获取周数据失败' });
  }
});

dashboardRouter.get('/trends', async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.recordedAt = {};
      if (startDate) where.recordedAt.gte = new Date(startDate as string);
      if (endDate) where.recordedAt.lte = new Date(endDate as string);
    }

    const metrics = await prisma.noteMetric.findMany({
      where,
      orderBy: { recordedAt: 'asc' },
      select: {
        noteId: true,
        recordedAt: true,
        views: true,
        likes: true,
        collects: true,
        comments: true,
        shares: true,
        dmCount: true,
        orders: true,
        orderAmount: true,
      },
    });

    const latestByNoteAndDate: Record<string, any> = {};
    metrics.forEach((m) => {
      const key = `${m.noteId}_${m.recordedAt.toISOString().split('T')[0]}`;
      if (!latestByNoteAndDate[key] || m.recordedAt > latestByNoteAndDate[key].recordedAt) {
        latestByNoteAndDate[key] = m;
      }
    });

    const grouped: Record<string, any> = {};
    Object.values(latestByNoteAndDate).forEach((m: any) => {
      const date = m.recordedAt.toISOString().split('T')[0];
      if (!grouped[date]) {
        grouped[date] = { date, views: 0, likes: 0, collects: 0, comments: 0, shares: 0, dms: 0, orders: 0, orderAmount: 0 };
      }
      grouped[date].views += m.views || 0;
      grouped[date].likes += m.likes || 0;
      grouped[date].collects += m.collects || 0;
      grouped[date].comments += m.comments || 0;
      grouped[date].shares += m.shares || 0;
      grouped[date].dms += m.dmCount || 0;
      grouped[date].orders += m.orders || 0;
      grouped[date].orderAmount += Number(m.orderAmount || 0);
    });

    res.json(Object.values(grouped));
  } catch (error) {
    res.status(500).json({ error: '获取趋势失败' });
  }
});

dashboardRouter.get('/rankings', async (req: AuthRequest, res) => {
  try {
    const { type = 'views', limit = '10' } = req.query;

    const validTypes = ['views', 'collects', 'dms', 'orders'];
    if (!validTypes.includes(type as string)) {
      return res.status(400).json({ error: '无效的排名类型' });
    }

    const fieldMap: any = { views: 'views', collects: 'collects', dms: 'dmCount', orders: 'orders' };

    const notes = await prisma.publishedNote.findMany({
      include: {
        metrics: { orderBy: { recordedAt: 'desc' }, take: 1 },
        carModelRelation: { include: { brand: true } },
        productRelation: true,
        fragranceRelation: true,
      },
    });

    const ranked = notes
      .map((note) => ({
        id: note.id,
        title: note.finalTitle || note.title,
        carModel: note.carModelRelation?.name,
        brand: note.carModelRelation?.brand?.name,
        product: note.productRelation?.name,
        fragrance: note.fragranceRelation?.name,
        value: note.metrics[0]?.[fieldMap[type as string]] || 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, Number(limit));

    res.json(ranked);
  } catch (error) {
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

dashboardRouter.get('/my-todos', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const myTasks = await prisma.contentTask.findMany({
      where: {
        members: { some: { userId } },
        status: { notIn: ['PUBLISHED', 'COMPLETED'] },
      },
      include: {
        creator: { select: { id: true, name: true } },
        members: { include: { user: { select: { id: true, name: true, role: true } } } },
      },
      orderBy: { finalDeadline: 'asc' },
    });

    const overdueTasks = myTasks.filter((t) => t.finalDeadline && new Date(t.finalDeadline) < today);
    const todayTasks = myTasks.filter(
      (t) => t.finalDeadline && new Date(t.finalDeadline) >= today && new Date(t.finalDeadline) < tomorrow
    );

    const pendingWriting = myTasks.filter((t) => t.status === 'ASSIGNED' || t.status === 'WRITING');
    const pendingModify = myTasks.filter((t) => t.status === 'MODIFYING');
    const pendingDesign = myTasks.filter((t) => t.status === 'PENDING_DESIGN' || t.status === 'DESIGNING');
    const pendingReview = myTasks.filter((t) => t.status === 'PENDING_REVIEW' || t.status === 'PENDING_FINAL');

    const pendingDataFill = await prisma.publishedNote.count({
      where: {
        publishedAt: { lte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        metrics: { none: {} },
      },
    });

    res.json({
      overdueTasks,
      todayTasks,
      pendingWriting,
      pendingModify,
      pendingDesign,
      pendingReview,
      pendingDataFill,
    });
  } catch (error) {
    res.status(500).json({ error: '获取待办失败' });
  }
});
