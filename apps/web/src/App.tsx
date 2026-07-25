import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CourseProgress,
  LearningGoal,
  Lesson,
  Profile,
  SelfLevel,
  WsServerMessage,
} from "@aispeakpro/shared";
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
  if (!profile.onboarded) return <Onboarding onDone={setProfile} />;
  return <Home profile={profile} onLogout={() => { clearTokens(); setProfile(null); }} />;
}

function Auth({ onAuthed }: { onAuthed: (p: Profile) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const tokens =
        mode === "register"
          ? await api.register(email, password, "Hindi")
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
        {error && <div className="error">{error}</div>}
        <button disabled={busy} type="submit">{mode === "register" ? "Create account" : "Log in"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "register" ? "login" : "register")}>
          {mode === "register" ? "Have an account? Log in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}

const GOALS: { value: LearningGoal; label: string }[] = [
  { value: "work", label: "For my job / career" },
  { value: "interview", label: "To crack job interviews" },
  { value: "travel", label: "For travel" },
  { value: "exam", label: "For an exam (IELTS etc.)" },
  { value: "academic", label: "For school / college" },
  { value: "daily", label: "Daily conversation" },
];
const LEVELS: { value: SelfLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];
const TIMES = [5, 10, 20, 30];

function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [goal, setGoal] = useState<LearningGoal>("daily");
  const [selfLevel, setSelfLevel] = useState<SelfLevel>("beginner");
  const [dailyGoalMinutes, setMinutes] = useState(10);
  const [nativeLanguage, setNative] = useState("Hindi");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.onboard({ goal, selfLevel, dailyGoalMinutes, nativeLanguage });
      onDone(res.profile);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <div className="card wide">
        <h1>Let's set up your learning</h1>
        <p className="muted">A few quick questions so we can build the right course for you.</p>

        <label className="q">Why are you learning English?</label>
        <div className="opts">
          {GOALS.map((g) => (
            <button key={g.value} className={`opt ${goal === g.value ? "sel" : ""}`} onClick={() => setGoal(g.value)}>{g.label}</button>
          ))}
        </div>

        <label className="q">How would you rate your English now?</label>
        <div className="opts">
          {LEVELS.map((l) => (
            <button key={l.value} className={`opt ${selfLevel === l.value ? "sel" : ""}`} onClick={() => setSelfLevel(l.value)}>{l.label}</button>
          ))}
        </div>

        <label className="q">How long can you practice each day?</label>
        <div className="opts">
          {TIMES.map((t) => (
            <button key={t} className={`opt ${dailyGoalMinutes === t ? "sel" : ""}`} onClick={() => setMinutes(t)}>{t} min</button>
          ))}
        </div>

        <label className="q">Your first language</label>
        <input value={nativeLanguage} onChange={(e) => setNative(e.target.value)} />

        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? "Building your course…" : "Start learning"}
        </button>
      </div>
    </div>
  );
}

function Home({ profile, onLogout }: { profile: Profile; onLogout: () => void }) {
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<{ sessionId: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    api.myCourse().then((r) => setProgress(r.progress)).finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload]);

  const startLesson = async (lesson: Lesson, title: string) => {
    const s = await api.startSession({
      mode: lesson.kind,
      scenarioSlug: lesson.scenarioSlug ?? undefined,
      lessonFocus: lesson.focus ?? undefined,
    });
    setActive({ sessionId: s.id, title });
  };

  const startFree = async () => {
    const s = await api.startSession({ mode: "tutor" });
    setActive({ sessionId: s.id, title: "Free conversation" });
  };

  const markDone = async () => {
    setBusy(true);
    try {
      const r = await api.completeLesson();
      setProgress(r.progress);
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <Practice
        sessionId={active.sessionId}
        title={active.title}
        onExit={() => { setActive(null); reload(); }}
      />
    );
  }

  const course = progress?.course;
  const done = course && progress ? progress.completedCount >= progress.totalLessons : false;

  return (
    <div className="app">
      <header>
        <strong>AISpeakPro</strong>
        <span className="muted">
          {profile.email} · {profile.cefr.speaking} · goal: {profile.learningGoal ?? "—"} · {profile.dailyGoalMinutes} min/day
        </span>
        <button className="link" onClick={onLogout}>Log out</button>
      </header>

      {loading && <p className="muted">Loading your course…</p>}

      {course && progress && (
        <section>
          <h2>{course.title}</h2>
          <p className="muted">{course.description}</p>
          <div className="progressbar">
            <div className="fill" style={{ width: `${Math.round((progress.completedCount / Math.max(progress.totalLessons, 1)) * 100)}%` }} />
          </div>
          <p className="muted">{progress.completedCount} of {progress.totalLessons} lessons complete{done ? " — course finished! 🎉" : ""}</p>

          <div className="lessons">
            {course.lessons.map((lesson, i) => {
              const isDone = progress.completed.includes(i);
              const isCurrent = i === progress.currentIndex && !done;
              return (
                <div key={i} className={`lesson ${isCurrent ? "current" : ""}`}>
                  <div className="lnum">{isDone ? "✓" : i + 1}</div>
                  <div className="lbody">
                    <div className="ltitle">{lesson.title}</div>
                    <div className="muted small">{lesson.kind === "scene" ? "Role-play scene" : "Guided practice"}</div>
                  </div>
                  <div className="lactions">
                    {(isCurrent || isDone) && (
                      <button onClick={() => startLesson(lesson, lesson.title)}>{isDone ? "Practice again" : "Practice"}</button>
                    )}
                    {isCurrent && (
                      <button className="primary" disabled={busy} onClick={markDone}>Mark done</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2>Just want to talk?</h2>
        <button onClick={startFree}>Start free conversation</button>
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
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = openRealtime(sessionId);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as WsServerMessage;
      if (msg.type === "ready") { setReady(true); setStatus("Your turn — tap the mic or type."); }
      else if (msg.type === "agent_turn") { setLines((l) => [...l, { who: "tutor", text: msg.text }]); speak(msg.text); }
      else if (msg.type === "quota_exceeded") setStatus(`Daily free minutes used up: ${msg.message}`);
      else if (msg.type === "ended") { setEnded(true); setStatus("Session complete. Tap Back to continue your course."); }
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
    if (!isSpeechSupported()) { setStatus("Speech recognition not supported here — please type instead."); return; }
    const rec = createRecognizer((t) => sendTurn(t));
    if (!rec) return;
    setStatus("Listening…");
    rec.onend = () => setStatus("Your turn.");
    rec.start();
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

      {ended && (
        <div className="composer">
          <button className="primary" onClick={onExit}>← Back to my course</button>
        </div>
      )}
    </div>
  );
}
