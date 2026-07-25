import { useCallback, useEffect, useRef, useState } from "react";
import type { Profile, Scenario, WsServerMessage } from "@aispeakpro/shared";
import { api, clearTokens, loadTokens, openRealtime, saveTokens } from "./api";
import { createRecognizer, isSpeechSupported, speak } from "./speech";

interface ChatLine {
  who: "you" | "tutor";
  text: string;
}

export function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    if (loadTokens()) {
      api.me().then(setProfile).catch(() => clearTokens()).finally(() => setBooting(false));
    } else {
      setBooting(false);
    }
  }, []);

  if (booting) return <div className="center">Loading…</div>;
  if (!profile) return <Auth onAuthed={setProfile} />;
  return <Home profile={profile} onLogout={() => { clearTokens(); setProfile(null); }} />;
}

function Auth({ onAuthed }: { onAuthed: (p: Profile) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nativeLanguage, setNative] = useState("Hindi");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const tokens =
        mode === "register"
          ? await api.register(email, password, nativeLanguage)
          : await api.login(email, password);
      saveTokens(tokens);
      onAuthed(await api.me());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1>AISpeakPro</h1>
        <p className="muted">Practice spoken English with an AI tutor.</p>
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="Password (min 8)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {mode === "register" && (
          <input placeholder="Native language" value={nativeLanguage} onChange={(e) => setNative(e.target.value)} />
        )}
        {error && <div className="error">{error}</div>}
        <button disabled={busy} type="submit">{mode === "register" ? "Create account" : "Log in"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "register" ? "login" : "register")}>
          {mode === "register" ? "Have an account? Log in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}

function Home({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [active, setActive] = useState<{ sessionId: string; title: string } | null>(null);

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => setScenarios([]));
  }, []);

  const start = async (mode: "tutor" | "scene", scenario?: Scenario) => {
    const s = await api.startSession(mode, scenario?.slug);
    setActive({ sessionId: s.id, title: scenario?.title ?? "Free conversation" });
  };

  if (active) return <Practice sessionId={active.sessionId} title={active.title} onExit={() => setActive(null)} />;

  return (
    <div className="app">
      <header>
        <strong>AISpeakPro</strong>
        <span className="muted">
          {profile.email} · {profile.cefr.speaking} speaking · {profile.minutesUsedToday}/{profile.freeDailyMinutes} min today
        </span>
        <button className="link" onClick={onLogout}>Log out</button>
      </header>

      <section>
        <h2>One-to-one tutor</h2>
        <button className="primary" onClick={() => start("tutor")}>Start free conversation</button>
      </section>

      <section>
        <h2>Scene practice</h2>
        <div className="grid">
          {scenarios.map((s) => (
            <div className="tile" key={s.id}>
              <div className="badge">{s.difficulty}</div>
              <h3>{s.title}</h3>
              <p className="muted">{s.description}</p>
              <button onClick={() => start("scene", s)}>Practice</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Practice({ sessionId, title, onExit }: { sessionId: string; title: string; onExit: () => void }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Connecting…");
  const [draft, setDraft] = useState("");
  const [ended, setEnded] = useState(false);
  const [feedback, setFeedback] = useState<unknown>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = openRealtime(sessionId);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as WsServerMessage;
      if (msg.type === "ready") { setReady(true); setStatus("Your turn — tap the mic or type."); }
      else if (msg.type === "agent_turn") { setLines((l) => [...l, { who: "tutor", text: msg.text }]); speak(msg.text); }
      else if (msg.type === "quota_exceeded") setStatus(`Daily free minutes used up: ${msg.message}`);
      else if (msg.type === "ended") loadFeedback();
      else if (msg.type === "error") setStatus(msg.message);
    };
    ws.onclose = () => setReady(false);
    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const sendTurn = useCallback((text: string) => {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setLines((l) => [...l, { who: "you", text }]);
    wsRef.current.send(JSON.stringify({ type: "user_turn", text }));
    setDraft("");
  }, []);

  const mic = () => {
    if (!isSpeechSupported()) { setStatus("Speech recognition not supported in this browser — type instead."); return; }
    const rec = createRecognizer((t) => sendTurn(t));
    if (!rec) return;
    setStatus("Listening…");
    rec.onend = () => setStatus("Your turn.");
    rec.start();
  };

  const loadFeedback = async () => {
    setEnded(true);
    setStatus("Session complete. Generating your feedback…");
    // Feedback is produced async; poll a couple of times.
    for (let i = 0; i < 5; i++) {
      const detail = await api.session(sessionId).catch(() => null);
      if (detail?.feedback) { setFeedback(detail.feedback); break; }
      await new Promise((r) => setTimeout(r, 800));
    }
    setStatus("Done.");
  };

  const end = () => wsRef.current?.send(JSON.stringify({ type: "end" }));

  return (
    <div className="app practice">
      <header>
        <button className="link" onClick={onExit}>← Back</button>
        <strong>{title}</strong>
        <span className="muted">{status}</span>
      </header>

      <div className="chat">
        {lines.map((l, i) => (
          <div key={i} className={`bubble ${l.who}`}>{l.text}</div>
        ))}
      </div>

      {!ended && (
        <div className="composer">
          <button className="mic" onClick={mic} disabled={!ready} title="Speak">🎙️</button>
          <input
            placeholder="…or type your reply"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendTurn(draft)}
            disabled={!ready}
          />
          <button onClick={() => sendTurn(draft)} disabled={!ready}>Send</button>
          <button className="danger" onClick={end}>End</button>
        </div>
      )}

      {feedback != null && (
        <div className="card feedback">
          <h3>Session feedback</h3>
          <pre>{JSON.stringify(feedback, null, 2)}</pre>
          <button onClick={onExit}>Done</button>
        </div>
      )}
    </div>
  );
}
