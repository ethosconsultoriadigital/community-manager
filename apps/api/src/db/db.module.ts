import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import {
  AgenciesRepository,
  ApprovalsRepository,
  ClientsRepository,
  ContentSourcesRepository,
  createPrismaClient,
  disconnectPrisma,
  GenerationsRepository,
  MediaAssetsRepository,
  PostInsightsRepository,
  PostsRepository,
  SocialAccountsRepository,
  SourceItemsRepository,
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
      provide: PostInsightsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new PostInsightsRepository(prisma),
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
    {
      provide: GenerationsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new GenerationsRepository(prisma),
    },
    {
      provide: MediaAssetsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new MediaAssetsRepository(prisma),
    },
    {
      provide: ContentSourcesRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new ContentSourcesRepository(prisma),
    },
    {
      provide: SourceItemsRepository,
      inject: [PRISMA_CLIENT],
      useFactory: (prisma: ReturnType<typeof createPrismaClient>) =>
        new SourceItemsRepository(prisma),
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
    GenerationsRepository,
    MediaAssetsRepository,
    PostInsightsRepository,
    ContentSourcesRepository,
    SourceItemsRepository,
  ],
})
export class DbModule implements OnModuleDestroy {
  async onModuleDestroy() {
    await disconnectPrisma();
  }
}
