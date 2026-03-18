import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/client';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

interface Props {
  onSelect: (docId: string) => void;
  disabled?: boolean;
}

export function GoogleDocPicker({ onSelect, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [pickerReady, setPickerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the Picker API when gapi is available
  useEffect(() => {
    const loadPicker = () => {
      if (window.gapi) {
        window.gapi.load('picker', () => {
          setPickerReady(true);
        });
      }
    };

    if (window.gapi) {
      loadPicker();
    } else {
      // Wait for gapi to load
      const checkGapi = setInterval(() => {
        if (window.gapi) {
          clearInterval(checkGapi);
          loadPicker();
        }
      }, 100);
      return () => clearInterval(checkGapi);
    }
  }, []);

  const openPicker = useCallback(async () => {
    if (!pickerReady) {
      setError('Picker not ready yet');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Get access token from server
      const tokenRes = await authApi.get('/picker-token');
      const { accessToken } = tokenRes.data;

      // Create and show the picker
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCUMENTS)
        .setMimeTypes('application/vnd.google-apps.document')
        .setMode(window.google.picker.DocsViewMode.LIST);

      const pickerBuilder = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            onSelect(doc.id);
          }
        })
        .setTitle('Select a Google Doc');

      const picker = pickerBuilder.build();
      picker.setVisible(true);
    } catch (err: any) {
      console.error('Failed to open picker:', err);
      if (err.response?.data?.needsDriveAuth) {
        // Redirect to Drive auth
        window.location.href = '/auth/google/drive?returnUrl=/';
      } else {
        setError(err.response?.data?.error || 'Failed to open picker');
      }
    } finally {
      setLoading(false);
    }
  }, [pickerReady, onSelect]);

  return (
    <div className="picker-wrapper">
      <button
        className="btn btn-primary btn-picker"
        onClick={openPicker}
        disabled={disabled || loading || !pickerReady}
      >
        {loading ? 'Opening...' : 'Select from Google Drive'}
      </button>
      {error && <span className="picker-error">{error}</span>}
    </div>
  );
}
