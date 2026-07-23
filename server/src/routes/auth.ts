import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: '请提供账号和密码' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: login }, { phone: login }],
      },
    });

    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    if (user.status === 'LEFT') {
      return res.status(401).json({ error: '账号已删除' });
    }

    if (user.status === 'DISABLED') {
      return res.status(403).json({ error: '账号已停用' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: '账号或密码错误' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

authRouter.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        avatar: true,
        department: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

authRouter.post('/logout', authenticate, (req, res) => {
  res.json({ message: '已退出登录' });
});
