import { useState } from 'react';

interface Props {
  quote: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

export function CommentDialog({ quote, onSubmit, onCancel }: Props) {
  const [body, setBody] = useState('');

  const handleSubmit = () => {
    if (!body.trim()) return;
    onSubmit(body.trim());
  };

  return (
    <div className="comment-input-overlay" onClick={onCancel}>
      <div className="comment-input-dialog" onClick={e => e.stopPropagation()}>
        <div className="quote-preview">
          "{quote.length > 200 ? quote.slice(0, 200) + '...' : quote}"
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add your comment..."
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
        />
        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
