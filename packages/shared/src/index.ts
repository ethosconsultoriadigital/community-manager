export {
  decryptToken,
  encryptToken,
  TokenEncryptionError,
} from './crypto/token-encryption';

export {
  buildPublishMessage,
  buildRadarCaption,
  dedupeHashtagsKeepLast,
  displayCaption,
  hashtagsAlreadyInText,
  isHashtagOnlyLine,
  normalizeCaptionHashtags,
  stripHashtagOnlyLines,
  visibleHashtags,
} from './caption/caption-hashtags';

export type AgencyId = string;

export const USER_ROLES = ['owner', 'admin', 'manager', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type AuthUser = {
  id: string;
  agencyId: string;
  email: string;
  role: UserRole;
  fullName?: string | null;
};
