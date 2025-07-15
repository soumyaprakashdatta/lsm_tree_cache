# LSM Tree Cache System

A high-performance cache system built with an LSM (Log-Structured Merge) tree backend, featuring HTTP APIs and a React-based web interface.

## Features

- **LSM Tree Storage**: Efficient write-heavy workload handling with MemTable and SSTable architecture
- **Disk Persistence**: All cache entries are automatically persisted to disk in the `./data` folder
- **Write-Ahead Logging (WAL)**: Ensures data durability and crash recovery
- **TTL Support**: Configurable time-to-live for cache entries (default: 1 minute)
- **HTTP REST API**: Full CRUD operations for cache management
- **React Web UI**: User-friendly interface for cache operations
- **Real-time Updates**: Auto-refresh every 5 seconds
- **Statistics Dashboard**: Monitor cache performance, disk usage, and persistence status
- **Graceful Shutdown**: Proper data flushing on server shutdown

## Architecture

### LSM Tree Components
- **MemTable**: In-memory storage for recent writes
- **SSTables**: Immutable sorted string tables persisted to disk as JSON files
- **Write-Ahead Log (WAL)**: Ensures durability by logging all writes before applying them
- **Compaction**: Automatic merging of SSTables to optimize read performance and disk usage
- **TTL Management**: Automatic expiration of entries based on time-to-live
- **Crash Recovery**: Automatic restoration of data from disk on server restart

### API Endpoints

- `GET /api/cache` - Get all cache entries
- `GET /api/cache/:key` - Get specific cache entry
- `POST /api/cache` - Create/update cache entry
- `PUT /api/cache/:key` - Update specific cache entry
- `DELETE /api/cache/:key` - Delete cache entry
- `GET /api/stats` - Get cache statistics

## Quick Start

### Install Dependencies
```bash
npm run install-all
```

### Development Mode
```bash
npm run dev
```
This starts both the server (port 3001) and React client (port 3000).

### Production Mode
```bash
npm run build
npm start
```

## Usage Examples

### API Usage

```bash
# Create a cache entry
curl -X POST http://localhost:3001/api/cache \
  -H "Content-Type: application/json" \
  -d '{"key": "user:123", "value": {"name": "John", "age": 30}, "ttl": 120000}'

# Get a cache entry
curl http://localhost:3001/api/cache/user:123

# Update a cache entry
curl -X PUT http://localhost:3001/api/cache/user:123 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "John", "age": 31}, "ttl": 60000}'

# Delete a cache entry
curl -X DELETE http://localhost:3001/api/cache/user:123

# Get cache statistics
curl http://localhost:3001/api/stats
```

### Web Interface

1. Open http://localhost:3000 in your browser
2. Use the form to add new cache entries
3. View, edit, and delete existing entries
4. Monitor cache statistics in real-time

## Configuration

### Default Settings
- **Default TTL**: 60,000ms (1 minute)
- **MemTable Max Size**: 1,000 entries
- **Max SSTables**: 10 tables before compaction
- **Auto-refresh Interval**: 5 seconds
- **Data Directory**: `./data` (automatically created)
- **Persistence**: All writes immediately persisted via WAL

### Environment Variables
- `PORT`: Server port (default: 3001)

## Cache Entry Structure

```json
{
  "key": "string",
  "value": "any",
  "expiresAt": "timestamp|null",
  "timestamp": "timestamp"
}
```

## Performance Characteristics

- **Write Performance**: O(1) for MemTable writes
- **Read Performance**: O(log n) average case
- **Space Efficiency**: Automatic compaction reduces storage overhead
- **TTL Cleanup**: Lazy expiration during reads and periodic cleanup

## Development

### Project Structure
```
├── server/
│   ├── index.js          # Express server and API routes
│   └── lsm-tree.js       # LSM Tree implementation
├── client/
│   └── src/
│       ├── App.js        # React main component
│       └── App.css       # Styling
└── package.json          # Server dependencies
```

### Testing the LSM Tree

The LSM tree automatically handles:
- Memory-to-disk flushing when MemTable is full
- Compaction when too many SSTables exist
- TTL expiration during reads
- Statistics tracking

## License

MIT License# lsm_tree_cache
