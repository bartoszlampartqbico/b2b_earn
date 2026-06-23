import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://znsokxakmlviikvniftf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpuc29reGFrbWx2aWlrdm5pZnRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNjk2MTAsImV4cCI6MjA5Nzc0NTYxMH0.Cp8KcXLpksUbVjbwmgYWWKPTMVQ6_eqtzkKJspua27M";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_SETTINGS = {
  hourlyRate: 150,
  taxRate: 12,
  zusAmount: 1600,
  currency: "PLN",
};

const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
const DAYS_PL = ["Pn","Wt","Śr","Cz","Pt","Sb","Nd"];

async function fetchCurrentUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

async function loadSettings(userId) {
  const { data, error } = await supabase
    .from("earnings_settings")
    .select("id, hourly_rate, tax_rate, zus_amount, currency")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { hourlyRate: data.hourly_rate, taxRate: data.tax_rate, zusAmount: data.zus_amount, currency: data.currency };
}

async function saveSettings(userId, s) {
  const { data: existing, error: readError } = await supabase
    .from("earnings_settings")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase
      .from("earnings_settings")
      .update({
        hourly_rate: s.hourlyRate,
        tax_rate: s.taxRate,
        zus_amount: s.zusAmount,
        currency: s.currency,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("earnings_settings").insert({
    id: userId,
    user_id: userId,
    hourly_rate: s.hourlyRate,
    tax_rate: s.taxRate,
    zus_amount: s.zusAmount,
    currency: s.currency,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function loadDays(userId) {
  const { data, error } = await supabase
    .from("earnings_days")
    .select("date_key, hours, rate")
    .eq("user_id", userId);

  if (error) throw error;
  const map = {};
  if (data) data.forEach(r => { map[r.date_key] = { hours: r.hours, rate: r.rate }; });
  return map;
}

async function upsertDay(userId, dateKey, hours, rate) {
  const { data: existing, error: readError } = await supabase
    .from("earnings_days")
    .select("date_key")
    .eq("user_id", userId)
    .eq("date_key", dateKey)
    .maybeSingle();

  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase
      .from("earnings_days")
      .update({ hours, rate, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("date_key", dateKey);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("earnings_days").insert({
    user_id: userId,
    date_key: dateKey,
    hours,
    rate,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function deleteDay(userId, dateKey) {
  const { error } = await supabase.from("earnings_days").delete().eq("user_id", userId).eq("date_key", dateKey);
  if (error) throw error;
}

// --- Utils ---
function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year, month) { let d = new Date(year, month, 1).getDay(); return d === 0 ? 6 : d - 1; }
function fmt(n, currency = "PLN") {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? " " + currency : "");
}

// --- App ---
export default function App() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [days, setDays] = useState({});
  const [loadState, setLoadState] = useState("loading");
  const [syncStatus, setSyncStatus] = useState(null);
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState({ email: "", loading: false, message: "" });

  const [view, setView] = useState("calendar");
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [editingDay, setEditingDay] = useState(null);
  const [editHours, setEditHours] = useState("");
  const [editRate, setEditRate] = useState("");
  const [settingsForm, setSettingsForm] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const currentUser = await fetchCurrentUser();
        if (!active) return;
        setUser(currentUser);
        if (!currentUser) {
          setSettings(DEFAULT_SETTINGS);
          setDays({});
          setLoadState("ready");
          return;
        }

        const [s, d] = await Promise.all([loadSettings(currentUser.id), loadDays(currentUser.id)]);
        if (!active) return;
        if (s) setSettings(s);
        if (d) setDays(d);
        setLoadState("ready");
      } catch {
        if (!active) return;
        setUser(null);
        setSettings(DEFAULT_SETTINGS);
        setDays({});
        setLoadState("ready");
      }
    }
    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (!currentUser) {
        setSettings(DEFAULT_SETTINGS);
        setDays({});
        setLoadState("ready");
        return;
      }

      setLoadState("loading");
      try {
        const [s, d] = await Promise.all([loadSettings(currentUser.id), loadDays(currentUser.id)]);
        if (!active) return;
        setSettings(s ?? DEFAULT_SETTINGS);
        setDays(d ?? {});
        setLoadState("ready");
      } catch {
        if (!active) return;
        setLoadState("error");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const withSync = useCallback(async (fn) => {
    if (!user) {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
    setSyncStatus("saving");
    try {
      await fn();
      setSyncStatus("saved");
      setTimeout(() => setSyncStatus(null), 2000);
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus(null), 4000);
    }
  }, [user]);

  const getDateKey = (year, month, day) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const openEditDay = (day) => {
    const key = getDateKey(currentDate.year, currentDate.month, day);
    const existing = days[key];
    setEditingDay(key);
    setEditHours(existing ? String(existing.hours) : "");
    setEditRate(existing ? String(existing.rate ?? settings.hourlyRate) : String(settings.hourlyRate));
  };

  const saveDay = async () => {
    const h = parseFloat(editHours);
    const r = parseFloat(editRate);
    if (isNaN(h) || h < 0) return;
    const key = editingDay;
    setEditingDay(null);
    if (h === 0) {
      setDays(prev => { const n = { ...prev }; delete n[key]; return n; });
      await withSync(() => deleteDay(user.id, key));
    } else {
      const rate = isNaN(r) || r <= 0 ? settings.hourlyRate : r;
      setDays(prev => ({ ...prev, [key]: { hours: h, rate } }));
      await withSync(() => upsertDay(user.id, key, h, rate));
    }
  };

  const removeDayImmediate = async (key) => {
    setEditingDay(null);
    setDays(prev => { const n = { ...prev }; delete n[key]; return n; });
    await withSync(() => deleteDay(user.id, key));
  };

  const handleSaveSettings = async () => {
    const hr = parseFloat(settingsForm.hourlyRate);
    const tr = parseFloat(settingsForm.taxRate);
    const zu = parseFloat(settingsForm.zusAmount);
    if (isNaN(hr) || isNaN(tr) || isNaN(zu)) return;
    const ns = { ...settings, hourlyRate: hr, taxRate: Math.max(0, Math.min(100, tr)), zusAmount: zu };
    setSettings(ns);
    setView("calendar");
    await withSync(() => saveSettings(user.id, ns));
  };

  const monthStats = useCallback(() => {
    const { year, month } = currentDate;
    let totalHours = 0, grossEarnings = 0;
    for (let d = 1; d <= getDaysInMonth(year, month); d++) {
      const entry = days[getDateKey(year, month, d)];
      if (entry) { totalHours += entry.hours; grossEarnings += entry.hours * entry.rate; }
    }
    const tax = grossEarnings * (settings.taxRate / 100);
    return { totalHours, grossEarnings, tax, net: Math.max(0, grossEarnings - tax - settings.zusAmount) };
  }, [currentDate, days, settings]);

  const stats = monthStats();
  const prevMonth = () => setCurrentDate(d => d.month === 0 ? { year: d.year - 1, month: 11 } : { ...d, month: d.month - 1 });
  const nextMonth = () => setCurrentDate(d => d.month === 11 ? { year: d.year + 1, month: 0 } : { ...d, month: d.month + 1 });
  const today = new Date();
  const isToday = (day) => today.getFullYear() === currentDate.year && today.getMonth() === currentDate.month && today.getDate() === day;

  const daysInMonth = getDaysInMonth(currentDate.year, currentDate.month);
  const firstDay = getFirstDayOfMonth(currentDate.year, currentDate.month);
  const calendarCells = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  // --- Loading screen ---
  if (loadState === "loading") return (
    <div style={{ minHeight:"100vh", background:"#111113", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"16px", fontFamily:"'Inter',system-ui,sans-serif", color:"#6E6E73" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:"32px", height:"32px", borderRadius:"50%", border:"3px solid #2C2C2E", borderTopColor:"#AEEF6B", animation:"spin 0.8s linear infinite" }} />
      <span style={{ fontSize:"13px" }}>Łączenie z bazą danych…</span>
    </div>
  );

  if (loadState === "error") return (
    <div style={{ minHeight:"100vh", background:"#111113", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"12px", fontFamily:"'Inter',system-ui,sans-serif", color:"#FF6B6B", padding:"24px", textAlign:"center" }}>
      <div style={{ fontSize:"32px" }}>⚠</div>
      <div style={{ fontSize:"16px", fontWeight:"700" }}>Błąd połączenia z Supabase</div>
      <div style={{ fontSize:"13px", color:"#6E6E73", maxWidth:"300px" }}>Sprawdź konfigurację auth i tabele oraz upewnij się, że użytkownik jest zalogowany.</div>
      <button onClick={() => { setLoadState("loading"); location.reload(); }} style={{ marginTop:"8px", background:"#AEEF6B", border:"none", borderRadius:"10px", padding:"10px 20px", fontWeight:"700", cursor:"pointer", fontSize:"13px" }}>Spróbuj ponownie</button>
    </div>
  );

  if (!user) {
    return (
      <div style={{ minHeight:"100vh", background:"#111113", color:"#F0F0F0", fontFamily:"'Inter',system-ui,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
          *{box-sizing:border-box;margin:0;padding:0}
          input{font-family:inherit}
        `}</style>
        <div style={{ width:"100%", maxWidth:"420px", background:"linear-gradient(135deg,#1C1C1E 0%,#252528 100%)", border:"1px solid #2C2C2E", borderRadius:"24px", padding:"28px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"20px" }}>
            <div style={{ width:"32px", height:"32px", borderRadius:"10px", background:"#AEEF6B", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:"14px", fontWeight:"900", color:"#111113" }}>zł</span>
            </div>
            <div>
              <div style={{ fontSize:"18px", fontWeight:"800" }}>Zarobki</div>
              <div style={{ fontSize:"12px", color:"#6E6E73" }}>Zaloguj się, aby zsynchronizować dane</div>
            </div>
          </div>

          <div style={{ display:"grid", gap:"14px" }}>
            <div>
              <label style={{ display:"block", fontSize:"12px", textTransform:"uppercase", letterSpacing:"0.8px", color:"#6E6E73", fontWeight:"600", marginBottom:"6px" }}>Email</label>
              <input
                type="email"
                value={authForm.email}
                onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))}
                placeholder="twoj@email.pl"
                style={{ width:"100%", background:"#111113", border:"1px solid #2C2C2E", borderRadius:"12px", padding:"14px", color:"#F0F0F0", fontSize:"15px", outline:"none" }}
              />
            </div>

            <button
              onClick={async () => {
                if (!authForm.email.trim()) {
                  setAuthForm(f => ({ ...f, message: "Podaj adres email." }));
                  return;
                }

                setAuthForm(f => ({ ...f, loading: true, message: "" }));
                const { error } = await supabase.auth.signInWithOtp({
                  email: authForm.email.trim(),
                  options: {
                    emailRedirectTo: window.location.origin,
                  },
                });
                setAuthForm(f => ({
                  ...f,
                  loading: false,
                  message: error ? `Nie udało się wysłać linku: ${error.message}` : "Sprawdź skrzynkę i kliknij link logowania.",
                }));
              }}
              disabled={authForm.loading}
              style={{ width:"100%", background:"#AEEF6B", border:"none", borderRadius:"12px", padding:"14px", fontSize:"15px", fontWeight:"800", color:"#111113", cursor:"pointer", opacity: authForm.loading ? 0.7 : 1 }}
            >
              {authForm.loading ? "Wysyłam link…" : "Wyślij link logowania"}
            </button>

            {authForm.message && (
              <div style={{ fontSize:"13px", color: authForm.message.startsWith("Nie udało się") ? "#FF6B6B" : "#AEEF6B", lineHeight:"1.4" }}>
                {authForm.message}
              </div>
            )}

            <div style={{ fontSize:"12px", color:"#555558", lineHeight:"1.5" }}>
              Po zalogowaniu każda osoba widzi tylko swoje wpisy dzięki RLS i kolumnie <span style={{ color:"#AEEF6B" }}>user_id</span>.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Main UI ---
  return (
    <div style={{ minHeight:"100vh", background:"#111113", color:"#F0F0F0", fontFamily:"'Inter',system-ui,sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input{font-family:inherit}
        .day-cell:hover{background:#2A2A2E !important}
        .nav-btn:hover{background:#2A2A2E !important}
        .tab-btn:hover{opacity:0.85}
        .save-btn:hover{background:#C5FF7A !important}
        .input-field:focus{outline:none;border-color:#AEEF6B !important}
        .close-btn:hover{background:#2A2A2E !important}
        .del-btn:hover{background:rgba(255,107,107,0.12) !important}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideup{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Header */}
      <div style={{ background:"#1C1C1E", borderBottom:"1px solid #2C2C2E", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:"56px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          <div style={{ width:"28px", height:"28px", borderRadius:"8px", background:"#AEEF6B", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:"13px", fontWeight:"900", color:"#111113" }}>zł</span>
          </div>
          <span style={{ fontWeight:"700", fontSize:"15px", letterSpacing:"-0.3px" }}>Zarobki</span>
          <div style={{ width:"1px", height:"16px", background:"#2C2C2E", margin:"0 4px" }} />
          <span style={{ fontSize:"11px", color:"#3A3A3C", fontWeight:"500" }}>Supabase</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <div style={{ fontSize:"11px", color:"#6E6E73" }}>{user.email}</div>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ background:"#252528", border:"1px solid #333336", color:"#F0F0F0", borderRadius:"8px", padding:"6px 12px", fontSize:"12px", cursor:"pointer", fontWeight:"600" }}
          >
            Wyloguj
          </button>
          {syncStatus && (
            <div style={{ display:"flex", alignItems:"center", gap:"5px", fontSize:"11px", animation:"fadein 0.2s ease",
              color: syncStatus==="error" ? "#FF6B6B" : syncStatus==="saving" ? "#6E6E73" : "#AEEF6B" }}>
              {syncStatus==="saving" && <div style={{ width:"10px", height:"10px", borderRadius:"50%", border:"2px solid #333", borderTopColor:"#6E6E73", animation:"spin 0.7s linear infinite" }} />}
              {syncStatus==="saved" && "✓ Zapisano w bazie"}
              {syncStatus==="saving" && "Zapisuję…"}
              {syncStatus==="error" && "⚠ Błąd zapisu"}
            </div>
          )}
          <div style={{ display:"flex", gap:"4px" }}>
            {["calendar","settings"].map(v => (
              <button key={v} className="tab-btn" onClick={() => {
                if (v === "settings") setSettingsForm({ ...settings });
                setView(v);
              }} style={{
                background: view===v ? "#AEEF6B" : "transparent",
                color: view===v ? "#111113" : "#A0A0A5",
                border:"none", borderRadius:"8px", padding:"6px 14px",
                fontWeight:"600", fontSize:"13px", cursor:"pointer", transition:"all 0.15s",
              }}>
                {v==="calendar" ? "Kalendarz" : "Ustawienia"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar view */}
      {view==="calendar" && (
        <div style={{ maxWidth:"680px", margin:"0 auto", padding:"24px 16px" }}>
          {/* Summary card */}
          <div style={{ background:"linear-gradient(135deg,#1C1C1E 0%,#252528 100%)", border:"1px solid #2C2C2E", borderRadius:"20px", padding:"28px 28px 24px", marginBottom:"20px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px" }}>
              <button className="nav-btn" onClick={prevMonth} style={{ background:"#252528", border:"1px solid #333336", borderRadius:"10px", color:"#F0F0F0", width:"36px", height:"36px", cursor:"pointer", fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
              <div style={{ fontSize:"18px", fontWeight:"700", letterSpacing:"-0.5px" }}>{MONTHS_PL[currentDate.month]} {currentDate.year}</div>
              <button className="nav-btn" onClick={nextMonth} style={{ background:"#252528", border:"1px solid #333336", borderRadius:"10px", color:"#F0F0F0", width:"36px", height:"36px", cursor:"pointer", fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            </div>
            <div style={{ textAlign:"center", marginBottom:"24px" }}>
              <div style={{ fontSize:"11px", fontWeight:"500", color:"#6E6E73", textTransform:"uppercase", letterSpacing:"1px", marginBottom:"6px" }}>Netto do ręki</div>
              <div style={{ fontSize:"52px", fontWeight:"900", letterSpacing:"-2px", color: stats.net>0 ? "#AEEF6B" : "#F0F0F0", lineHeight:"1" }}>
                {fmt(stats.net, settings.currency)}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"12px" }}>
              {[
                { label:"Przychód brutto", value:fmt(stats.grossEarnings, settings.currency), color:"#F0F0F0" },
                { label:`Podatek (${settings.taxRate}%)`, value:fmt(stats.tax, settings.currency), color:"#FF6B6B" },
                { label:"ZUS", value:fmt(settings.zusAmount, settings.currency), color:"#FFB347" },
              ].map(item => (
                <div key={item.label} style={{ background:"#111113", borderRadius:"12px", padding:"12px", border:"1px solid #2C2C2E" }}>
                  <div style={{ fontSize:"10px", color:"#6E6E73", fontWeight:"500", textTransform:"uppercase", letterSpacing:"0.8px", marginBottom:"4px" }}>{item.label}</div>
                  <div style={{ fontSize:"14px", fontWeight:"700", color:item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:"12px", textAlign:"center", fontSize:"12px", color:"#555558" }}>
              Przepracowano łącznie <span style={{ color:"#AEEF6B", fontWeight:"700" }}>{stats.totalHours}h</span>
            </div>
          </div>

          {/* Calendar grid */}
          <div style={{ background:"#1C1C1E", border:"1px solid #2C2C2E", borderRadius:"20px", padding:"20px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"4px", marginBottom:"8px" }}>
              {DAYS_PL.map(d => (
                <div key={d} style={{ textAlign:"center", fontSize:"11px", fontWeight:"600", color: d==="Sb"||d==="Nd" ? "#555558" : "#6E6E73", padding:"4px 0", textTransform:"uppercase", letterSpacing:"0.5px" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"4px" }}>
              {calendarCells.map((day, i) => {
                if (!day) return <div key={`e-${i}`} />;
                const key = getDateKey(currentDate.year, currentDate.month, day);
                const entry = days[key];
                const earnings = entry ? entry.hours * entry.rate : 0;
                const isWknd = (firstDay + day - 1) % 7 >= 5;
                const isTd = isToday(day);
                return (
                  <button key={day} className="day-cell" onClick={() => openEditDay(day)} style={{
                    background: entry ? "rgba(174,239,107,0.08)" : "#111113",
                    border: isTd ? "2px solid #AEEF6B" : entry ? "1px solid rgba(174,239,107,0.25)" : "1px solid #222225",
                    borderRadius:"12px", padding:"8px 4px 6px", cursor:"pointer", transition:"background 0.1s",
                    minHeight:"64px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-between",
                  }}>
                    <span style={{ fontSize:"13px", fontWeight: isTd?"800":"500", color: isTd?"#AEEF6B":isWknd?"#555558":"#A0A0A5" }}>{day}</span>
                    {entry ? (
                      <div style={{ textAlign:"center" }}>
                        <div style={{ fontSize:"11px", fontWeight:"700", color:"#AEEF6B" }}>{entry.hours}h</div>
                        <div style={{ fontSize:"9px", color:"#6E6E73", marginTop:"1px" }}>{fmt(earnings,"")}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize:"16px", color:"#333336" }}>+</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Settings view */}
      {view==="settings" && settingsForm && (
        <div style={{ maxWidth:"480px", margin:"0 auto", padding:"24px 16px" }}>
          <div style={{ background:"#1C1C1E", border:"1px solid #2C2C2E", borderRadius:"20px", padding:"24px" }}>
            <h2 style={{ fontSize:"18px", fontWeight:"800", marginBottom:"24px", letterSpacing:"-0.5px" }}>Ustawienia</h2>
            {[
              { label:"Domyślna stawka godzinowa (PLN)", key:"hourlyRate", hint:"Stosowana przy nowych wpisach" },
              { label:"Podatek dochodowy (%)", key:"taxRate", hint:"Procent od przychodu brutto" },
              { label:"Miesięczna składka ZUS (PLN)", key:"zusAmount", hint:"Odliczana od przychodu brutto" },
            ].map(field => (
              <div key={field.key} style={{ marginBottom:"20px" }}>
                <label style={{ fontSize:"12px", fontWeight:"600", color:"#6E6E73", textTransform:"uppercase", letterSpacing:"0.8px", display:"block", marginBottom:"6px" }}>{field.label}</label>
                <input className="input-field" type="number" value={settingsForm[field.key]}
                  onChange={e => setSettingsForm(f => ({ ...f, [field.key]: e.target.value }))}
                  style={{ width:"100%", background:"#111113", border:"1px solid #2C2C2E", borderRadius:"10px", padding:"12px 14px", color:"#F0F0F0", fontSize:"15px", fontWeight:"600", transition:"border-color 0.15s" }} />
                <div style={{ fontSize:"11px", color:"#444448", marginTop:"4px" }}>{field.hint}</div>
              </div>
            ))}
            {/* Preview */}
            <div style={{ background:"#111113", borderRadius:"12px", padding:"16px", border:"1px solid #222225", marginBottom:"20px" }}>
              <div style={{ fontSize:"11px", color:"#555558", marginBottom:"8px", fontWeight:"600", textTransform:"uppercase", letterSpacing:"0.8px" }}>Podgląd — 160h miesięcznie</div>
              {(() => {
                const hr = parseFloat(settingsForm.hourlyRate)||0;
                const tr = parseFloat(settingsForm.taxRate)||0;
                const zu = parseFloat(settingsForm.zusAmount)||0;
                const gross = 160*hr, tax = gross*(tr/100), net = gross-tax-zu;
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:"6px" }}>
                    <Row label="Brutto" value={fmt(gross)} />
                    <Row label={`Podatek ${tr}%`} value={`- ${fmt(tax)}`} color="#FF6B6B" />
                    <Row label="ZUS" value={`- ${fmt(zu)}`} color="#FFB347" />
                    <div style={{ borderTop:"1px solid #2C2C2E", paddingTop:"8px", marginTop:"2px" }}>
                      <Row label="Netto" value={fmt(Math.max(0,net))} color="#AEEF6B" bold />
                    </div>
                  </div>
                );
              })()}
            </div>
            <button className="save-btn" onClick={handleSaveSettings} style={{ width:"100%", background:"#AEEF6B", border:"none", borderRadius:"12px", padding:"14px", fontSize:"15px", fontWeight:"700", color:"#111113", cursor:"pointer", transition:"background 0.15s" }}>
              Zapisz ustawienia
            </button>
          </div>
        </div>
      )}

      {/* Day edit modal */}
      {editingDay && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:100, backdropFilter:"blur(4px)" }}
          onClick={e => { if (e.target===e.currentTarget) setEditingDay(null); }}>
          <div style={{ background:"#1C1C1E", borderRadius:"20px 20px 0 0", padding:"24px", width:"100%", maxWidth:"480px", border:"1px solid #2C2C2E", borderBottom:"none", animation:"slideup 0.2s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
              <div>
                <div style={{ fontSize:"16px", fontWeight:"800", letterSpacing:"-0.3px" }}>Edytuj dzień</div>
                <div style={{ fontSize:"12px", color:"#6E6E73", marginTop:"2px" }}>{editingDay}</div>
              </div>
              <button className="close-btn" onClick={() => setEditingDay(null)} style={{ background:"#252528", border:"1px solid #333336", borderRadius:"10px", color:"#A0A0A5", width:"32px", height:"32px", cursor:"pointer", fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px", marginBottom:"16px" }}>
              <div>
                <label style={{ fontSize:"11px", color:"#6E6E73", fontWeight:"600", textTransform:"uppercase", letterSpacing:"0.8px", display:"block", marginBottom:"6px" }}>Godziny</label>
                <input className="input-field" type="number" min="0" max="24" step="0.5"
                  value={editHours} onChange={e => setEditHours(e.target.value)} placeholder="0" autoFocus
                  style={{ width:"100%", background:"#111113", border:"1px solid #2C2C2E", borderRadius:"10px", padding:"12px 14px", color:"#F0F0F0", fontSize:"18px", fontWeight:"700", transition:"border-color 0.15s" }} />
              </div>
              <div>
                <label style={{ fontSize:"11px", color:"#6E6E73", fontWeight:"600", textTransform:"uppercase", letterSpacing:"0.8px", display:"block", marginBottom:"6px" }}>Stawka (PLN/h)</label>
                <input className="input-field" type="number" min="0"
                  value={editRate} onChange={e => setEditRate(e.target.value)}
                  style={{ width:"100%", background:"#111113", border:"1px solid #2C2C2E", borderRadius:"10px", padding:"12px 14px", color:"#F0F0F0", fontSize:"18px", fontWeight:"700", transition:"border-color 0.15s" }} />
              </div>
            </div>
            {parseFloat(editHours)>0 && (
              <div style={{ background:"rgba(174,239,107,0.06)", border:"1px solid rgba(174,239,107,0.2)", borderRadius:"10px", padding:"10px 14px", marginBottom:"16px", fontSize:"13px", color:"#AEEF6B", fontWeight:"600" }}>
                Zarobek: {fmt(parseFloat(editHours)*(parseFloat(editRate)||settings.hourlyRate))} brutto
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
              <button className="del-btn" onClick={() => removeDayImmediate(editingDay)} style={{ background:"transparent", border:"1px solid rgba(255,107,107,0.2)", borderRadius:"12px", padding:"12px", fontSize:"14px", fontWeight:"600", color:"#FF6B6B", cursor:"pointer", transition:"background 0.15s" }}>
                Usuń dzień
              </button>
              <button className="save-btn" onClick={saveDay} style={{ background:"#AEEF6B", border:"none", borderRadius:"12px", padding:"12px", fontSize:"14px", fontWeight:"700", color:"#111113", cursor:"pointer", transition:"background 0.15s" }}>
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, color="#A0A0A5", bold=false }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ fontSize:"12px", color:"#555558" }}>{label}</span>
      <span style={{ fontSize:"13px", fontWeight:bold?"700":"600", color }}>{value}</span>
    </div>
  );
}
