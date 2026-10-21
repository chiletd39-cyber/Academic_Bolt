export type RoomKind = 'meeting' | 'event';
export function mediaPermission(kind: RoomKind, moderator: boolean, approved: boolean) {
  const canPublish = moderator || (kind === 'meeting' && approved);
  return { canSubscribe: true, canPublish, canPublishData: true,
    canPublishSources: moderator ? [1, 2, 3, 4] : canPublish ? [1, 2] : [] };
}
export function isModerator(record: { host_id: string; created_by: string }, uid: string, role: string) {
  return record.host_id === uid || record.created_by === uid || role === 'admin';
}
export function mayModerate(moderator: boolean, actor: string, target: string) {
  return moderator && actor !== target;
}
