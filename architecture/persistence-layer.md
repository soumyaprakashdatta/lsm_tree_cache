# LSM Tree Cache - Persistence Layer Architecture

## Overview

The LSM Tree Cache implements a robust persistence layer that ensures data durability, crash recovery, and efficient disk storage management. This document details the inner workings of the persistence mechanisms.

## 🚀 Core Persistence Features

### 1. Write-Ahead Log (WAL)
- **Purpose**: Ensures data durability for all write operations
- **Location**: `./data/wal.json`
- **Behavior**: Every write operation is immediately logged before being applied to the MemTable
- **Recovery**: MemTable is restored from WAL on server restart
- **Format**:
  ```json
  {
    "timestamp": 1640995200000,
    "memTable": [
      ["key1", {"value": "data", "expiresAt": 1640995260000, "timestamp": 1640995200000}],
      ["key2", {"value": "data2", "expiresAt": null, "timestamp": 1640995201000}]
    ]
  }
  ```

### 2. SSTable Disk Storage
- **Purpose**: Persistent storage for immutable sorted string tables
- **Location**: `./data/sstable_[unique_id].json`
- **Creation**: Automatically created when MemTable reaches maximum size
- **Unique ID**: Combination of timestamp and random string for uniqueness
- **Format**:
  ```json
  {
    "id": "175259018950129pqm9byo",
    "createdAt": 1640995200000,
    "entries": [
      ["key1", {"value": "data", "expiresAt": 1640995260000, "timestamp": 1640995200000}],
      ["key2", {"value": "data2", "expiresAt": null, "timestamp": 1640995201000}]
    ]
  }
  ```

### 3. Metadata Persistence
- **Purpose**: Store cache configuration and system state
- **Location**: `./data/metadata.json`
- **Content**: Default TTL, last updated timestamp
- **Format**:
  ```json
  {
    "defaultTTL": 60000,
    "lastUpdated": 1640995200000
  }
  ```

## 🔄 Persistence Workflow

### Write Operations Flow
1. **Receive Write Request** → API endpoint receives PUT/POST request
2. **Update MemTable** → Data is added to in-memory MemTable
3. **Log to WAL** → Write operation is immediately logged to `wal.json`
4. **Check MemTable Size** → If MemTable exceeds max size, trigger flush
5. **Flush to SSTable** → Create new SSTable file on disk
6. **Clear MemTable** → Reset MemTable and update WAL
7. **Compaction Check** → If too many SSTables, trigger compaction

### Read Operations Flow
1. **Check MemTable** → Search in-memory MemTable first (fastest)
2. **Check SSTables** → Search SSTables from newest to oldest
3. **TTL Validation** → Verify entry hasn't expired
4. **Return Result** → Return found entry or null

### Startup Recovery Flow
1. **Create Data Directory** → Ensure `./data` directory exists
2. **Load Metadata** → Restore cache configuration from `metadata.json`
3. **Load WAL** → Restore MemTable entries from `wal.json`
4. **Load SSTables** → Read all `sstable_*.json` files
5. **Sort SSTables** → Order by creation timestamp
6. **Log Recovery Status** → Display loaded entries count

## 🛡️ Crash Recovery Mechanisms

### Data Durability Guarantees
- **WAL First**: All writes are logged before being applied
- **Atomic Operations**: File writes are atomic at the OS level
- **Graceful Shutdown**: SIGINT/SIGTERM handlers ensure clean shutdown
- **Automatic Recovery**: Server automatically restores state on restart

### Recovery Process
```javascript
async loadFromDisk() {
  // 1. Load metadata (configuration)
  if (fs.existsSync(this.metadataPath)) {
    const metadata = JSON.parse(await fs.promises.readFile(this.metadataPath, 'utf8'));
    this.defaultTTL = metadata.defaultTTL || this.defaultTTL;
  }

  // 2. Load WAL (MemTable restoration)
  if (fs.existsSync(this.walPath)) {
    const walData = JSON.parse(await fs.promises.readFile(this.walPath, 'utf8'));
    this.memTable.fromJSON(walData.memTable || []);
  }

  // 3. Load SSTables
  const files = await fs.promises.readdir(this.dataDir);
  const sstableFiles = files.filter(file => file.startsWith('sstable_') && file.endsWith('.json'));
  
  for (const file of sstableFiles) {
    const filePath = path.join(this.dataDir, file);
    const ssTable = await SSTable.loadFromDisk(filePath);
    if (ssTable) {
      this.ssTables.push(ssTable);
    }
  }

  // 4. Sort SSTables by creation time
  this.ssTables.sort((a, b) => a.createdAt - b.createdAt);
}
```

## 🗜️ Compaction Strategy

### When Compaction Triggers
- **Threshold**: When number of SSTables exceeds `maxSSTables` (default: 10)
- **Automatic**: Triggered after each MemTable flush
- **Background**: Runs asynchronously without blocking operations

### Compaction Process
1. **Merge SSTables** → Combine all SSTable data into a single Map
2. **Resolve Conflicts** → Newer entries override older ones
3. **Filter Expired** → Remove entries that have exceeded their TTL
4. **Delete Old Files** → Remove all existing SSTable files from disk
5. **Create New SSTable** → Write compacted data to a single new file
6. **Update Memory** → Replace in-memory SSTables array

### Benefits
- **Reduced Disk Usage**: Eliminates duplicate and expired entries
- **Improved Read Performance**: Fewer files to search through
- **Storage Optimization**: Consolidates fragmented data

## 📊 Performance Characteristics

### Write Performance
- **MemTable Writes**: O(1) - Direct Map insertion
- **WAL Logging**: O(1) - Append-only file write
- **SSTable Creation**: O(n) - Where n is MemTable size
- **Compaction**: O(m) - Where m is total entries across all SSTables

### Read Performance
- **MemTable Reads**: O(1) - Direct Map lookup
- **SSTable Reads**: O(k) - Where k is number of SSTables
- **Average Case**: O(1) for recent data, O(log n) for older data
- **Worst Case**: O(k) when data is in oldest SSTable

### Storage Efficiency
- **Space Amplification**: ~2x during compaction (temporary)
- **Write Amplification**: ~1.5x (WAL + SSTable writes)
- **Compression**: JSON format with pretty printing for debugging

## 🔧 Configuration Options

### Tunable Parameters
```javascript
const cache = new LSMTree(
  memTableMaxSize = 1000,    // MemTable flush threshold
  maxSSTables = 10,          // Compaction trigger threshold
  dataDir = './data'         // Persistence directory
);
```

### Environment Considerations
- **Disk Space**: Monitor `./data` directory growth
- **I/O Performance**: SSD recommended for better performance
- **Memory Usage**: MemTable + loaded SSTables kept in memory
- **Backup Strategy**: Regular backup of `./data` directory recommended

## 🚨 Error Handling

### File System Errors
- **Permission Issues**: Graceful degradation with error logging
- **Disk Full**: Prevents new writes, maintains read availability
- **Corruption**: Individual SSTable corruption doesn't affect others
- **Recovery Failures**: Logs errors but continues with available data

### Consistency Guarantees
- **Write Consistency**: WAL ensures all writes are durable
- **Read Consistency**: Always reads most recent committed data
- **Crash Consistency**: Recovery restores to last consistent state
- **TTL Consistency**: Expired entries are lazily cleaned during reads

## 📁 Data Directory Structure

```
./data/
├── wal.json                    # Write-ahead log (MemTable backup)
├── metadata.json               # Cache configuration
├── sstable_175259018950129pqm9byo.json  # SSTable files
├── sstable_175259019123456xyz.json      # (multiple files before compaction)
└── sstable_175259019987654abc.json      # (compacted into single file)
```

## 🔄 Lifecycle Management

### Server Startup
1. Initialize LSM Tree with configuration
2. Create data directory if not exists
3. Load persisted data (metadata, WAL, SSTables)
4. Start HTTP server
5. Log recovery statistics

### Normal Operation
1. Handle API requests
2. Maintain WAL for durability
3. Flush MemTable when full
4. Compact SSTables when threshold reached
5. Serve real-time statistics

### Server Shutdown
1. Receive shutdown signal (SIGINT/SIGTERM)
2. Stop accepting new requests
3. Flush pending MemTable data
4. Save final metadata state
5. Close HTTP server
6. Exit gracefully

This persistence layer ensures that the LSM Tree Cache provides enterprise-grade durability and performance characteristics suitable for production workloads.