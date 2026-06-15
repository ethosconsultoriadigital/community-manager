import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PostsRepository } from '@cm/db';
import { PUBLISH_QUEUE } from './publish.constants';
import { PublishPostService, type PublishPostJobData } from './publish-post.service';
import { PublishQueueService } from './publish-queue.service';

@Processor(PUBLISH_QUEUE)
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(
    private readonly publishPost: PublishPostService,
    private readonly publishQueue: PublishQueueService,
    private readonly posts: PostsRepository,
  ) {
    super();
  }

  async process(job: Job<PublishPostJobData | Record<string, never>>): Promise<void> {
    if (job.name === 'scan-due-posts') {
      await this.scanDuePosts();
      return;
    }

    const data = job.data as PublishPostJobData;
    this.logger.log(`Publicando post ${data.postId} (intento ${job.attemptsMade + 1})`);
    await this.publishPost.publishPost(data);
  }

  private async scanDuePosts() {
    const due = await this.posts.findDueForPublish(new Date());
    if (!due.length) return;

    this.logger.log(`Encolando ${due.length} post(s) vencidos`);
    await this.publishQueue.enqueueDuePosts(due);
  }
}
