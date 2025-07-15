const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { LSMTree } = require("./lsm-tree");

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize LSM Tree
const cache = new LSMTree();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../client/build")));

// API Routes

// GET /api/cache - Get all cache entries
app.get("/api/cache", (req, res) => {
    try {
        const entries = cache.getAllEntries();
        res.json({ success: true, data: entries });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/cache/:key - Get specific cache entry
app.get("/api/cache/:key", (req, res) => {
    try {
        const { key } = req.params;
        const entry = cache.get(key);

        if (!entry) {
            return res
                .status(404)
                .json({ success: false, error: "Key not found" });
        }

        res.json({ success: true, data: { key, ...entry } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/cache - Create/Update cache entry
app.post("/api/cache", async (req, res) => {
    try {
        const { key, value, ttl } = req.body;

        if (!key || value === undefined) {
            return res.status(400).json({
                success: false,
                error: "Key and value are required",
            });
        }

        await cache.put(key, value, ttl);
        res.json({
            success: true,
            message: "Entry created/updated successfully",
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/cache/:key - Update specific cache entry
app.put("/api/cache/:key", async (req, res) => {
    try {
        const { key } = req.params;
        const { value, ttl } = req.body;

        if (value === undefined) {
            return res.status(400).json({
                success: false,
                error: "Value is required",
            });
        }

        await cache.put(key, value, ttl);
        res.json({ success: true, message: "Entry updated successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/cache/:key - Delete specific cache entry
app.delete("/api/cache/:key", async (req, res) => {
    try {
        const { key } = req.params;
        await cache.delete(key);
        res.json({ success: true, message: "Entry deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/stats - Get cache statistics
app.get("/api/stats", (req, res) => {
    try {
        const stats = cache.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve React app for all other routes
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../client/build/index.html"));
});

const server = app.listen(PORT, () => {
    console.log(`LSM Cache Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
    console.log(`Data persisted to: ${cache.dataDir}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
    console.log("\nReceived SIGINT. Graceful shutdown...");
    server.close(async () => {
        await cache.shutdown();
        process.exit(0);
    });
});

process.on("SIGTERM", async () => {
    console.log("\nReceived SIGTERM. Graceful shutdown...");
    server.close(async () => {
        await cache.shutdown();
        process.exit(0);
    });
});
