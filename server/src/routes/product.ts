import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

export const productRouter = Router();

productRouter.use(authenticate);

productRouter.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, keyword, page = '1', pageSize = '20' } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword as string } },
        { code: { contains: keyword as string } },
      ];
    }

    const skip = (Number(page) - 1) * Number(pageSize);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: Number(pageSize),
        orderBy: { createdAt: 'desc' },
        include: {
          carModels: { include: { carModel: { include: { brand: true } } } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ products, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json({ error: '获取产品列表失败' });
  }
});

productRouter.post('/', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const {
      name, code, series, status, mainImage, installImage, highlights,
      material, colors, fragrances, installPos, installMethod,
      price, salePrice, stock, link, faq, standardAnswer, carModelIds,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: '产品名称不能为空' });
    }

    const product = await prisma.product.create({
      data: {
        name, code, series, status: status || 'ACTIVE', mainImage, installImage,
        highlights, material, colors, fragrances, installPos, installMethod,
        price, salePrice, stock, link, faq, standardAnswer,
      },
    });

    if (carModelIds && carModelIds.length > 0) {
      for (const carModelId of carModelIds) {
        await prisma.productCarModel.create({ data: { productId: product.id, carModelId } });
      }
    }

    const result = await prisma.product.findUnique({
      where: { id: product.id },
      include: { carModels: { include: { carModel: { include: { brand: true } } } } },
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: '创建产品失败' });
  }
});

productRouter.get('/brands', async (req: AuthRequest, res) => {
  try {
    const brands = await prisma.carBrand.findMany({
      orderBy: { name: 'asc' },
      include: { carModels: { orderBy: { name: 'asc' } } },
    });
    res.json(brands);
  } catch (error) {
    res.status(500).json({ error: '获取品牌列表失败' });
  }
});

productRouter.post('/brands', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { name, logo } = req.body;
    if (!name) return res.status(400).json({ error: '品牌名称不能为空' });
    const brand = await prisma.carBrand.create({ data: { name, logo } });
    res.status(201).json(brand);
  } catch (error) {
    res.status(500).json({ error: '创建品牌失败' });
  }
});

productRouter.get('/car-models', async (req: AuthRequest, res) => {
  try {
    const { brandId, keyword } = req.query;
    const where: any = {};
    if (brandId) where.brandId = brandId as string;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword as string } },
        { series: { contains: keyword as string } },
      ];
    }
    const carModels = await prisma.carModel.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { brand: true },
    });
    res.json(carModels);
  } catch (error) {
    res.status(500).json({ error: '获取车型列表失败' });
  }
});

productRouter.post('/car-models', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { name, brandId, series, year, interiorStyle, image, remark } = req.body;
    if (!name || !brandId) return res.status(400).json({ error: '车型名称和品牌不能为空' });
    const carModel = await prisma.carModel.create({
      data: { name, brandId, series, year, interiorStyle, image, remark },
      include: { brand: true },
    });
    res.status(201).json(carModel);
  } catch (error) {
    res.status(500).json({ error: '创建车型失败' });
  }
});

productRouter.get('/fragrances', async (req: AuthRequest, res) => {
  try {
    const fragrances = await prisma.fragrance.findMany({ orderBy: { name: 'asc' } });
    res.json(fragrances);
  } catch (error) {
    res.status(500).json({ error: '获取香型列表失败' });
  }
});

productRouter.post('/fragrances', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '香型名称不能为空' });
    const fragrance = await prisma.fragrance.create({ data: { name, description } });
    res.status(201).json(fragrance);
  } catch (error) {
    res.status(500).json({ error: '创建香型失败' });
  }
});

productRouter.get('/tags', async (req: AuthRequest, res) => {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: '获取标签列表失败' });
  }
});

productRouter.post('/tags', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: '标签名称不能为空' });
    const tag = await prisma.tag.create({ data: { name, color } });
    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ error: '创建标签失败' });
  }
});

productRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { carModels: { include: { carModel: { include: { brand: true } } } } },
    });
    if (!product) return res.status(404).json({ error: '产品不存在' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: '获取产品详情失败' });
  }
});

productRouter.put('/:id', requireRole('ADMIN', 'CONTENT_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const {
      name, code, series, status, mainImage, installImage, highlights,
      material, colors, fragrances, installPos, installMethod,
      price, salePrice, stock, link, faq, standardAnswer, carModelIds,
    } = req.body;

    const product = await prisma.product.update({
      where: { id },
      data: {
        name, code, series, status, mainImage, installImage, highlights,
        material, colors, fragrances, installPos, installMethod,
        price, salePrice, stock, link, faq, standardAnswer,
      },
    });

    if (carModelIds !== undefined) {
      await prisma.productCarModel.deleteMany({ where: { productId: id } });
      for (const carModelId of carModelIds) {
        await prisma.productCarModel.create({ data: { productId: id, carModelId } });
      }
    }

    const result = await prisma.product.findUnique({
      where: { id },
      include: { carModels: { include: { carModel: { include: { brand: true } } } } },
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: '更新产品失败' });
  }
});

productRouter.delete('/:id', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id } });
    res.json({ message: '产品已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除产品失败' });
  }
});
