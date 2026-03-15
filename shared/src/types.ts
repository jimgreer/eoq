export interface User {
  id: number;
  google_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface ReviewSession {
  id: string;
  title: string;
  html_content: string;
  created_by: number;
  is_active: boolean;
  created_at: string;
  google_doc_id: string | null;
}

export interface TextAnchor {
  css_selector: string;
  start_offset: number;
  end_offset: number;
  quote: string;
}

export interface Comment {
  id: string;
  session_id: string;
  parent_id: string | null;
  user_id: number;
  body: string;
  anchor: TextAnchor | null;
  resolved: boolean;
  created_at: string;
  edited_at: string | null;
  user: Pick<User, 'id' | 'display_name' | 'email' | 'avatar_url'>;
  replies?: Comment[];
}

// Socket.IO event types
export interface ServerToClientEvents {
  'comment:new': (comment: Comment) => void;
  'comment:resolved': (data: { comment_id: string; resolved: boolean }) => void;
  'comment:edited': (data: { comment_id: string; body: string; edited_at: string }) => void;
  'comment:deleted': (data: { comment_id: string; parent_id: string | null }) => void;
}

export interface ClientToServerEvents {
  'comment:create': (
    data: {
      session_id: string;
      parent_id?: string;
      body: string;
      anchor?: TextAnchor;
    },
    callback: (result: { ok: boolean; comment?: Comment; error?: string }) => void
  ) => void;
  'comment:resolve': (
    data: { comment_id: string; resolved: boolean },
    callback: (result: { ok: boolean; error?: string }) => void
  ) => void;
  'comment:edit': (
    data: { comment_id: string; body: string },
    callback: (result: { ok: boolean; edited_at?: string; error?: string }) => void
  ) => void;
  'comment:delete': (
    data: { comment_id: string },
    callback: (result: { ok: boolean; error?: string }) => void
  ) => void;
  'session:join': (session_id: string) => void;
  'session:leave': (session_id: string) => void;
}
