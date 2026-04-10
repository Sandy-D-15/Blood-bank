const express = require("express");
const sqlite3 = require("sqlite3");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "supersecretkey"; // Use a strong secret key in production

// Middleware
app.use(cors());
app.use(bodyParser.json());
const path = require('path');
app.use(express.static(path.join(__dirname)));
// Database connection
const db = new sqlite3.Database("./bloodbank.db", (err) => {
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

// Middleware to protect admin routes
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401); // No token

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403); // Invalid token
    req.user = user;
    next();
  });
};

// Admin Login
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    `SELECT * FROM admin WHERE username = ?`,
    [username],
    async (err, admin) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!admin) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const token = jwt.sign({ id: admin.id, username: admin.username }, SECRET_KEY, { expiresIn: "1h" });
      res.json({ message: "Login successful", token });
    }
  );
});

// Donors API
app.post("/api/donors", (req, res) => {
  const {
    donor_name,
    blood_type,
    email,
    contact,
    age,
    weight,
    last_donation,
  } = req.body;

  if (
    !donor_name ||
    !blood_type ||
    !email ||
    !contact ||
    !age ||
    !weight
  ) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.run(
    `INSERT INTO donors (donor_name, blood_type, email, contact, age, weight, last_donation) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [donor_name, blood_type, email, contact, age, weight, last_donation],
    function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, message: "Donor added successfully" });
    }
  );
});

app.get("/api/donors", authenticateToken, (req, res) => {
  db.all(`SELECT * FROM donors`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.delete("/api/donors/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM donors WHERE id = ?`, id, function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: "Donor not found" });
    }
    res.json({ message: "Donor deleted successfully" });
  });
});

// Requests API
app.post("/api/requests", (req, res) => {
  const { hospital, blood_type, units, urgency } = req.body;

  if (!hospital || !blood_type || !units || !urgency) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.run(
    `INSERT INTO requests (hospital, blood_type, units, urgency) VALUES (?, ?, ?, ?)`,
    [hospital, blood_type, units, urgency],
    function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, message: "Request added successfully" });
    }
  );
});

app.get("/api/requests", authenticateToken, (req, res) => {
  db.all(`SELECT * FROM requests`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.put("/api/requests/:id/fulfill", authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`SELECT * FROM requests WHERE id = ?`, [id], (err, request) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    if (request.status === "fulfilled") {
      return res.status(400).json({ message: "Request already fulfilled" });
    }

    // Check if enough blood is available in inventory
    db.get(
      `SELECT SUM(units) as total_units FROM inventory WHERE blood_type = ?`,
      [request.blood_type],
      (err, inventorySum) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        const availableUnits = inventorySum.total_units || 0;
        if (availableUnits < request.units) {
          return res.status(400).json({ message: "Insufficient blood in inventory" });
        }

        // Fulfill the request and update inventory
        db.serialize(() => {
          db.run(
            `UPDATE requests SET status = 'fulfilled' WHERE id = ?`,
            [id],
            function (err) {
              if (err) {
                return res.status(500).json({ error: err.message });
              }

              // Deduct from inventory (simple deduction, could be more complex for specific batches)
              db.run(
                `UPDATE inventory SET units = units - ? WHERE blood_type = ? AND units > 0 ORDER BY created_at ASC LIMIT 1`,
                [request.units, request.blood_type],
                function (err) {
                  if (err) {
                    return res.status(500).json({ error: err.message });
                  }
                  res.json({ message: "Request fulfilled and inventory updated" });
                }
              );
            }
          );
        });
      }
    );
  });
});

app.delete("/api/requests/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM requests WHERE id = ?`, id, function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: "Request not found" });
    }
    res.json({ message: "Request deleted successfully" });
  });
});

// Inventory API
app.post("/api/inventory", authenticateToken, (req, res) => {
  const { blood_type, units } = req.body;

  if (!blood_type || !units) {
    return res.status(400).json({ message: "Blood type and units are required" });
  }

  db.run(
    `INSERT INTO inventory (blood_type, units) VALUES (?, ?)`,
    [blood_type, units],
    function (err) {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, message: "Inventory added successfully" });
    }
  );
});

app.get("/api/inventory", authenticateToken, (req, res) => {
  db.all(`SELECT * FROM inventory`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.delete("/api/inventory/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM inventory WHERE id = ?`, id, function (err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ message: "Inventory item not found" });
    }
    res.json({ message: "Inventory item deleted successfully" });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
