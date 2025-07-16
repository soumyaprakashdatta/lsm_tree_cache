import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

function App() {
    const [entries, setEntries] = useState([]);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [newEntry, setNewEntry] = useState({
        key: "",
        value: "",
        ttl: 60000,
    });
    const [editingEntry, setEditingEntry] = useState(null);

    useEffect(() => {
        fetchEntries();
        fetchStats();
        const interval = setInterval(() => {
            fetchEntries();
            fetchStats();
        }, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, []);

    const fetchEntries = async () => {
        try {
            const response = await axios.get("/api/cache");
            setEntries(response.data.data || []);
        } catch (err) {
            setError("Failed to fetch cache entries");
        }
    };

    const fetchStats = async () => {
        try {
            const response = await axios.get("/api/stats");
            setStats(response.data.data || {});
        } catch (err) {
            console.error("Failed to fetch stats");
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newEntry.key || newEntry.value === "") return;

        setLoading(true);
        try {
            await axios.post("/api/cache", {
                key: newEntry.key,
                value: newEntry.value,
                ttl: newEntry.ttl || 60000,
            });
            setNewEntry({ key: "", value: "", ttl: 60000 });
            fetchEntries();
            setError("");
        } catch (err) {
            setError("Failed to create entry");
        }
        setLoading(false);
    };

    const handleUpdate = async (key, value, ttl) => {
        setLoading(true);
        try {
            await axios.put(`/api/cache/${key}`, { value, ttl });
            setEditingEntry(null);
            fetchEntries();
            setError("");
        } catch (err) {
            setError("Failed to update entry");
        }
        setLoading(false);
    };

    const handleDelete = async (key) => {
        if (!window.confirm(`Delete entry "${key}"?`)) return;

        setLoading(true);
        try {
            await axios.delete(`/api/cache/${key}`);
            fetchEntries();
            setError("");
        } catch (err) {
            setError("Failed to delete entry");
        }
        setLoading(false);
    };

    const formatTTL = (expiresAt) => {
        if (!expiresAt) return "No expiration";
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) return "Expired";
        return `${Math.ceil(remaining / 1000)}s remaining`;
    };

    const formatTimestamp = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="App">
            <header className="App-header">
                <h1>LSM Tree Cache Manager</h1>

                {/* Stats Section */}
                <div className="stats-section">
                    <div className="stat-item">
                        <span>Total Entries: {stats.totalEntries || 0}</span>
                    </div>
                    <div className="stat-item">
                        <span>MemTable Size: {stats.memTableSize || 0}</span>
                    </div>
                    <div className="stat-item">
                        <span>SSTables: {stats.ssTablesCount || 0}</span>
                    </div>
                    <div className="stat-item">
                        <span>Disk Files: {stats.diskFiles || 0}</span>
                    </div>
                    <div className="stat-item">
                        <span>
                            Default TTL: {(stats.defaultTTL || 60000) / 1000}s
                        </span>
                    </div>
                    <div className="stat-item">
                        <span>📁 {stats.dataDir || "./data"}</span>
                    </div>
                </div>

                {error && <div className="error-message">{error}</div>}

                {/* Create New Entry Form */}
                <div className="create-section">
                    <h2>Add New Entry</h2>
                    <form onSubmit={handleCreate} className="create-form">
                        <input
                            type="text"
                            placeholder="Key"
                            value={newEntry.key}
                            onChange={(e) =>
                                setNewEntry({
                                    ...newEntry,
                                    key: e.target.value,
                                })
                            }
                            required
                        />
                        <input
                            type="text"
                            placeholder="Value"
                            value={newEntry.value}
                            onChange={(e) =>
                                setNewEntry({
                                    ...newEntry,
                                    value: e.target.value,
                                })
                            }
                            required
                        />
                        <input
                            type="number"
                            placeholder="TTL (ms)"
                            value={newEntry.ttl}
                            onChange={(e) =>
                                setNewEntry({
                                    ...newEntry,
                                    ttl: parseInt(e.target.value) || 60000,
                                })
                            }
                        />
                        <button type="submit" disabled={loading}>
                            {loading ? "Adding..." : "Add Entry"}
                        </button>
                    </form>
                </div>

                {/* Entries List */}
                <div className="entries-section">
                    <h2>Cache Entries ({entries.length})</h2>
                    {entries.length === 0 ? (
                        <p>No cache entries found</p>
                    ) : (
                        <div className="entries-list">
                            {entries.map((entry) => (
                                <div key={entry.key} className="entry-item">
                                    {editingEntry === entry.key ? (
                                        <EditEntryForm
                                            entry={entry}
                                            onSave={handleUpdate}
                                            onCancel={() =>
                                                setEditingEntry(null)
                                            }
                                        />
                                    ) : (
                                        <div className="entry-display">
                                            <div className="entry-header">
                                                <strong>{entry.key}</strong>
                                                <div className="entry-actions">
                                                    <button
                                                        onClick={() =>
                                                            setEditingEntry(
                                                                entry.key
                                                            )
                                                        }
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            handleDelete(
                                                                entry.key
                                                            )
                                                        }
                                                        className="delete-btn"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="entry-details">
                                                <div>
                                                    <strong>Value:</strong>{" "}
                                                    {JSON.stringify(
                                                        entry.value
                                                    )}
                                                </div>
                                                <div>
                                                    <strong>TTL:</strong>{" "}
                                                    {formatTTL(entry.expiresAt)}
                                                </div>
                                                <div>
                                                    <strong>Created:</strong>{" "}
                                                    {formatTimestamp(
                                                        entry.timestamp
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </header>
        </div>
    );
}

function EditEntryForm({ entry, onSave, onCancel }) {
    const [value, setValue] = useState(entry.value);
    const [ttl, setTtl] = useState(
        entry.expiresAt ? entry.expiresAt - Date.now() : 60000
    );

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(entry.key, value, ttl);
    };

    return (
        <form onSubmit={handleSubmit} className="edit-form">
            <div className="edit-header">
                <strong>Editing: {entry.key}</strong>
            </div>
            <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value"
                required
            />
            <input
                type="number"
                value={ttl}
                onChange={(e) => setTtl(parseInt(e.target.value) || 60000)}
                placeholder="TTL (ms)"
            />
            <div className="edit-actions">
                <button type="submit">Save</button>
                <button type="button" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

export default App;
