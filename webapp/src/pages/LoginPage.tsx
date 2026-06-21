import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../app/AppContext";

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
    <form onSubmit={onSubmit}>
      <h1>Вход</h1>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Пароль
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button type="submit">Войти</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
