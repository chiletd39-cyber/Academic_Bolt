import { describe, it, expect } from 'vitest';
import { mediaPermission, isModerator, mayModerate } from '../../../supabase/functions/live-room/permissions';
describe('server media authorization', () => {
  it('denies an unapproved meeting attendee publishing', () => { expect(mediaPermission('meeting', false, false).canPublish).toBe(false); });
  it('allows an approved speaker camera/microphone but not screen sharing', () => { expect(mediaPermission('meeting', false, true).canPublishSources).toEqual([1, 2]); });
  it('denies live-event viewers publishing even with a speaker flag', () => { expect(mediaPermission('event', false, true).canPublish).toBe(false); });
  it('allows authorized moderators to publish', () => { expect(mediaPermission('event', true, false).canPublish).toBe(true); });
  it('never lets a moderator approve their own request', () => { expect(mayModerate(true, 'self', 'self')).toBe(false); });
  it('denies nonmoderators deciding another request', () => { expect(mayModerate(false, 'a', 'b')).toBe(false); });
  it('recognizes only the record host, creator or database admin', () => { expect(isModerator({ host_id: 'host', created_by: 'creator' }, 'student', 'student')).toBe(false); expect(isModerator({ host_id: 'host', created_by: 'creator' }, 'host', 'teacher')).toBe(true); });
});
