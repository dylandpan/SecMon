import { useState, useEffect } from "react";
import { getRepos, getWebhookUrl, addRepo } from "../api/client";

const card = {
  background: "#1e293b", borderRadius: "12px", padding: "20px", marginBottom: "12px",
};

export default function GitHubPage() {
  const [repos, setRepos] = useState([]);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [r, w] = await Promise.all([getRepos(), getWebhookUrl()]);
      setRepos(r);
      setWebhookUrl(w.url);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newRepo.trim()) return;
    try {
      await addRepo(newRepo.trim());
      setNewRepo("");
      load();
    } catch (e) { console.error(e); }
  };

  if (loading) return <p style={{ color: "#94a3b8" }}>Loading...</p>;

  return (
    <div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "20px" }}>GitHub Config</h1>

      {/* Webhook URL */}
      <div style={card}>
        <h3 style={{ fontSize: "15px", marginBottom: "8px" }}>Webhook URL</h3>
        <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "8px" }}>
          Paste this URL into your GitHub repo's webhook settings.
        </p>
        <code style={{
          display: "block", background: "#0f172a", padding: "10px 14px",
          borderRadius: "8px", fontSize: "13px", wordBreak: "break-all", color: "#3B82F6",
        }}>
          {webhookUrl}
        </code>
      </div>

      {/* Add Repo */}
      <div style={card}>
        <h3 style={{ fontSize: "15px", marginBottom: "8px" }}>Register a Repository</h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={newRepo}
            onChange={e => setNewRepo(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="org/repo-name"
            style={{
              flex: 1, background: "#0f172a", border: "1px solid #334155",
              borderRadius: "8px", padding: "8px 12px", color: "#e2e8f0",
              fontSize: "14px", outline: "none",
            }}
          />
          <button onClick={handleAdd} style={{
            background: "#3B82F6", color: "#fff", border: "none",
            borderRadius: "8px", padding: "8px 20px", cursor: "pointer",
            fontWeight: 600, fontSize: "14px",
          }}>
            Add
          </button>
        </div>
      </div>

      {/* Repo List */}
      <div style={card}>
        <h3 style={{ fontSize: "15px", marginBottom: "12px" }}>Connected Repositories</h3>
        {repos.length === 0 && <p style={{ color: "#94a3b8", fontSize: "13px" }}>No repos registered yet.</p>}
        {repos.map(r => (
          <div key={r.repoId} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0", borderTop: "1px solid #334155",
          }}>
            <span style={{ fontWeight: 600 }}>{r.repoId}</span>
            <span style={{
              fontSize: "12px", padding: "2px 10px", borderRadius: "9999px",
              background: r.connected ? "#22c55e" : "#64748b", color: "#0f172a", fontWeight: 600,
            }}>
              {r.connected ? "Connected" : "Pending"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
