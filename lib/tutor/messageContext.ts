/** Shape of /api/tutor/messages/context — shared by the route and TutorMessagesV2. */

export type MessageTagTone = 'danger' | 'warning' | 'brand' | 'outline';

export type MessagePerson = {
  role: string | null;
  /** Status chip on the inbox row and in the context pane; null when nothing is pending. */
  tag: { label: string; tone: MessageTagTone } | null;
  /** Counted by the "Needs action" filter. */
  needsAction: boolean;
  /** No class, join request or booking with this tutor (and no linked child who has one). */
  enquiry: boolean;
  /** Names of this tutor's classes the person (or their child) is in. */
  classes: string[];
  /** For a parent: the linked child the relationship runs through. */
  child: string | null;
};

export type MessageContext = { people: Record<string, MessagePerson>; about: Record<string, string> };
