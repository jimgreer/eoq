import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Session {
  id: string;
  title: string;
  is_active: boolean;
  created_at: string;
}

export function AdminPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get('/sessions').then(res => setSessions(res.data));
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

  return (
    <div className="admin-page">
      <h2>Create Review Session</h2>
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

      <h2>Sessions</h2>
      <div className="session-list">
        {sessions.map(s => (
          <Link key={s.id} to={`/review/${s.id}`} className="session-card">
            <div>
              <div className="title">{s.title}</div>
              <div className="meta">
                Created {new Date(s.created_at).toLocaleDateString()}
                {!s.is_active && ' (Closed)'}
              </div>
            </div>
          </Link>
        ))}
        {sessions.length === 0 && (
          <p style={{ color: '#5f6368' }}>No sessions yet.</p>
        )}
      </div>
    </div>
  );
}
