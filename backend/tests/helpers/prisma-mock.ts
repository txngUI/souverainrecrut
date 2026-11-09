/**
 * Faux client Prisma utilisé à la place de src/config/prisma.
 * Aucun test ne touche à une vraie base PostgreSQL : chaque test
 * définit lui-même ce que "retourne la base".
 */
const model = () => ({
  findMany: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

export const prismaMock = {
  user: model(),
  candidate: model(),
  job: model(),
  application: model(),
  $queryRaw: jest.fn(),
};

export const prisma = prismaMock;
