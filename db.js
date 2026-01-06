const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

let db = null

function init() {
  const dbPath = path.join(app.getPath('userData'), 'vault.db')
  db = new Database(dbPath)
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      filePath TEXT NOT NULL,
      thumbnail TEXT,
      createdAt TEXT NOT NULL
    )
  `)
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `)
}

function addItem(item) {
  const stmt = db.prepare(`
    INSERT INTO items (id, title, type, url, filePath, thumbnail, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(item.id, item.title, item.type, item.url, item.filePath, item.thumbnail || null, item.createdAt)
}

function getAllItems() {
  return db.prepare('SELECT * FROM items ORDER BY createdAt DESC').all()
}

function deleteItem(id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id)
}

function getSettings() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('vaultPath')
  return { vaultPath: row ? row.value : null }
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}

module.exports = { init, addItem, getAllItems, deleteItem, getSettings, setSetting }
