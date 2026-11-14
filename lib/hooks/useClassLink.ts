'use client';

import { useEffect, useState } from 'react';

/** The class's one meeting link, polled. Shared by the old and new enrolled class pages. */
export function useClassLink(groupId: string, initialLink: string | null, enabled: boolean) {
  // The group payload is read once at page load, so a link the tutor
  // generates afterwards would leave Join stuck on "Link not ready yet"
  // until a full refresh — which is what it did. It also went dead if the
  // group query fell back to a select tier without meeting_link.
  //
  // GET /api/groups/[id]/meeting-link is the authoritative, membership-gated
  // source, so ask it directly whenever the payload didn't carry a link, and
  // re-check periodically while the page is open.
  //
  // The poll used to stop at the first link it saw. That was fine while the
  // only link was a Meet room minted once and reused, but a tutor can now
  // paste their own link, swap it for another, or switch the class back to
  // generated Meet links (which clears the saved one until the next Join
  // mints a fresh room). A student who opened the page before class would
  // keep the old URL and land in a room nobody is in. So the poll keeps
  // running and whatever the server says now wins: a new URL replaces the
  // old one, and a 404/403 (no link any more, or this viewer may no longer
  // have it) takes Join back to its disabled state. Network errors and
  // other statuses change nothing, so a flaky connection can't hide a link
  // that is still good.
  //
  // This lives on the page, not in the button, because the Sessions rows
  // used to read the link once from GET /sessions and kept the old URL
  // after the header had picked up the new one. One poller, one link.
  const [link, setLink] = useState<string | null>(enabled ? initialLink : null);
  const [checking, setChecking] = useState(false);

  // The page reloads the group payload when the profile changes; adopt what
  // it carried rather than keep a value from the previous load. A viewer who
  // may no longer join gets nothing, whatever the payload said.
  useEffect(() => {
    setLink(enabled ? initialLink : null);
  }, [initialLink, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // A request slower than the interval must not stack a second one behind
    // it; on a bad connection that is how a poll turns into a queue.
    let inFlight = false;

    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      setChecking(true);
      try {
        const res = await fetch(`/api/groups/${groupId}/meeting-link`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.ok) {
          const d = await res.json();
          if (!cancelled && typeof d?.join_url === 'string' && d.join_url) setLink(d.join_url);
        } else if (res.status === 404 || res.status === 403) {
          setLink(null);
        }
      } catch {
        /* offline or a transient failure — keep whatever we already have */
      } finally {
        inFlight = false;
        if (!cancelled) setChecking(false);
      }
    };

    // The payload already answered for this moment when it carried a link,
    // so only ask straight away when it didn't.
    if (!initialLink) check();
    // Cheap poll so a student sitting on the page before class sees Join
    // light up, or picks up a changed link, without reloading.
    const timer = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [groupId, initialLink, enabled]);

  return { link, checking };
}
