import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

export const ideaRouter = Router();

ideaRouter.use(authenticate);

ideaRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const {
      status,
      contentType,
      productId,
      carModelId,
      priority,
      createdById,
      keyword,
      page = '1',
      pageSize = '20',
    } = req.query;

    const where: any = {};

    if (status) where.status = status;
    if (contentType) where.contentType = contentType;
    if (productId) where.productId = productId;
    if (carModelId) where.carModelId = carModelId;
    if (priority) where.priority = priority;
    if (createdById) where.createdById = createdById;

    if (keyword) {
      where.OR = [
        { title: { contains: keyword as string } },
        { summary: { contains: keyword as string } },
        { titleIdeas: { contains: keyword as string } },
      ];
    }

    if (req.user!.role === 'MEMBER') {
      where.createdById = req.user!.id;
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [ideas, total] = await Promise.all([
      prisma.idea.findMany({
        where,
        skip,
        take: Number(pageSize),
        orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        include: {
          creator: { select: { id: true, name: true, avatar: true } },
          product: { select: { id: true, name: true } },
          carModel: { select: { id: true, name: true, brand: true } },
          fragrance: { select: { id: true, name: true } },
          _count: { select: { votes: true, comments: true } },
        },
      }),
      prisma.idea.count({ where }),
    ]);

    res.json({ ideas, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (error) {
    console.error('List ideas error:', error);
    res.status(500).json({ error: '获取选题列表失败' });
  }
});

ideaRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const idea = await prisma.idea.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        product: true,
        carModel: { include: { brand: true } },
        fragrance: true,
        comments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
        },
        votes: { select: { userId: true } },
        attachments: true,
      },
    });

    if (!idea) {
      return res.status(404).json({ error: '选题不存在' });
    }

    res.json(idea);
  } catch (error) {
    res.status(500).json({ error: '获取选题详情失败' });
  }
});

ideaRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      title,
      summary,
      contentType,
      contentGoal,
      targetUser,
      productId,
      carModelId,
      fragranceId,
      scene,
      painPoint,
      corePoint,
      titleIdeas,
      coverIdeas,
      contentStart,
      refUrl,
      refImages,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: '选题名称不能为空' });
    }

    const idea = await prisma.idea.create({
      data: {
        title,
        summary,
        contentType,
        contentGoal,
        targetUser,
        productId,
        carModelId,
        fragranceId,
        scene,
        painPoint,
        corePoint,
        titleIdeas,
        coverIdeas,
        contentStart,
        refUrl,
        refImages,
        createdById: req.user!.id,
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
      },
    });

    res.status(201).json(idea);
  } catch (error) {
    console.error('Create idea error:', error);
    res.status(500).json({ error: '创建选题失败' });
  }
});

ideaRouter.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      summary,
      contentType,
      contentGoal,
      targetUser,
      productId,
      carModelId,
      fragranceId,
      scene,
      painPoint,
      corePoint,
      titleIdeas,
      coverIdeas,
      contentStart,
      refUrl,
      refImages,
    } = req.body;

    const existing = await prisma.idea.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '选题不存在' });
    }

    if (existing.createdById !== req.user!.id && req.user!.role === 'MEMBER') {
      return res.status(403).json({ error: '只能编辑自己的选题' });
    }

    const idea = await prisma.idea.update({
      where: { id },
      data: {
        title,
        summary,
        contentType,
        contentGoal,
        targetUser,
        productId,
        carModelId,
        fragranceId,
        scene,
        painPoint,
        corePoint,
        titleIdeas,
        coverIdeas,
        contentStart,
        refUrl,
        refImages,
      },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        product: { select: { id: true, name: true } },
        carModel: { select: { id: true, name: true, brand: true } },
      },
    });

    res.json(idea);
  } catch (error) {
    console.error('Update idea error:', error);
    res.status(500).json({ error: '更新选题失败' });
  }
});

ideaRouter.post('/:id/score', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { userDemand, productRelevance, visualPerformance, novelty, conversionPotential, materialCompleteness } = req.body;

    const totalScore = userDemand + productRelevance + visualPerformance + novelty + conversionPotential + materialCompleteness;

    let priority: string;
    if (totalScore >= 25) priority = 'S';
    else if (totalScore >= 20) priority = 'A';
    else if (totalScore >= 15) priority = 'B';
    else priority = 'C';

    const idea = await prisma.idea.update({
      where: { id },
      data: {
        score: totalScore,
        priority,
        reviewerId: req.user!.id,
      },
    });

    res.json({ ...idea, totalScore, priority });
  } catch (error) {
    res.status(500).json({ error: '评分失败' });
  }
});

ideaRouter.post('/:id/review', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNote } = req.body;

    const validStatuses = ['PENDING', 'ADOPTED', 'REJECTED', 'NEED_MORE', 'POSTPONED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '无效的状态' });
    }

    const idea = await prisma.idea.update({
      where: { id },
      data: { status, reviewNote, reviewerId: req.user!.id },
      include: {
        creator: { select: { id: true, name: true } },
      },
    });

    if (status === 'ADOPTED') {
      await prisma.notification.create({
        data: {
          userId: idea.createdById,
          type: 'IDEA_ADOPTED',
          title: '选题已通过',
          content: `您的选题"${idea.title}"已通过审核`,
          link: `/ideas/${idea.id}`,
        },
      });
    }

    res.json(idea);
  } catch (error) {
    res.status(500).json({ error: '审核失败' });
  }
});

ideaRouter.post('/:id/vote', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.ideaVote.findUnique({
      where: { ideaId_userId: { ideaId: id, userId: req.user!.id } },
    });

    if (existing) {
      await prisma.ideaVote.delete({
        where: { ideaId_userId: { ideaId: id, userId: req.user!.id } },
      });
      res.json({ voted: false });
    } else {
      await prisma.ideaVote.create({
        data: { ideaId: id, userId: req.user!.id },
      });
      res.json({ voted: true });
    }
  } catch (error) {
    res.status(500).json({ error: '投票失败' });
  }
});

ideaRouter.post('/:id/comments', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: '评论内容不能为空' });
    }

    const comment = await prisma.ideaComment.create({
      data: {
        content,
        ideaId: id,
        userId: req.user!.id,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    res.status(500).json({ error: '评论失败' });
  }
});

ideaRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.idea.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '选题不存在' });
    }

    if (existing.createdById !== req.user!.id && req.user!.role === 'MEMBER') {
      return res.status(403).json({ error: '只能删除自己的选题' });
    }

    await prisma.idea.delete({ where: { id } });

    res.json({ message: '选题已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除选题失败' });
  }
});
