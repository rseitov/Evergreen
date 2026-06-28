import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../app/AppContext";
import Wordmark from "../app/Wordmark";

export default function LoginPage() {
  const app = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await app.login(email, password);
      navigate("/");
    } catch {
      setError("Неверная почта или пароль");
    }
  }

  return (
    <div className="centered">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="wordmark">
          <Wordmark />
        </div>
        <h1>Вход</h1>
        <p className="sub">Войдите, чтобы управлять регламентами.</p>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="btn">
          Войти
        </button>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
