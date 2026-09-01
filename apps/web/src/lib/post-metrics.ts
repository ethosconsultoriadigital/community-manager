import type { Post, PostTarget } from '@/lib/types';

export type PostMetricsSummary = {
  likes: number;
  comments: number;
  hasMetrics: boolean;
};

export function sumPostMetrics(post: Post): PostMetricsSummary {
  let likes = 0;
  let comments = 0;
  let hasMetrics = false;

  for (const target of post.post_targets) {
    const insight = (target as PostTarget & {
      post_insights?: { likes: number | null; comments: number | null } | null;
    }).post_insights;
    if (!insight) continue;
    hasMetrics = true;
    likes += insight.likes ?? 0;
    comments += insight.comments ?? 0;
  }

  return { likes, comments, hasMetrics };
}
