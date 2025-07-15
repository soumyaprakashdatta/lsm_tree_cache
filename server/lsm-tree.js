const fs = require("fs");
const path = require("path");

class MemTable {
    constructor(maxSize = 1000) {
        this.data = new Map();
        this.maxSize = maxSize;
    }

    put(key, value, ttl) {
        const expiresAt = ttl ? Date.now() + ttl : null;
        this.data.set(key, { value, expiresAt, timestamp: Date.now() });
        return this.data.size >= this.maxSize;
    }

    get(key) {
        const entry = this.data.get(key);
        if (!entry) return null;

        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.data.delete(key);
            return null;
        }

        return entry;
    }

    delete(key) {
        return this.data.delete(key);
    }

    getAllEntries() {
        const entries = [];
        for (const [key, entry] of this.data.entries()) {
            if (!entry.expiresAt || Date.now() <= entry.expiresAt) {
                entries.push({ key, ...entry });
            } else {
                this.data.delete(key);
            }
        }
        return entries;
    }

    size() {
        return this.data.size;
    }

    clear() {
        this.data.clear();
    }

    toJSON() {
        return Array.from(this.data.entries());
    }

    fromJSON(data) {
        this.data = new Map(data);
    }
}

class SSTable {
    constructor(data, filePath = null) {
        this.data = new Map(data);
        this.createdAt = Date.now();
        this.filePath = filePath;
        this.id = Date.now() + Math.random().toString(36).substr(2, 9);
    }

    get(key) {
        const entry = this.data.get(key);
        if (!entry) return null;

        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            return null;
        }

        return entry;
    }

    getAllEntries() {
        const entries = [];
        for (const [key, entry] of this.data.entries()) {
            if (!entry.expiresAt || Date.now() <= entry.expiresAt) {
                entries.push({ key, ...entry });
            }
        }
        return entries;
    }

    size() {
        return this.data.size;
    }

    async saveToDisk(dataDir) {
        if (!this.filePath) {
            this.filePath = path.join(dataDir, `sstable_${this.id}.json`);
        }

        const data = {
            id: this.id,
            createdAt: this.createdAt,
            entries: Array.from(this.data.entries()),
        };

        await fs.promises.writeFile(
            this.filePath,
            JSON.stringify(data, null, 2)
        );
        return this.filePath;
    }

    static async loadFromDisk(filePath) {
        try {
            const content = await fs.promises.readFile(filePath, "utf8");
            const data = JSON.parse(content);
            const ssTable = new SSTable(data.entries, filePath);
            ssTable.id = data.id;
            ssTable.createdAt = data.createdAt;
            return ssTable;
        } catch (error) {
            console.error(`Failed to load SSTable from ${filePath}:`, error);
            return null;
        }
    }

    async deleteFromDisk() {
        if (this.filePath && fs.existsSync(this.filePath)) {
            await fs.promises.unlink(this.filePath);
        }
    }
}

class LSMTree {
    constructor(memTableMaxSize = 1000, maxSSTables = 10, dataDir = "./data") {
        this.memTable = new MemTable(memTableMaxSize);
        this.ssTables = [];
        this.maxSSTables = maxSSTables;
        this.defaultTTL = 60000; // 1 minute in milliseconds
        this.dataDir = dataDir;
        this.walPath = path.join(dataDir, "wal.json");
        this.metadataPath = path.join(dataDir, "metadata.json");

        this.ensureDataDir();
        this.loadFromDisk();
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    async loadFromDisk() {
        try {
            // Load metadata
            if (fs.existsSync(this.metadataPath)) {
                const metadata = JSON.parse(
                    await fs.promises.readFile(this.metadataPath, "utf8")
                );
                this.defaultTTL = metadata.defaultTTL || this.defaultTTL;
            }

            // Load WAL (Write-Ahead Log) to restore MemTable
            if (fs.existsSync(this.walPath)) {
                const walData = JSON.parse(
                    await fs.promises.readFile(this.walPath, "utf8")
                );
                this.memTable.fromJSON(walData.memTable || []);
            }

            // Load SSTables
            const files = await fs.promises.readdir(this.dataDir);
            const sstableFiles = files.filter(
                (file) => file.startsWith("sstable_") && file.endsWith(".json")
            );

            for (const file of sstableFiles) {
                const filePath = path.join(this.dataDir, file);
                const ssTable = await SSTable.loadFromDisk(filePath);
                if (ssTable) {
                    this.ssTables.push(ssTable);
                }
            }

            // Sort SSTables by creation time
            this.ssTables.sort((a, b) => a.createdAt - b.createdAt);

            console.log(
                `Loaded ${
                    this.ssTables.length
                } SSTables and ${this.memTable.size()} MemTable entries from disk`
            );
        } catch (error) {
            console.error("Failed to load from disk:", error);
        }
    }

    async saveWAL() {
        try {
            const walData = {
                timestamp: Date.now(),
                memTable: this.memTable.toJSON(),
            };
            await fs.promises.writeFile(
                this.walPath,
                JSON.stringify(walData, null, 2)
            );
        } catch (error) {
            console.error("Failed to save WAL:", error);
        }
    }

    async saveMetadata() {
        try {
            const metadata = {
                defaultTTL: this.defaultTTL,
                lastUpdated: Date.now(),
            };
            await fs.promises.writeFile(
                this.metadataPath,
                JSON.stringify(metadata, null, 2)
            );
        } catch (error) {
            console.error("Failed to save metadata:", error);
        }
    }

    async put(key, value, ttl = this.defaultTTL) {
        const shouldFlush = this.memTable.put(key, value, ttl);

        // Save WAL after each write
        await this.saveWAL();

        if (shouldFlush) {
            await this.flush();
        }
    }

    get(key) {
        // Check memtable first
        let entry = this.memTable.get(key);
        if (entry) return entry;

        // Check SSTables from newest to oldest
        for (let i = this.ssTables.length - 1; i >= 0; i--) {
            entry = this.ssTables[i].get(key);
            if (entry) return entry;
        }

        return null;
    }

    async delete(key) {
        // Mark as deleted in memtable
        this.memTable.put(key, null, null);
        await this.saveWAL();
    }

    async flush() {
        if (this.memTable.size() === 0) return;

        const ssTable = new SSTable(this.memTable.data);
        await ssTable.saveToDisk(this.dataDir);

        this.ssTables.push(ssTable);
        this.memTable.clear();

        // Clear WAL since MemTable is now empty
        await this.saveWAL();

        // Compact if too many SSTables
        if (this.ssTables.length > this.maxSSTables) {
            await this.compact();
        }
    }

    async compact() {
        if (this.ssTables.length <= 1) return;

        console.log(`Compacting ${this.ssTables.length} SSTables...`);

        const mergedData = new Map();

        // Merge all SSTables, newer entries override older ones
        for (const ssTable of this.ssTables) {
            for (const [key, entry] of ssTable.data.entries()) {
                if (
                    entry.value !== null &&
                    (!entry.expiresAt || Date.now() <= entry.expiresAt)
                ) {
                    mergedData.set(key, entry);
                }
            }
        }

        // Delete old SSTable files
        for (const ssTable of this.ssTables) {
            await ssTable.deleteFromDisk();
        }

        // Create new compacted SSTable
        const compactedSSTable = new SSTable(mergedData);
        await compactedSSTable.saveToDisk(this.dataDir);

        this.ssTables = [compactedSSTable];

        console.log(
            `Compaction complete. Merged into 1 SSTable with ${mergedData.size} entries.`
        );
    }

    getAllEntries() {
        const allEntries = new Map();

        // Add entries from SSTables (oldest first)
        for (const ssTable of this.ssTables) {
            for (const entry of ssTable.getAllEntries()) {
                allEntries.set(entry.key, entry);
            }
        }

        // Add entries from memtable (newest, overrides SSTables)
        for (const entry of this.memTable.getAllEntries()) {
            if (entry.value !== null) {
                allEntries.set(entry.key, entry);
            } else {
                allEntries.delete(entry.key); // Handle deletions
            }
        }

        return Array.from(allEntries.values());
    }

    getStats() {
        const diskFiles = fs.existsSync(this.dataDir)
            ? fs
                  .readdirSync(this.dataDir)
                  .filter((f) => f.startsWith("sstable_")).length
            : 0;

        return {
            memTableSize: this.memTable.size(),
            ssTablesCount: this.ssTables.length,
            totalEntries: this.getAllEntries().length,
            defaultTTL: this.defaultTTL,
            diskFiles,
            dataDir: this.dataDir,
        };
    }

    async shutdown() {
        console.log("Shutting down LSM Tree...");
        await this.flush();
        await this.saveMetadata();
        console.log("LSM Tree shutdown complete.");
    }
}

module.exports = { LSMTree, MemTable, SSTable };
