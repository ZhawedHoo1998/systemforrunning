import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth.js';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, role, keyword, page = '1', pageSize = '20' } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (role) where.role = role;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword as string } },
        { email: { contains: keyword as string } },
        { phone: { contains: keyword as string } },
      ];
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          role: true,
          department: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: '获取成员列表失败' });
  }
});

userRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user!.role !== 'ADMIN' && req.user!.id !== id) {
      return res.status(403).json({ error: '权限不足' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        department: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: '成员不存在' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: '获取成员信息失败' });
  }
});

userRouter.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, role, department, avatar } = req.body;

    if (!name || !password) {
      return res.status(400).json({ error: '姓名和密码不能为空' });
    }

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({ error: '邮箱已被使用' });
      }
    }

    if (phone) {
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        return res.status(400).json({ error: '手机号已被使用' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        password: hashedPassword,
        role: role || 'MEMBER',
        department,
        avatar,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        department: true,
        status: true,
        createdAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: '创建成员失败' });
  }
});

userRouter.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, department, avatar, status } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '成员不存在' });
    }

    if (email && email !== existing.email) {
      const emailUsed = await prisma.user.findUnique({ where: { email } });
      if (emailUsed) {
        return res.status(400).json({ error: '邮箱已被使用' });
      }
    }

    if (phone && phone !== existing.phone) {
      const phoneUsed = await prisma.user.findUnique({ where: { phone } });
      if (phoneUsed) {
        return res.status(400).json({ error: '手机号已被使用' });
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        role,
        department,
        avatar,
        status,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        department: true,
        status: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: '更新成员失败' });
  }
});

userRouter.put('/:id/password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: '密码不能为空' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    res.json({ message: '密码已更新' });
  } catch (error) {
    res.status(500).json({ error: '更新密码失败' });
  }
});

userRouter.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user!.id) {
      return res.status(400).json({ error: '不能删除自己的账号' });
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: '成员已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除成员失败' });
  }
});
