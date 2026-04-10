const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");

const DB_PATH = "./bloodbank.db";

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error connecting to database:", err.message);
  } else {
    console.log("Connected to the SQLite database.");
    db.run(`PRAGMA foreign_keys = ON;`);
    db.serialize(() => {
      // Create admin table
      db.run(
        `CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      )`,
        (err) => {
          if (err) console.error("Error creating admin table:", err.message);
          else {
            // Insert default admin if not exists
            const hashedPassword = bcrypt.hashSync("admin123", 8);
            db.run(
              `INSERT OR IGNORE INTO admin (username, password) VALUES (?, ?)`,
              ["admin", hashedPassword],
              (err) => {
                if (err)
                  console.error("Error inserting default admin:", err.message);
                else
                  console.log("Default admin user created or already exists.");
              }
            );
          }
        }
      );

      // Create donors table
      db.run(
        `CREATE TABLE IF NOT EXISTS donors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        donor_name TEXT NOT NULL,
        blood_type TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        contact TEXT NOT NULL,
        age INTEGER NOT NULL,
        weight INTEGER NOT NULL,
        last_donation TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
        (err) => {
          if (err) console.error("Error creating donors table:", err.message);
        }
      );

      // Create requests table
      db.run(
        `CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hospital TEXT NOT NULL,
        blood_type TEXT NOT NULL,
        units INTEGER NOT NULL,
        urgency TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
        (err) => {
          if (err) console.error("Error creating requests table:", err.message);
        }
      );

      // Create inventory table
      db.run(
        `CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        blood_type TEXT NOT NULL,
        units INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
        (err) => {
          if (err) console.error("Error creating inventory table:", err.message);
        }
      );
    });
  }
});

module.exports = db;
