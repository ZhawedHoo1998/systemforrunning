import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

export const taskRouter = Router();

const TASK_STATUSES = [
  'PENDING', 'ASSIGNED', 'WRITING', 'PENDING_REVIEW', 'MODIFYING',
  'CONTENT_APPROVED', 'PENDING_DESIGN', 'DESIGNING', 'PENDING_FINAL',
  'PENDING_PUBLISH', 'PUBLISHED', 'PENDING_REVIEW_DATA', 'COMPLETED'
];

taskRouter.use(authenticate);

taskRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, priority, writerId, creatorId, keyword, page = '1', pageSize = '20' } = req.query;
    const where: any = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (keyword) {
      where.OR = [
        { title: { contains: keyword as string } },
        { finalTitle: { contains: keyword as string } },
      ];
    }
    if (writerId) where.members = { some: { userId: writerId, role: 'WRITER' } };
    if (creatorId) where.creatorId = creatorId;
    if (req.user!.role === 'WRITER') {
      where.members = { some: { userId: req.user!.id } };
    }

    const skip = (Number(page) - 1) * Number(pageSize);
    const [tasks, total] = await Promise.all([
      prisma.contentTask.findMany({
        where,
        skip,
        take: Number(pageSize),
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          creator: { select: { id: true, name: true, avatar: true } },
          idea: { select: { id: true, title: true } },
          productRelation: { select: { id: true, name: true } },
          carModelRelation: { select: { id: true, name: true, brand: true } },
          members: { include: { user: { select: { id: true, name: true, avatar: true, role: true } } } },
        },
      }),
      prisma.contentTask.count({ where }),
    ]);

    res.json({ tasks, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (error) {
    console.error('List tasks error:', error);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

taskRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const task = await prisma.contentTask.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        idea: true,
        productRelation: true,
        carModelRelation: { include: { brand: true } },
        members: { include: { user: { select: { id: true, name: true, avatar: true, role: true } } } },
        materials: { include: { material: true } },
        statusLogs: { include: { operator: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
        contentVersions: { orderBy: { version: 'desc' } },
        reviews: true,
      },
    });
    if (!task) return res.status(404).json({ error: '任务不存在' });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

taskRouter.post('/', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { title, ideaId, contentType, productId, carModelId, priority, planPublishAt, writingDeadline, designDeadline, finalDeadline, writerId, designerId, materialIds } = req.body;

    if (!title) return res.status(400).json({ error: '任务名称不能为空' });

    const task = await prisma.contentTask.create({
      data: {
        title,
        ideaId,
        contentType,
        productId,
        carModelId,
        priority: priority || 'NORMAL',
        planPublishAt: planPublishAt ? new Date(planPublishAt) : null,
        writingDeadline: writingDeadline ? new Date(writingDeadline) : null,
        designDeadline: designDeadline ? new Date(designDeadline) : null,
        finalDeadline: finalDeadline ? new Date(finalDeadline) : null,
        creatorId: req.user!.id,
      },
    });

    const memberData = [];
    if (writerId) memberData.push({ taskId: task.id, userId: writerId, role: 'WRITER' });
    if (designerId) memberData.push({ taskId: task.id, userId: designerId, role: 'DESIGNER' });
    if (memberData.length > 0) await prisma.taskMember.createMany({ data: memberData });

    if (materialIds?.length > 0) {
      for (const materialId of materialIds) {
        await prisma.taskMaterial.create({ data: { taskId: task.id, materialId } });
      }
    }

    await prisma.taskStatusLog.create({
      data: { taskId: task.id, fromStatus: null, toStatus: 'PENDING', operatorId: req.user!.id, note: '创建任务' },
    });

    if (ideaId) await prisma.idea.update({ where: { id: ideaId }, data: { status: 'TASK_CREATED' } });

    const result = await prisma.contentTask.findUnique({
      where: { id: task.id },
      include: { creator: { select: { id: true, name: true, avatar: true } }, members: { include: { user: { select: { id: true, name: true, avatar: true, role: true } } } } },
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: '创建任务失败' });
  }
});

taskRouter.put('/:id', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { title, contentType, productId, carModelId, priority, planPublishAt, writingDeadline, designDeadline, finalDeadline, finalTitle, altTitles, content, coverText, hashtags, materialIds } = req.body;

    const existing = await prisma.contentTask.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '任务不存在' });

    const task = await prisma.contentTask.update({
      where: { id },
      data: {
        title, contentType, productId, carModelId, priority,
        planPublishAt: planPublishAt ? new Date(planPublishAt) : null,
        writingDeadline: writingDeadline ? new Date(writingDeadline) : null,
        designDeadline: designDeadline ? new Date(designDeadline) : null,
        finalDeadline: finalDeadline ? new Date(finalDeadline) : null,
        finalTitle, altTitles, content, coverText, hashtags,
      },
    });

    if (materialIds !== undefined) {
      await prisma.taskMaterial.deleteMany({ where: { taskId: id } });
      for (const materialId of materialIds) {
        await prisma.taskMaterial.create({ data: { taskId: id, materialId } });
      }
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: '更新任务失败' });
  }
});

taskRouter.put('/:id/status', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!TASK_STATUSES.includes(status)) return res.status(400).json({ error: '无效的状态' });

    const existing = await prisma.contentTask.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '任务不存在' });

    const task = await prisma.contentTask.update({ where: { id }, data: { status } });

    await prisma.taskStatusLog.create({
      data: { taskId: id, fromStatus: existing.status, toStatus: status, operatorId: req.user!.id, note },
    });

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: '更新状态失败' });
  }
});

taskRouter.post('/:id/submit', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { title, content, changeNote } = req.body;

    const existing = await prisma.contentTask.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!existing) return res.status(404).json({ error: '任务不存在' });

    const isAssignedWriter = existing.members.some(m => m.userId === req.user!.id && m.role === 'WRITER');
    const isManager = ['ADMIN', 'CONTENT_MANAGER'].includes(req.user!.role);
    if (!isAssignedWriter && !isManager) return res.status(403).json({ error: '只有分配的写手才能提交文案' });

    const newVersion = existing.submitCount + 1;

    await prisma.contentVersion.create({
      data: { taskId: id, version: newVersion, title, content, changedBy: req.user!.id, changeNote },
    });

    const task = await prisma.contentTask.update({
      where: { id },
      data: { finalTitle: title, content, submitCount: newVersion, status: 'PENDING_REVIEW' },
    });

    await prisma.taskStatusLog.create({
      data: { taskId: id, fromStatus: existing.status, toStatus: 'PENDING_REVIEW', operatorId: req.user!.id, note: `提交文案 v${newVersion}` },
    });

    res.json(task);
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: '提交失败' });
  }
});

taskRouter.post('/:id/review', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, content } = req.body;

    const existing = await prisma.contentTask.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: '任务不存在' });

    await prisma.taskReview.create({
      data: { taskId: id, reviewerId: req.user!.id, status, content },
    });

    let newStatus: string;
    if (status === 'APPROVED') newStatus = 'CONTENT_APPROVED';
    else if (status === 'REJECTED') newStatus = 'MODIFYING';
    else return res.status(400).json({ error: '无效的审核状态' });

    const task = await prisma.contentTask.update({ where: { id }, data: { status: newStatus } });

    await prisma.taskStatusLog.create({
      data: { taskId: id, fromStatus: existing.status, toStatus: newStatus, operatorId: req.user!.id, note: `审核${status === 'APPROVED' ? '通过' : '退回'}: ${content}` },
    });

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: '审核失败' });
  }
});

taskRouter.post('/:id/assign', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.body;

    if (!userId || !role) return res.status(400).json({ error: '用户和角色不能为空' });

    const existing = await prisma.taskMember.findUnique({
      where: { taskId_userId_role: { taskId: id, userId, role } },
    });
    if (existing) return res.status(400).json({ error: '该成员已分配此角色' });

    await prisma.taskMember.create({ data: { taskId: id, userId, role } });

    const task = await prisma.contentTask.findUnique({
      where: { id },
      include: { members: { include: { user: { select: { id: true, name: true, avatar: true, role: true } } } } },
    });

    res.json(task);
  } catch (error) {
    res.status(500).json({ error: '分配失败' });
  }
});

taskRouter.get('/:id/versions', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const versions = await prisma.contentVersion.findMany({ where: { taskId: id }, orderBy: { version: 'desc' } });
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: '获取版本失败' });
  }
});

taskRouter.delete('/:id', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await prisma.contentTask.delete({ where: { id } });
    res.json({ message: '任务已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除任务失败' });
  }
});
