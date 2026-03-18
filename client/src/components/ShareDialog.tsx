import { useState } from 'react';

interface Props {
  sessionId: string;
  sessionTitle: string;
  googleDocId: string;
  onClose: () => void;
}

export function ShareDialog({ sessionId, sessionTitle, googleDocId, onClose }: Props) {
  const [copied, setCopied] = useState(false);

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

        <div className="share-section">
          <h3>Access</h3>
          <div className="share-access-status">
            <div className="share-access-icon">&#128196;</div>
            <div className="share-access-info">
              <div className="share-access-title">Linked to Google Doc</div>
              <div className="share-access-desc">
                Anyone with access to{' '}
                <a
                  href={`https://docs.google.com/document/d/${googleDocId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  the source document
                </a>
                {' '}can view this session
              </div>
            </div>
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
      </div>
    </div>
  );
}
