import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PUBLISH_QUEUE } from './publish.constants';
import type { PublishPostJobData } from './publish-post.service';

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 50,
};

@Injectable()
export class PublishQueueService {
  constructor(@InjectQueue(PUBLISH_QUEUE) private readonly queue: Queue) {}

  async enqueuePost(agencyId: string, postId: string, runAt?: Date) {
    const delay = runAt ? Math.max(0, runAt.getTime() - Date.now()) : 0;
    const data: PublishPostJobData = { agencyId, postId };

    await this.queue.add('publish-post', data, {
      ...JOB_OPTIONS,
      jobId: `publish-post-${postId}`,
      delay,
    });
  }

  async enqueueDuePosts(
    posts: Array<{ id: string; agency_id: string }>,
  ) {
    for (const post of posts) {
      await this.queue.add(
        'publish-post',
        { agencyId: post.agency_id, postId: post.id },
        {
          ...JOB_OPTIONS,
          jobId: `publish-post-${post.id}`,
        },
      );
    }
  }
}
