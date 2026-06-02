import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

async function main() {
  const prisma = new PrismaClient();
  const admin = await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true, email: true } });
  if (!admin) {
    console.error('no admin user');
    process.exit(1);
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET not set');
    process.exit(1);
  }
  const token = jwt.sign({ sub: admin.id }, secret, { expiresIn: '7d' });
  console.log('ADMIN=' + admin.email);
  console.log('JWT=' + token);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
