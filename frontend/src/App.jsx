// frontend/src/App.jsx
import { useState, useEffect } from "react";
import SASTPage    from "./pages/SASTPage";
import PenTestPage from "./pages/PenTestPage";
import GitHubPage  from "./pages/GitHubPage";

const NAV = [
  { id: "sast",    icon: "🔍", label: "SAST Scans"    },
  { id: "pentest", icon: "🔬", label: "Pen Tests"     },
  { id: "github",  icon: "⚙️",  label: "GitHub Config" },
]; 
const VALID_PAGES = NAV.map(n => n.id);
const getPageFromHash = () => {
  const hash = window.location.hash.replace("#", "");
  return VALID_PAGES.includes(hash) ? hash : "sast";
};

export default function App() {
  const [page, setPage] = useState(getPageFromHash);

  // Sync state → URL hash when user clicks a tab
  const navigate = (id) => {
    window.location.hash = id;
    setPage(id);
  };

  // Sync URL hash → state on browser back/forward/refresh
  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f172a",
      color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>

      {/* Sidebar */}
      <nav style={{ width: "200px", background: "#1e293b", padding: "24px 16px",
        display: "flex", flexDirection: "column", gap: "4px", flexShrink: 0 }}>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#3B82F6" }}>🛡️ SecMon</div>
          <div style={{ fontSize: "11px", color: "#475569", marginTop: "2px" }}>Security Monitor</div>
        </div>
        {NAV.map(n => (
          <button key={n.id} onClick={() => navigate(n.id)} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 12px", borderRadius: "8px", border: "none",
            cursor: "pointer", fontSize: "13px", textAlign: "left",
            transition: "all 0.2s",
            background: page === n.id ? "#3B82F620" : "transparent",
            color:      page === n.id ? "#3B82F6"   : "#94a3b8",
            fontWeight: page === n.id ? 600          : 400,
          }}>
            <span>{n.icon}</span>{n.label}
          </button>
        ))}
      </nav>

      {/* Page content */}
      <main style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
        {page === "sast"    && <SASTPage />}
        {page === "pentest" && <PenTestPage />}
        {page === "github"  && <GitHubPage />}
      </main>

    </div>
  );
}