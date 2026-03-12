import { useEffect, useState } from 'react';
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
}

export function SessionListPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api
      .get('/sessions')
      .then(res => setSessions(res.data))
      .finally(() => setLoading(false));
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('file', file);

    try {
      const res = await api.post('/sessions', formData);
      setSessions(prev => [res.data, ...prev]);
      setTitle('');
      setFile(null);
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

  return (
    <div className="admin-page">
      <div className="instructions">
        <h2>How it works</h2>
        <ol>
          <li>Open your Google Doc and go to <strong>File &rarr; Download &rarr; Web Page (.html)</strong></li>
          <li>Upload the HTML file below with a session title</li>
          <li>Share the review link with your team</li>
          <li>Everyone can select text in the document and leave comments in real time</li>
        </ol>
      </div>

      <h2>New Review Session</h2>
      <form className="upload-form" onSubmit={handleUpload}>
        <input
          type="text"
          placeholder="Session title (e.g., Q1 2026 Review)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />
        <input
          type="file"
          accept=".html,.htm"
          onChange={e => setFile(e.target.files?.[0] || null)}
          required
        />
        <button className="btn btn-primary" type="submit" disabled={uploading}>
          {uploading ? 'Uploading...' : 'Create Session'}
        </button>
      </form>

      {sessions.length > 0 && (
        <>
          <h2>Sessions</h2>
          <div className="session-list">
            {sessions.map(s => (
              <Link key={s.id} to={`/review/${s.id}`} className="session-card">
                <div>
                  <div className="title">{s.title}</div>
                  <div className="meta">
                    Created {new Date(s.created_at + 'Z').toLocaleDateString()}
                    {s.creator_name && ` by ${s.creator_name}`}
                    {!s.is_active && ' (Closed)'}
                  </div>
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
