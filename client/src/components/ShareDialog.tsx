import { useState, useEffect } from 'react';
import { api } from '../api/client';

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

export function ShareDialog({ sessionId, sessionTitle, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [googleDocUrl, setGoogleDocUrl] = useState('');
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsDriveAuth, setNeedsDriveAuth] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkedDocId, setLinkedDocId] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/sessions/${sessionId}/collaborators`)
      .then(res => {
        setOwner(res.data.owner);
        setLinkedDocId(res.data.google_doc_id || null);
        // If creator hasn't granted Drive access yet, show the prompt
        if (!res.data.hasDriveToken) {
          setNeedsDriveAuth(true);
        }
      })
      .catch(err => {
        setError(err.response?.data?.error || 'Failed to load sharing settings');
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleLinkDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleDocUrl.trim()) return;

    setLinking(true);
    setError(null);
    setNeedsDriveAuth(false);

    try {
      const res = await api.post(`/sessions/${sessionId}/google-doc`, { google_doc_url: googleDocUrl.trim() });
      setLinkedDocId(res.data.google_doc_id);
      setGoogleDocUrl('');
    } catch (err: any) {
      if (err.response?.data?.needsDriveAuth) {
        setNeedsDriveAuth(true);
        setError(null); // Clear error so we show the Drive auth prompt
      } else {
        setError(err.response?.data?.error || 'Failed to link Google Doc');
      }
    } finally {
      setLinking(false);
    }
  };

  const handleUnlinkDoc = async () => {
    setError(null);
    try {
      await api.delete(`/sessions/${sessionId}/google-doc`);
      setLinkedDocId(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to unlink Google Doc');
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
            {error && !needsDriveAuth && <div className="share-error">{error}</div>}

            {needsDriveAuth && (
              <div className="share-drive-auth">
                <p>To link a Google Doc, you need to grant Drive access so we can verify permissions.</p>
                <a
                  href={`/auth/google/drive?returnUrl=${encodeURIComponent(`/review/${sessionId}`)}`}
                  className="btn btn-primary"
                  style={{ display: 'inline-block', marginTop: '8px' }}
                >
                  Grant Drive Access
                </a>
              </div>
            )}

            <div className="share-section">
              <h3>Access</h3>

              {linkedDocId ? (
                <div className="share-access-status">
                  <div className="share-access-icon">&#128196;</div>
                  <div className="share-access-info">
                    <div className="share-access-title">Linked to Google Doc</div>
                    <div className="share-access-desc">
                      Anyone with access to{' '}
                      <a
                        href={`https://docs.google.com/document/d/${linkedDocId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        the source document
                      </a>
                      {' '}can view this session
                    </div>
                  </div>
                  <button
                    className="btn btn-text btn-sm"
                    onClick={handleUnlinkDoc}
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <>
                  <div className="share-access-status restricted">
                    <div className="share-access-icon">&#128274;</div>
                    <div className="share-access-info">
                      <div className="share-access-title">Restricted</div>
                      <div className="share-access-desc">
                        Only {owner?.display_name || 'the owner'} can access. Link a Google Doc to share with others.
                      </div>
                    </div>
                  </div>

                  {!needsDriveAuth && (
                    <form className="share-link-form" onSubmit={handleLinkDoc}>
                      <input
                        type="text"
                        placeholder="Paste a Google Doc URL to control access"
                        value={googleDocUrl}
                        onChange={e => setGoogleDocUrl(e.target.value)}
                        disabled={linking}
                      />
                      <button type="submit" className="btn btn-primary" disabled={linking || !googleDocUrl.trim()}>
                        {linking ? 'Linking...' : 'Link'}
                      </button>
                    </form>
                  )}
                </>
              )}
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
