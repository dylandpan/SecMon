import { useState, useEffect } from "react";
import { getScanList, getScanById } from "../api/client";

const badge = (status) => {
  const colors = { PASS: "#22c55e", FAIL: "#ef4444", WARN: "#eab308" };
  return {
    display: "inline-block", padding: "2px 10px", borderRadius: "9999px",
    fontSize: "12px", fontWeight: 600, color: "#0f172a",
    background: colors[status] ?? "#64748b",
  };
};

const card = {
  background: "#1e293b", borderRadius: "12px", padding: "20px",
  marginBottom: "12px", cursor: "pointer", transition: "background 0.15s",
};

export default function SASTPage() {
  const [scans, setScans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getScanList().then(setScans).catch(console.error).finally(() => setLoading(false));
  }, []);

  const openDetail = async (scan) => {
    setSelected(scan.scanId);
    try {
      const d = await getScanById(scan.scanId);
      setDetail(d);
    } catch (e) { console.error(e); }
  };

  if (loading) return <p style={{ color: "#94a3b8" }}>Loading scans...</p>;

  if (detail && selected) {
    return (
      <div>
        <button onClick={() => { setSelected(null); setDetail(null); }}
          style={{ background: "none", border: "none", color: "#3B82F6",
            cursor: "pointer", fontSize: "14px", marginBottom: "16px" }}>
          &larr; Back to list
        </button>
        <h2 style={{ fontSize: "20px", marginBottom: "4px" }}>Scan {detail.scanId?.slice(0, 8)}</h2>
        <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "16px" }}>
          {detail.repoId} &middot; {detail.branch} &middot; {detail.timestamp?.slice(0, 19).replace("T", " ")}
        </p>
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
          {[["High", detail.high, "#ef4444"], ["Medium", detail.medium, "#eab308"], ["Low", detail.low, "#22c55e"]].map(([label, count, color]) => (
            <div key={label} style={{ ...card, flex: 1, textAlign: "center", cursor: "default" }}>
              <div style={{ fontSize: "28px", fontWeight: 700, color }}>{count ?? 0}</div>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>{label}</div>
            </div>
          ))}
        </div>
        {detail.vulnerabilities?.length > 0 && (
          <div style={card}>
            <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>Vulnerabilities</h3>
            {detail.vulnerabilities.map((v, i) => (
              <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid #334155" : "none" }}>
                <span style={{ fontWeight: 600 }}>{v.type ?? v.name ?? `Issue ${i + 1}`}</span>
                {v.severity && <span style={{ ...badge(v.severity === "high" ? "FAIL" : v.severity === "medium" ? "WARN" : "PASS"), marginLeft: "8px" }}>{v.severity}</span>}
                {v.message && <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>{v.message}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "20px" }}>SAST Scans</h1>
      {scans.length === 0 && <p style={{ color: "#94a3b8" }}>No scans yet.</p>}
      {scans
        .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
        .map(s => (
        <div key={s.scanId} style={card} onClick={() => openDetail(s)}
          onMouseEnter={e => e.currentTarget.style.background = "#253348"}
          onMouseLeave={e => e.currentTarget.style.background = "#1e293b"}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "15px" }}>{s.repoId ?? "Unknown repo"}</div>
              <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>
                {s.branch ?? ""} &middot; {s.timestamp?.slice(0, 19).replace("T", " ") ?? ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={badge(s.status)}>{s.status}</span>
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                {(s.high ?? 0)}H {(s.medium ?? 0)}M {(s.low ?? 0)}L
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
