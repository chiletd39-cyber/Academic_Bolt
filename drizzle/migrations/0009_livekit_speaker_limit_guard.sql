CREATE OR REPLACE FUNCTION public.guard_meeting_speaker_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE meeting_status text; capacity integer;
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.meeting_id IS DISTINCT FROM OLD.meeting_id THEN RAISE EXCEPTION 'Speak requests cannot move between meetings'; END IF;
 SELECT status, COALESCE(max_active_speakers,3) INTO meeting_status, capacity FROM public.meetings WHERE id = NEW.meeting_id FOR UPDATE;
 IF meeting_status IS NULL OR meeting_status IN ('ended','cancelled') THEN RAISE EXCEPTION 'This meeting is closed'; END IF;
 IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
  IF (SELECT count(DISTINCT user_id) FROM public.meeting_speak_requests WHERE meeting_id=NEW.meeting_id AND status='approved' AND id<>NEW.id) >= capacity THEN RAISE EXCEPTION 'Maximum active speakers reached'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_meeting_speaker_capacity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_speak_request_capacity BEFORE INSERT OR UPDATE ON public.meeting_speak_requests FOR EACH ROW EXECUTE FUNCTION public.guard_meeting_speaker_capacity();