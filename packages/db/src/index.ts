export { createPrismaClient, disconnectPrisma, getPrismaClient } from './client';
export { ApprovalsRepository } from './repositories/approvals.repository';
export { AgenciesRepository } from './repositories/agencies.repository';
export { ClientsRepository } from './repositories/clients.repository';
export {
  ContentSourcesRepository,
  ContentSourcesValidationError,
  type CreateContentSourceData,
} from './repositories/content-sources.repository';
export {
  SourceItemsRepository,
  SourceItemsValidationError,
  type UpsertSourceItemData,
} from './repositories/source-items.repository';
export {
  GenerationsRepository,
  type CreateGenerationData,
} from './repositories/generations.repository';
export {
  MediaAssetsRepository,
  type CreateMediaAssetData,
} from './repositories/media-assets.repository';
export {
  PostInsightsRepository,
  type AnalyticsSummary,
  type UpsertPostInsightData,
} from './repositories/post-insights.repository';
export {
  SocialAccountsRepository,
  type UpsertSocialAccountData,
} from './repositories/social-accounts.repository';
export { type CreateUserData, UsersRepository } from './repositories/users.repository';
export {
  PostsRepository,
  PostsValidationError,
  type CreatePostData,
  type UpdatePostData,
} from './repositories/posts.repository';
export {
  type ClientCreateData,
  type ClientUpdateData,
  requireAgencyId,
  scopedWhere,
  TenantScope,
  TenantScopeError,
} from './tenant/tenant-scope';
