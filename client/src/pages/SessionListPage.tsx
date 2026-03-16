import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

interface Session {
  id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  created_by: number;
  creator_name?: string;
  google_doc_id?: string | null;
  comment_count: number;
  last_activity: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SessionListPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [googleDocUrl, setGoogleDocUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [newSessionId, setNewSessionId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'created' | 'activity' | 'title'>('created');
  const [showOwnedOnly, setShowOwnedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSessions = useCallback((query?: string) => {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    api
      .get(`/sessions${params}`)
      .then(res => setSessions(res.data))
      .finally(() => setLoading(false));
  }, []);

  // Initial fetch and debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSessions(searchQuery || undefined);
    }, searchQuery ? 300 : 0);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchSessions]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (googleDocUrl.trim()) {
      formData.append('google_doc_url', googleDocUrl.trim());
    }

    try {
      const res = await api.post('/sessions', formData);
      setSessions(prev => [res.data, ...prev]);
      setFile(null);
      setGoogleDocUrl('');
      setNewSessionId(res.data.id);
      setTimeout(() => setNewSessionId(null), 3000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this review session? All comments will be lost.')) return;

    try {
      await api.delete(`/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  // Ownership filter (search is done server-side)
  const filteredSessions = sessions.filter(s => {
    if (showOwnedOnly && user && s.created_by !== user.id) return false;
    return true;
  });

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    switch (sortBy) {
      case 'activity':
        // Sessions with activity first, sorted by most recent
        if (!a.last_activity && !b.last_activity) return 0;
        if (!a.last_activity) return 1;
        if (!b.last_activity) return -1;
        return new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime();
      case 'title':
        return a.title.localeCompare(b.title);
      case 'created':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  return (
    <div className="admin-page">
      <div className="instructions">
        <h2>How it works</h2>
        <ol>
          <li>Open your Google Doc and go to <strong>File &rarr; Download &rarr; Web Page (.html, zipped)</strong></li>
          <li>Upload the zip file below</li>
          <li>Share the review link with your team</li>
          <li>Everyone can select text in the document and leave comments in real time</li>
        </ol>
      </div>

      <h2>New Review Session</h2>
      <form className="upload-form" onSubmit={handleUpload}>
        <input
          type="file"
          accept=".html,.htm,.zip"
          onChange={e => setFile(e.target.files?.[0] || null)}
          required
        />
        <input
          type="text"
          placeholder="Google Doc URL (optional — restricts access to doc viewers)"
          value={googleDocUrl}
          onChange={e => setGoogleDocUrl(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Create Session'}
        </button>
      </form>

      {sessions.length > 0 && (
        <>
          <div className="sessions-toolbar">
            <input
              type="text"
              className="search-input"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={showOwnedOnly}
                onChange={e => setShowOwnedOnly(e.target.checked)}
              />
              Owned by me
            </label>
            <select
              className="sort-select"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'created' | 'activity' | 'title')}
            >
              <option value="created">Newest first</option>
              <option value="activity">Recent activity</option>
              <option value="title">Alphabetical</option>
            </select>
          </div>
          <div className="session-list">
            {sortedSessions.length === 0 ? (
              <div className="no-results">No sessions match your filters</div>
            ) : sortedSessions.map(s => (
              <Link
                key={s.id}
                to={`/review/${s.id}`}
                className={`session-card${s.id === newSessionId ? ' session-new' : ''}`}
              >
                <div className="session-info">
                  <div className="title">{s.title}</div>
                  <div className="meta">
                    {new Date(s.created_at + 'Z').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {s.creator_name && ` by ${s.creator_name}`}
                    {!s.is_active && ' (Closed)'}
                  </div>
                </div>
                <div className="session-stats">
                  <span className="stat">
                    {s.comment_count} {s.comment_count === 1 ? 'comment' : 'comments'}
                  </span>
                  {s.last_activity && (
                    <span className="stat last-activity">
                      Last activity {formatRelativeTime(s.last_activity)}
                    </span>
                  )}
                </div>
                {user && s.created_by === user.id && (
                  <button
                    className="btn btn-text btn-delete"
                    onClick={e => handleDelete(e, s.id)}
                  >
                    Delete
                  </button>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
