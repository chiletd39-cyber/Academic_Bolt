import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2';
import { z } from 'npm:zod@3';
import { mediaPermission, isModerator, mayModerate } from './permissions.ts';
const schema = z.object({ kind: z.enum(['meeting', 'event']), id: z.string().uuid(),
  action: z.enum(['join', 'sync', 'moderate', 'end', 'mute']).default('join'),
  requestId: z.string().uuid().optional(), decision: z.enum(['approved', 'rejected', 'removed']).optional(),
  source: z.enum(['microphone', 'camera']).optional() }).strict();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const header = req.headers.get('Authorization');
    if (!header?.startsWith('Bearer ')) return reply({ error: 'Sign in required' }, 401);
    const dbUrl = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const url = Deno.env.get('LIVEKIT_URL'); const key = Deno.env.get('LIVEKIT_API_KEY'); const secret = Deno.env.get('LIVEKIT_API_SECRET');
    if (!dbUrl || !anon || !url || !key || !secret) return reply({ error: 'Video service is not configured' }, 503);
    const db = createClient(dbUrl, anon, { global: { headers: { Authorization: header } } });
    const { data: auth, error: authError } = await db.auth.getUser(header.slice(7));
    if (authError || !auth.user) return reply({ error: 'Sign in required' }, 401);
    const uid = auth.user.id;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: 'Invalid room request' }, 400);
    const { kind, id, action, requestId, decision, source } = parsed.data;
    const { data: allowed, error: accessError } = await db.rpc(kind === 'meeting' ? 'can_view_meeting' : 'can_view_event', kind === 'meeting' ? { _meeting_id: id } : { _event_id: id });
    if (accessError || allowed !== true) return reply({ error: 'You are not invited to this room' }, 403);
    const table = kind === 'meeting' ? 'meetings' : 'live_events';
    const { data: record, error: recordError } = await db.from(table).select('id,host_id,created_by,status').eq('id', id).single();
    const { data: role, error: roleError } = await db.rpc('get_own_role');
    if (recordError || !record || roleError) return reply({ error: 'Room access could not be confirmed' }, 403);
    const moderator = isModerator(record, uid, role);
    const roomName = `academic-${kind}-${id}`;
    const service = new RoomServiceClient(url.replace(/^wss:/, 'https:'), key, secret);
    if (action === 'join') {
      try { await service.listRooms([roomName]); }
      catch { return reply({ error: 'LiveKit connection could not be verified. Check the project connection details.' }, 503); }
    }
    const participants = async () => {
      try { return await service.listParticipants(roomName); }
      catch (err) { if ((err as { status?: number }).status === 404 || (err as { code?: string }).code === 'not_found') return []; throw err; }
    };
    if (action === 'end') {
      if (!moderator) return reply({ error: 'Only the host or administrator can end this room' }, 403);
      const { error } = await db.rpc(kind === 'meeting' ? 'end_meeting' : 'end_live_event', kind === 'meeting' ? { _meeting_id: id } : { _live_event_id: id });
      if (error) return reply({ error: 'Could not end the room' }, 409);
      try { await service.deleteRoom(roomName); } catch (err) {
        if ((err as { status?: number }).status !== 404 && (err as { code?: string }).code !== 'not_found') return reply({ error: 'Room closed; video shutdown needs retry' }, 503);
      }
      return reply({ ended: true });
    }
    if (record.status === 'ended' || record.status === 'cancelled') {
      // Every connected client reconciles closure, including staff closing through legacy RPCs.
      try { await service.deleteRoom(roomName); } catch { /* Already closed or retry on next reconciliation. */ }
      return reply({ error: 'This room has ended', ended: true }, 410);
    }
    if (record.status !== 'live') {
      if (!moderator || action !== 'join') return reply({ error: 'Waiting for the host to start' }, 409);
      const { error } = await db.from(table).update({ status: 'live', started_at: new Date().toISOString() }).eq('id', id).eq('status', 'scheduled');
      if (error) return reply({ error: 'Could not start this room' }, 403);
    }
    if (action === 'moderate') {
      if (kind !== 'meeting' || !requestId || !decision || !moderator) return reply({ error: 'Moderation not allowed' }, 403);
      const { data: request, error } = await db.from('meeting_speak_requests').select('id,user_id').eq('id', requestId).eq('meeting_id', id).single();
      if (error || !request || !mayModerate(moderator, uid, request.user_id)) return reply({ error: 'You cannot moderate this request' }, 403);
      const { error: updateError } = await db.from('meeting_speak_requests').update({ status: decision }).eq('id', requestId).eq('meeting_id', id);
      if (updateError) return reply({ error: 'Speak request could not be updated' }, 403);
      const permission = mediaPermission(kind, false, decision === 'approved');
      const connected = (await participants()).find(p => p.identity === request.user_id);
      if (connected) {
        await service.updateParticipant(roomName, request.user_id, undefined, permission);
        if (!permission.canPublish) for (const track of connected.tracks) await service.mutePublishedTrack(roomName, request.user_id, track.sid, true);
      }
      return reply({ ok: true });
    }
    if (action === 'mute') {
      if (!moderator || !source) return reply({ error: 'Moderation not allowed' }, 403);
      for (const p of await participants()) {
        if (p.identity === uid) continue;
        for (const track of p.tracks) if (track.source === (source === 'camera' ? 1 : 2)) await service.mutePublishedTrack(roomName, p.identity, track.sid, true);
      }
      return reply({ ok: true });
    }
    const { data: approved, error: approvedError } = kind === 'meeting'
      ? await db.from('meeting_speak_requests').select('user_id').eq('meeting_id', id).eq('status', 'approved')
      : { data: [], error: null };
    if (approvedError) return reply({ error: 'Speaker permissions unavailable' }, 503);
    const canSpeak = (approved || []).some(r => r.user_id === uid);
    if (action === 'sync') {
      // A caller may reconcile their own permission; only moderators can reconcile others.
      for (const p of await participants()) {
        if (!moderator && p.identity !== uid) continue;
        const { data: pRole, error: pError } = p.identity === uid ? { data: role, error: null } : await db.from('profiles').select('role').eq('user_id', p.identity).single();
        if (pError) continue;
        const roleValue = typeof pRole === 'string' ? pRole : pRole?.role;
        const mod = isModerator(record, p.identity, roleValue || '');
        const permission = mediaPermission(kind, mod, (approved || []).some(r => r.user_id === p.identity));
        await service.updateParticipant(roomName, p.identity, undefined, permission);
        if (!permission.canPublish) for (const track of p.tracks) if (!track.muted) await service.mutePublishedTrack(roomName, p.identity, track.sid, true);
      }
      return reply({ ok: true });
    }
    const { data: profile, error: profileError } = await db.from('profiles').select('full_name').eq('user_id', uid).single();
    if (profileError) return reply({ error: 'Profile unavailable' }, 403);
    const token = new AccessToken(key, secret, { identity: uid, name: profile.full_name, ttl: '2m' });
    token.addGrant({ room: roomName, roomJoin: true, ...mediaPermission(kind, moderator, canSpeak) });
    return reply({ token: await token.toJwt(), url, canPublish: moderator || canSpeak, moderator });
  } catch {
    // Never log provider errors: they can include credentials or signed URLs.
    return reply({ error: 'Video service unavailable. Please try again.' }, 503);
  }
});
