import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

export const materialRouter = Router();

materialRouter.use(authenticate);

materialRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const {
      type,
      productId,
      carModelId,
      fragranceId,
      canPublish,
      keyword,
      page = '1',
      pageSize = '20',
    } = req.query;

    const where: any = {};

    if (type) where.type = type;
    if (productId) where.productId = productId;
    if (carModelId) where.carModelId = carModelId;
    if (fragranceId) where.fragranceId = fragranceId;
    if (canPublish !== undefined) where.canPublish = canPublish === 'true';

    if (keyword) {
      where.OR = [
        { name: { contains: keyword as string } },
        { textContent: { contains: keyword as string } },
      ];
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [materials, total] = await Promise.all([
      prisma.material.findMany({
        where,
        skip,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          uploadr: { select: { id: true, name: true, avatar: true } },
          product: { select: { id: true, name: true } },
          carModel: { select: { id: true, name: true, brand: true } },
          tagsRelation: { include: { tag: true } },
        },
      }),
      prisma.material.count({ where }),
    ]);

    const formattedMaterials = materials.map((m) => ({
      ...m,
      tags: m.tagsRelation.map((tr) => tr.tag),
      tagsRelation: undefined,
    }));

    res.json({ materials: formattedMaterials, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (error) {
    console.error('List materials error:', error);
    res.status(500).json({ error: '获取素材列表失败' });
  }
});

materialRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const material = await prisma.material.findUnique({
      where: { id },
      include: {
        uploadr: { select: { id: true, name: true, avatar: true } },
        product: true,
        carModel: { include: { brand: true } },
        fragrance: true,
        tagsRelation: { include: { tag: true } },
      },
    });

    if (!material) {
      return res.status(404).json({ error: '素材不存在' });
    }

    res.json({
      ...material,
      tags: material.tagsRelation.map((tr) => tr.tag),
      tagsRelation: undefined,
    });
  } catch (error) {
    res.status(500).json({ error: '获取素材详情失败' });
  }
});

materialRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const {
      name,
      type,
      url,
      link,
      textContent,
      productId,
      carModelId,
      fragranceId,
      scene,
      contentType,
      tags,
      source,
      copyright,
      canPublish,
      clarity,
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: '素材名称和类型不能为空' });
    }

    const material = await prisma.material.create({
      data: {
        name,
        type,
        url,
        link,
        textContent,
        productId,
        carModelId,
        fragranceId,
        scene,
        contentType,
        tags: tags || [],
        source,
        copyright,
        canPublish: canPublish || false,
        clarity,
        uploadedById: req.user!.id,
      },
      include: {
        uploadr: { select: { id: true, name: true, avatar: true } },
      },
    });

    if (tags && tags.length > 0) {
      for (const tagId of tags) {
        await prisma.materialTag.create({
          data: { materialId: material.id, tagId },
        });
      }
    }

    res.status(201).json({
      ...material,
      tags: tags || [],
    });
  } catch (error) {
    console.error('Create material error:', error);
    res.status(500).json({ error: '创建素材失败' });
  }
});

materialRouter.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      type,
      url,
      link,
      textContent,
      productId,
      carModelId,
      fragranceId,
      scene,
      contentType,
      tags,
      source,
      copyright,
      canPublish,
      clarity,
    } = req.body;

    const existing = await prisma.material.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: '素材不存在' });
    }

    const material = await prisma.material.update({
      where: { id },
      data: {
        name,
        type,
        url,
        link,
        textContent,
        productId,
        carModelId,
        fragranceId,
        scene,
        contentType,
        tags: tags || existing.tags,
        source,
        copyright,
        canPublish,
        clarity,
      },
    });

    if (tags) {
      await prisma.materialTag.deleteMany({ where: { materialId: id } });
      for (const tagId of tags) {
        await prisma.materialTag.create({
          data: { materialId: id, tagId },
        });
      }
    }

    res.json(material);
  } catch (error) {
    res.status(500).json({ error: '更新素材失败' });
  }
});

materialRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    await prisma.material.delete({ where: { id } });

    res.json({ message: '素材已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除素材失败' });
  }
});

materialRouter.post('/:id/use', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const material = await prisma.material.update({
      where: { id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    res.json({ useCount: material.useCount });
  } catch (error) {
    res.status(500).json({ error: '更新使用次数失败' });
  }
});
