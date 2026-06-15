import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import {
  AgenciesRepository,
  ApprovalsRepository,
  ClientsRepository,
  createPrismaClient,
  disconnectPrisma,
  PostsRepository,
  SocialAccountsRepository,
  UsersRepository,
} from '@cm/db';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: () => createPrismaClient(),
    },
    {
      provide: AgenciesRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new AgenciesRepository(prisma),
    },
    {
      provide: ClientsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new ClientsRepository(prisma),
    },
    {
      provide: UsersRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new UsersRepository(prisma),
    },
    {
      provide: SocialAccountsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new SocialAccountsRepository(prisma),
    },
    {
      provide: PostsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new PostsRepository(prisma),
    },
    {
      provide: ApprovalsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new ApprovalsRepository(prisma),
    },
  ],
  exports: [
    PRISMA_CLIENT,
    AgenciesRepository,
    ClientsRepository,
    UsersRepository,
    SocialAccountsRepository,
    PostsRepository,
    ApprovalsRepository,
  ],
})
export class DbModule implements OnModuleDestroy {
  async onModuleDestroy() {
    await disconnectPrisma();
  }
}
