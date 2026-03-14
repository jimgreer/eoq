export function LoginPage() {
  return (
    <div className="login-page">
      <h1>Silent Meeting</h1>
      <p>Sign in to participate in live document reviews.</p>
      <a href="/auth/google" className="btn btn-primary">
        Sign in with Google
      </a>
    </div>
  );
}
