const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 创建数据库连接
const dbPath = path.join(__dirname, 'app.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('已连接到SQLite数据库');
    initDatabase();
  }
});

// 初始化数据库表
function initDatabase() {
  // 创建访问记录表
  db.run(`CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    path TEXT
  )`);

  // 创建quiz记录表
  db.run(`CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT UNIQUE,
    player1_id TEXT,
    player1_name TEXT,
    player2_id TEXT,
    player2_name TEXT,
    player1_score INTEGER,
    player2_score INTEGER,
    winner TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('数据库表已初始化');
}

// 访问记录函数
function recordVisit(req) {
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const path = req.originalUrl || req.url;

  const stmt = db.prepare('INSERT INTO visits (ip, user_agent, path) VALUES (?, ?, ?)');
  stmt.run(ip, userAgent, path, function(err) {
    if (err) {
      console.error('记录访问失败:', err.message);
    } else {
      console.log(`新访问记录已添加，ID: ${this.lastID}`);
    }
  });
  stmt.finalize();
}

// 记录Quiz结果
function recordQuizResult(roomId, player1Id, player1Name, player2Id, player2Name, player1Score, player2Score, winner) {
  const stmt = db.prepare(
    'INSERT INTO quizzes (room_id, player1_id, player1_name, player2_id, player2_name, player1_score, player2_score, winner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(roomId, player1Id, player1Name, player2Id, player2Name, player1Score, player2Score, winner, function(err) {
    if (err) {
      console.error('记录Quiz结果失败:', err.message);
    } else {
      console.log(`新Quiz记录已添加，ID: ${this.lastID}`);
    }
  });
  stmt.finalize();
}

// 获取所有Quiz记录
function getAllQuizzes() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM quizzes ORDER BY timestamp DESC', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 获取访问统计
function getVisitStats() {
  return new Promise((resolve, reject) => {
    db.all('SELECT COUNT(*) as total, DATE(timestamp) as date FROM visits GROUP BY DATE(timestamp) ORDER BY date DESC LIMIT 14', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// 关闭数据库连接（在应用程序关闭时调用）
function closeDatabase() {
  db.close((err) => {
    if (err) {
      console.error('关闭数据库连接失败:', err.message);
    } else {
      console.log('数据库连接已关闭');
    }
  });
}

module.exports = {
  recordVisit,
  recordQuizResult,
  getAllQuizzes,
  getVisitStats,
  closeDatabase
}; 