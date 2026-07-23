import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

export const noteRouter = Router();

noteRouter.use(authenticate);

noteRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const {
      productId,
      carModelId,
      fragranceId,
      writerId,
      accountId,
      keyword,
      startDate,
      endDate,
      page = '1',
      pageSize = '20',
    } = req.query;

    const where: any = {};

    if (productId) where.productId = productId;
    if (carModelId) where.carModelId = carModelId;
    if (fragranceId) where.fragranceId = fragranceId;
    if (writerId) where.writerId = writerId;
    if (accountId) where.accountId = accountId;

    if (keyword) {
      where.OR = [
        { title: { contains: keyword as string } },
        { finalTitle: { contains: keyword as string } },
      ];
    }

    if (startDate || endDate) {
      where.publishedAt = {};
      if (startDate) where.publishedAt.gte = new Date(startDate as string);
      if (endDate) where.publishedAt.lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [notes, total] = await Promise.all([
      prisma.publishedNote.findMany({
        where,
        skip,
        take: Number(pageSize),
        orderBy: { publishedAt: 'desc' },
        include: {
          account: true,
          product: { select: { id: true, name: true } },
          carModel: { select: { id: true, name: true, brand: true } },
          fragrance: { select: { id: true, name: true } },
          metrics: { orderBy: { recordedAt: 'desc' }, take: 1 },
        },
      }),
      prisma.publishedNote.count({ where }),
    ]);

    res.json({ notes, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (error) {
    console.error('List notes error:', error);
    res.status(500).json({ error: '获取笔记列表失败' });
  }
});

noteRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const note = await prisma.publishedNote.findUnique({
      where: { id },
      include: {
        account: true,
        product: true,
        carModel: { include: { brand: true } },
        fragrance: true,
        task: { select: { id: true, title: true } },
        idea: { select: { id: true, title: true } },
        metrics: { orderBy: { recordedAt: 'desc' } },
      },
    });

    if (!note) {
      return res.status(404).json({ error: '笔记不存在' });
    }

    res.json(note);
  } catch (error) {
    res.status(500).json({ error: '获取笔记详情失败' });
  }
});

noteRouter.post('/', requireRole('ADMIN', 'CONTENT_MANAGER', 'DATA_OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const {
      title,
      url,
      accountId,
      publishedAt,
      contentType,
      taskId,
      ideaId,
      productId,
      carModelId,
      fragranceId,
      writerId,
      designerId,
      publisherId,
      finalTitle,
      finalContent,
      finalCover,
      usedMaterials,
      titleStructure,
      coverType,
      isPaid,
      paidAmount,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: '笔记标题不能为空' });
    }

    const note = await prisma.publishedNote.create({
      data: {
        title,
        url,
        accountId,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        contentType,
        taskId,
        ideaId,
        productId,
        carModelId,
        fragranceId,
        writerId,
        designerId,
        publisherId,
        finalTitle,
        finalContent,
        finalCover,
        usedMaterials,
        titleStructure,
        coverType,
        isPaid: isPaid || false,
        paidAmount,
      },
    });

    res.status(201).json(note);
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: '创建笔记失败' });
  }
});

noteRouter.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      url,
      accountId,
      publishedAt,
      contentType,
      productId,
      carModelId,
      fragranceId,
      writerId,
      designerId,
      publisherId,
      finalTitle,
      finalContent,
      finalCover,
      usedMaterials,
      titleStructure,
      coverType,
      isPaid,
      paidAmount,
    } = req.body;

    const note = await prisma.publishedNote.update({
      where: { id },
      data: {
        title,
        url,
        accountId,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
        contentType,
        productId,
        carModelId,
        fragranceId,
        writerId,
        designerId,
        publisherId,
        finalTitle,
        finalContent,
        finalCover,
        usedMaterials,
        titleStructure,
        coverType,
        isPaid,
        paidAmount,
      },
    });

    res.json(note);
  } catch (error) {
    res.status(500).json({ error: '更新笔记失败' });
  }
});

noteRouter.post('/:id/metrics', requireRole('ADMIN', 'CONTENT_MANAGER', 'DATA_OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      views,
      likes,
      collects,
      comments,
      shares,
      newFollowers,
      profileVisits,
      私信数,
      productClicks,
      cartAdds,
      orders,
      orderAmount,
      refunds,
      paidAmount,
      screenshot,
      highFreqQuestions,
      userFeedback,
      abnormalNote,
    } = req.body;

    const metric = await prisma.noteMetric.create({
      data: {
        noteId: id,
        views: views || 0,
        likes: likes || 0,
        collects: collects || 0,
        comments: comments || 0,
        shares: shares || 0,
        newFollowers: newFollowers || 0,
        profileVisits: profileVisits || 0,
        私信数: 私信数 || 0,
        productClicks: productClicks || 0,
        cartAdds: cartAdds || 0,
        orders: orders || 0,
        orderAmount,
        refunds: refunds || 0,
        paidAmount,
        screenshot,
        highFreqQuestions,
        userFeedback,
        abnormalNote,
      },
    });

    res.status(201).json(metric);
  } catch (error) {
    res.status(500).json({ error: '记录数据失败' });
  }
});

noteRouter.get('/:id/metrics', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const metrics = await prisma.noteMetric.findMany({
      where: { noteId: id },
      orderBy: { recordedAt: 'desc' },
    });

    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: '获取数据失败' });
  }
});

noteRouter.get('/:id/analysis', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const metrics = await prisma.noteMetric.findMany({
      where: { noteId: id },
      orderBy: { recordedAt: 'asc' },
    });

    if (metrics.length === 0) {
      return res.json({ metrics: [], calculated: null });
    }

    const latest = metrics[metrics.length - 1];
    const views = latest.views || 1;

    const calculated = {
      interactionRate: ((latest.likes + latest.collects + latest.comments + latest.shares) / views * 100).toFixed(2) + '%',
      likeRate: (latest.likes / views * 100).toFixed(2) + '%',
      collectRate: (latest.collects / views * 100).toFixed(2) + '%',
      commentRate: (latest.comments / views * 100).toFixed(2) + '%',
      followRate: (latest.newFollowers / views * 100).toFixed(2) + '%',
      dmRate: (latest.私信数 / views * 100).toFixed(2) + '%',
      productClickRate: (latest.productClicks / views * 100).toFixed(2) + '%',
      orderRate: (latest.orders / views * 100).toFixed(2) + '%',
      dmCost: latest.私信数 > 0 ? (Number(latest.paidAmount || 0) / latest.私信数).toFixed(2) : '0.00',
      orderCost: latest.orders > 0 ? (Number(latest.paidAmount || 0) / latest.orders).toFixed(2) : '0.00',
      roi: latest.paidAmount && Number(latest.paidAmount) > 0 && latest.orderAmount
        ? (Number(latest.orderAmount) / Number(latest.paidAmount)).toFixed(2)
        : '0.00',
    };

    res.json({ metrics, calculated });
  } catch (error) {
    res.status(500).json({ error: '分析失败' });
  }
});

noteRouter.delete('/:id', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.publishedNote.delete({ where: { id } });

    res.json({ message: '笔记已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除笔记失败' });
  }
});

noteRouter.get('/accounts/list', async (req: AuthRequest, res) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: '获取账号列表失败' });
  }
});

noteRouter.post('/accounts', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { name, platform } = req.body;

    if (!name) {
      return res.status(400).json({ error: '账号名称不能为空' });
    }

    const account = await prisma.socialAccount.create({
      data: { name, platform: platform || 'XIAOHONGSHU' },
    });

    res.status(201).json(account);
  } catch (error) {
    res.status(500).json({ error: '创建账号失败' });
  }
});
