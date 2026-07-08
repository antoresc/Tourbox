"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

export default function UnlockModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const supabase = createBrowserSupabase();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    onClose();
    router.refresh();
  }

  async function magicLink() {
    if (!email) {
      setMsg("Inserisci la tua email");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined },
    });
    setBusy(false);
    setMsg(error ? error.message : "Controlla la tua email per il link di accesso.");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__hd">
          <span className="modal__title">Accesso staff</span>
          <button className="modal__close" aria-label="Chiudi" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal__sub">
          La scheda tecnica (contatti, hotel, orari) è riservata allo staff.
        </p>
        <form onSubmit={signIn} className="modal__form">
          <input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="modal__submit" disabled={busy}>
            {busy ? "…" : "Entra"}
          </button>
        </form>
        <button className="modal__magic" onClick={magicLink} disabled={busy}>
          Inviami un link via email
        </button>
        {msg && <div className="modal__msg">{msg}</div>}
      </div>
    </div>
  );
}
