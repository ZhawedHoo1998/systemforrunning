import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true },
    });

    if (!user || user.status === 'LEFT') {
      return res.status(401).json({ error: '用户不存在或已离职' });
    }

    if (user.status === 'DISABLED') {
      return res.status(403).json({ error: '账号已停用' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token无效' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};
