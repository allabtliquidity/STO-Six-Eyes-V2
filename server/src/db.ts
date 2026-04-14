import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../data/sixeyes.db");

import fs from "fs";
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    exit_price REAL,
    stop_loss REAL,
    take_profit REAL,
    contracts REAL NOT NULL DEFAULT 1,
    pnl REAL,
    pnl_dollars REAL,
    grade TEXT,
    grade_reason TEXT,
    strategy_id INTEGER,
    trade_date TEXT NOT NULL,
    entry_time TEXT,
    exit_time TEXT,
    session TEXT,
    po3_phase TEXT,
    setup_type TEXT,
    entry_timeframe TEXT,
    notes TEXT,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER NOT NULL,
    section_number INTEGER NOT NULL,
    section_name TEXT NOT NULL,
    content TEXT NOT NULL,
    rules TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS backtests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id INTEGER DEFAULT 0,
    strategy_name TEXT,
    symbol TEXT,
    from_date TEXT,
    to_date TEXT,
    initial_capital REAL DEFAULT 100000,
    net_pnl REAL DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate REAL DEFAULT 0,
    avg_rr REAL DEFAULT 0,
    profit_factor REAL DEFAULT 0,
    max_drawdown REAL DEFAULT 0,
    equity_curve TEXT,
    trade_log TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT,
    strategy_id INTEGER,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence TEXT,
    sample_size INTEGER,
    source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Auto-seed default strategies
const existing = db.prepare("SELECT id FROM strategies WHERE name = 'STDV Model'").get();
if (!existing) {
  const strategies = [
    { name: "STDV Model", description: "Standard Deviation (STDV) + ICT concepts. Targets Gold (GC), Silver (SI), NQ, and ES futures.", is_active: 1 },
    { name: "Wick Model", description: "HTF Rejection Block continuation model — targets the CE/OTE of High Time Frame wicks.", is_active: 0 },
    { name: "KO Model", description: "Key Opens + FIB continuation model.", is_active: 0 },
    { name: "Failed Auction", description: "Volume Profile-based mean-reversion strategy.", is_active: 0 },
    { name: "VP Breakout", description: "Volume Profile breakout-continuation strategy.", is_active: 0 },
  ];
  const insert = db.prepare("INSERT INTO strategies (name, description, is_active) VALUES (?, ?, ?)");
  for (const s of strategies) insert.run(s.name, s.description, s.is_active);
}

export default db;
