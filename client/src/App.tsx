import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { SessionListPage } from './pages/SessionListPage';
import { ReviewPage } from './pages/ReviewPage';

export function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <LoginPage />;

  return (
    <>
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1>Document Review</h1>
          </Link>
        </div>
        <div className="user-info">
          {user.avatar_url && <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" />}
          <span>{user.display_name}</span>
          <button className="btn btn-secondary" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<SessionListPage />} />
        <Route path="/review/:sessionId" element={<ReviewPage />} />
      </Routes>
    </>
  );
}
