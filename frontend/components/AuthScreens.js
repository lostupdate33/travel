"use client";

import { Sparkles } from "lucide-react";

export function SetupPasswordScreen({
  authMessage,
  setupForm,
  setSetupForm,
  submitSetupPassword
}) {
  return (
    <main className="auth-screen">
      <form className="auth-panel" onSubmit={submitSetupPassword}>
        <Sparkles size={24} />
        <h1>Set Password</h1>
        <p>Create your password to activate this Travel Ideate account.</p>
        <label>
          New password
          <input
            type="password"
            value={setupForm.password}
            onChange={(event) => setSetupForm((current) => ({ ...current, password: event.target.value }))}
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={setupForm.confirmPassword}
            onChange={(event) => setSetupForm((current) => ({ ...current, confirmPassword: event.target.value }))}
          />
        </label>
        {authMessage && <p className="auth-message">{authMessage}</p>}
        <button className="primary-button" type="submit">Save password</button>
      </form>
    </main>
  );
}

export function LoginScreen({
  authMessage,
  loginForm,
  setLoginForm,
  submitLogin
}) {
  return (
    <main className="auth-screen">
      <form className="auth-panel" onSubmit={submitLogin}>
        <Sparkles size={24} />
        <h1>Travel Ideate</h1>
        <p>Sign in to manage proposals and tenant inventory.</p>
        <label>
          Email
          <input
            type="email"
            value={loginForm.email}
            onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={loginForm.password}
            onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
          />
        </label>
        {authMessage && <p className="auth-message">{authMessage}</p>}
        <button className="primary-button" type="submit">Sign in</button>
      </form>
    </main>
  );
}
