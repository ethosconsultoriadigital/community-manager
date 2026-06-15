export { createPrismaClient, disconnectPrisma, getPrismaClient } from './client';
export { ApprovalsRepository } from './repositories/approvals.repository';
export { AgenciesRepository } from './repositories/agencies.repository';
export { ClientsRepository } from './repositories/clients.repository';
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
