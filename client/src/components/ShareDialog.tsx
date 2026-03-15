import { useState, useEffect } from 'react';
import { api } from '../api/client';

interface Collaborator {
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  added_at: string;
  has_account: boolean;
}

interface Owner {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

interface Props {
  sessionId: string;
  sessionTitle: string;
  currentUserEmail: string;
  onClose: () => void;
}

export function ShareDialog({ sessionId, sessionTitle, currentUserEmail, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [accessLevel, setAccessLevel] = useState<'restricted' | 'link'>('restricted');
  const [owner, setOwner] = useState<Owner | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isOwner = owner?.email.toLowerCase() === currentUserEmail.toLowerCase();

  useEffect(() => {
    api.get(`/sessions/${sessionId}/collaborators`)
      .then(res => {
        setAccessLevel(res.data.access_level);
        setOwner(res.data.owner);
        setCollaborators(res.data.collaborators);
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Failed to load sharing settings');
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setAddingEmail(true);
    setError(null);

    try {
      const res = await api.post(`/sessions/${sessionId}/collaborators`, { email: newEmail.trim() });
      setCollaborators(prev => [...prev, res.data]);
      setNewEmail('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add collaborator');
    } finally {
      setAddingEmail(false);
    }
  };

  const handleRemoveCollaborator = async (email: string) => {
    try {
      await api.delete(`/sessions/${sessionId}/collaborators/${encodeURIComponent(email)}`);
      setCollaborators(prev => prev.filter(c => c.email !== email));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove collaborator');
    }
  };

  const handleAccessLevelChange = async (level: 'restricted' | 'link') => {
    try {
      await api.patch(`/sessions/${sessionId}/access`, { access_level: level });
      setAccessLevel(level);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update access level');
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/review/${sessionId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-dialog-overlay" onClick={onClose}>
      <div className="share-dialog" onClick={e => e.stopPropagation()}>
        <div className="share-dialog-header">
          <h2>Share "{sessionTitle}"</h2>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <div className="share-dialog-loading">Loading...</div>
        ) : (
          <>
            <form className="share-add-form" onSubmit={handleAddCollaborator}>
              <input
                type="email"
                placeholder="Add people by email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                disabled={addingEmail}
              />
              <button type="submit" className="btn btn-primary" disabled={addingEmail || !newEmail.trim()}>
                {addingEmail ? 'Adding...' : 'Add'}
              </button>
            </form>

            {error && <div className="share-error">{error}</div>}

            <div className="share-section">
              <h3>People with access</h3>
              <div className="share-people-list">
                {owner && (
                  <div className="share-person">
                    <div className="share-person-avatar">
                      {owner.avatar_url ? (
                        <img src={owner.avatar_url} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="avatar-placeholder">{owner.display_name[0]}</span>
                      )}
                    </div>
                    <div className="share-person-info">
                      <div className="share-person-name">
                        {owner.display_name}
                        {owner.email.toLowerCase() === currentUserEmail.toLowerCase() && ' (you)'}
                      </div>
                      <div className="share-person-email">{owner.email}</div>
                    </div>
                    <div className="share-person-role">Owner</div>
                  </div>
                )}

                {collaborators.map(collab => (
                  <div key={collab.email} className="share-person">
                    <div className="share-person-avatar">
                      {collab.avatar_url ? (
                        <img src={collab.avatar_url} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="avatar-placeholder">
                          {collab.display_name?.[0] || collab.email[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="share-person-info">
                      <div className="share-person-name">
                        {collab.display_name || collab.email}
                        {collab.email.toLowerCase() === currentUserEmail.toLowerCase() && ' (you)'}
                        {!collab.has_account && <span className="pending-badge">Pending</span>}
                      </div>
                      {collab.display_name && (
                        <div className="share-person-email">{collab.email}</div>
                      )}
                    </div>
                    {(isOwner || collab.email.toLowerCase() === currentUserEmail.toLowerCase()) && (
                      <button
                        className="btn-icon btn-remove"
                        title="Remove"
                        onClick={() => handleRemoveCollaborator(collab.email)}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="share-section">
              <h3>General access</h3>
              <div className="share-access-options">
                <label className={`share-access-option${accessLevel === 'restricted' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="access"
                    checked={accessLevel === 'restricted'}
                    onChange={() => handleAccessLevelChange('restricted')}
                    disabled={!isOwner}
                  />
                  <div className="share-access-icon">&#128274;</div>
                  <div className="share-access-info">
                    <div className="share-access-title">Restricted</div>
                    <div className="share-access-desc">Only people with access can open</div>
                  </div>
                </label>
                <label className={`share-access-option${accessLevel === 'link' ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="access"
                    checked={accessLevel === 'link'}
                    onChange={() => handleAccessLevelChange('link')}
                    disabled={!isOwner}
                  />
                  <div className="share-access-icon">&#128279;</div>
                  <div className="share-access-info">
                    <div className="share-access-title">Anyone with the link</div>
                    <div className="share-access-desc">Anyone who has the link can access</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="share-dialog-footer">
              <button className="btn btn-secondary" onClick={handleCopyLink}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
              <button className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
