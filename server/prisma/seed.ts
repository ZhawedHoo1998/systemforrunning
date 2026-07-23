import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('admin123', 12);

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: '管理员',
      email: 'admin@example.com',
      password,
      role: 'ADMIN',
    },
  });

  console.log('Admin user created: admin@example.com / admin123');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
