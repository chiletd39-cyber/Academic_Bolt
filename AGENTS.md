# Architecture rules
- Managed meeting and live-event media uses LiveKit through the authenticated live-room function; derive identity, access, and publish grants from school database rules to prevent browser-controlled privileges.
- Phone-camera QR broadcasting retains its existing separate transport so replacing meeting media does not alter its token lifecycle.
