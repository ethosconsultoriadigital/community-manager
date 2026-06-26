import { describe, expect, it } from 'vitest';
import { CanvaConnectClient } from './canva-connect.client';

describe('CanvaConnectClient.buildEditUrl', () => {
  it('añade correlation_state a edit_url', () => {
    const client = new CanvaConnectClient({ get: () => undefined } as never);
    const url = client.buildEditUrl(
      'https://www.canva.com/api/design/abc123/edit',
      'post-uuid-1234',
    );
    expect(url).toContain('correlation_state=post-uuid-1234');
  });
});
