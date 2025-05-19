const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;
const db = require('./database');

// Game configuration and state
const questions = [
  {
    id: 1,
    question: "Which HTML5 tag is used to define navigation links?",
    options: ["<nav>", "<navigation>", "<menu>", "<links>"],
    correctAnswer: 0
  },
  {
    id: 2,
    question: "Which CSS property is used to set margins around an element?",
    options: ["spacing", "margin", "padding", "border"],
    correctAnswer: 1
  },
  {
    id: 3,
    question: "Which JavaScript method is used to add an element to the end of an array?",
    options: ["push()", "add()", "append()", "insert()"],
    correctAnswer: 0
  },
  {
    id: 4,
    question: "In responsive web design, which CSS property is used to set the viewport?",
    options: ["@viewport", "@media", "@responsive", "@screen"],
    correctAnswer: 1
  },
  {
    id: 5,
    question: "In HTML, which attribute is used to specify the URL where a form should be submitted?",
    options: ["url", "action", "link", "submit"],
    correctAnswer: 1
  },
  {
    id: 6,
    question: "Which JavaScript event is triggered when a user clicks on an element?",
    options: ["onmouseover", "onchange", "onclick", "onsubmit"],
    correctAnswer: 2
  },
  {
    id: 7,
    question: "What does CSS stand for?",
    options: ["Computer Style Sheets", "Cascading Style Sheets", "Creative Style Sheets", "Colorful Style Sheets"],
    correctAnswer: 1
  },
  {
    id: 8,
    question: "Which HTML tag is used to create a table?",
    options: ["<table>", "<tb>", "<tr>", "<tab>"],
    correctAnswer: 0
  }
];

// Game rooms
const rooms = {};
const players = {};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// 中间件记录所有访问
app.use((req, res, next) => {
  db.recordVisit(req);
  next();
});

// Redirect root path to index.html
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// 添加API路由获取统计数据
app.get('/api/stats', async (req, res) => {
  try {
    const visitStats = await db.getVisitStats();
    const quizzes = await db.getAllQuizzes();
    res.json({ 
      success: true, 
      visitStats, 
      quizzes 
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取统计数据失败' 
    });
  }
});

// Socket.IO event handling
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  // Player registration
  socket.on('register', (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name,
      inGame: false,
      room: null
    };
    
    // Broadcast updated player list
    io.emit('playersList', Object.values(players).filter(p => !p.inGame));
    
    // Send confirmation
    socket.emit('registered', { id: socket.id, name });
    console.log(`Player ${name} registered`);
  });
  
  // Player challenge request
  socket.on('challenge', (targetId) => {
    if (!players[socket.id] || !players[targetId]) return;
    
    const challenger = players[socket.id];
    const target = players[targetId];
    
    // Notify target player
    io.to(targetId).emit('challengeRequest', {
      id: socket.id,
      name: challenger.name
    });
    
    console.log(`${challenger.name} challenged ${target.name}`);
  });
  
  // Player accepts challenge
  socket.on('acceptChallenge', (challengerId) => {
    if (!players[socket.id] || !players[challengerId]) return;
    
    const roomId = `room_${Date.now()}`;
    rooms[roomId] = {
      id: roomId,
      players: [socket.id, challengerId],
      currentQuestion: 0,
      scores: {},
      gameStarted: false,
      answers: {}
    };
    
    // Set initial scores
    rooms[roomId].scores[socket.id] = 0;
    rooms[roomId].scores[challengerId] = 0;
    
    // Add players to room
    socket.join(roomId);
    io.to(challengerId).emit('challengeAccepted', roomId);
    
    // Try to make challenger join room
    try {
      const challengerSocket = io.sockets.sockets.get(challengerId);
      if (challengerSocket) {
        challengerSocket.join(roomId);
      }
    } catch (err) {
      console.error('Error joining room:', err);
    }
    
    // Update player status
    players[socket.id].inGame = true;
    players[socket.id].room = roomId;
    players[challengerId].inGame = true;
    players[challengerId].room = roomId;
    
    // Broadcast updated player list
    io.emit('playersList', Object.values(players).filter(p => !p.inGame));
    
    console.log(`Game room ${roomId} created, players: ${players[socket.id].name} and ${players[challengerId].name}`);
    
    // Start game after 2 seconds
    setTimeout(() => {
      if (rooms[roomId]) {
        startGame(roomId);
      }
    }, 2000);
  });
  
  // Player rejects challenge
  socket.on('rejectChallenge', (challengerId) => {
    io.to(challengerId).emit('challengeRejected', {
      id: socket.id,
      name: players[socket.id].name
    });
  });
  
  // Receive player answer
  socket.on('submitAnswer', (data) => {
    const { roomId, questionId, answerId, answerTime } = data;
    
    if (!rooms[roomId] || !players[socket.id]) return;
    
    const room = rooms[roomId];
    if (!room.answers[questionId]) {
      room.answers[questionId] = {};
    }
    
    // Save answer
    room.answers[questionId][socket.id] = {
      playerId: socket.id,
      answerId,
      answerTime,
      isCorrect: (answerId === questions[questionId-1].correctAnswer)
    };
    
    // If both players answered, process results
    if (Object.keys(room.answers[questionId]).length === 2) {
      calculateScores(roomId, questionId);
    }
  });
  
  // Player disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (players[socket.id]) {
      const roomId = players[socket.id].room;
      
      // If player is in game, notify opponent and end game
      if (roomId && rooms[roomId]) {
        const opponentId = rooms[roomId].players.find(id => id !== socket.id);
        if (opponentId && players[opponentId]) {
          io.to(opponentId).emit('opponentLeft', {
            name: players[socket.id].name
          });
          
          // Update opponent status
          players[opponentId].inGame = false;
          players[opponentId].room = null;
        }
        
        // Delete room
        delete rooms[roomId];
      }
      
      // Delete player
      delete players[socket.id];
      
      // Broadcast updated player list
      io.emit('playersList', Object.values(players).filter(p => !p.inGame));
    }
  });
});

// Start game function
function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  room.gameStarted = true;
  room.currentQuestion = 1;
  room.totalQuestions = 5; // 限制每个quiz为5题
  room.questionTimers = {}; // 存储题目计时器
  
  // Send first question
  sendQuestion(roomId, room.currentQuestion);
}

// Send question function
function sendQuestion(roomId, questionId) {
  const room = rooms[roomId];
  if (!room) return;
  
  // 确保不超过总题目数量
  if (questionId > room.totalQuestions) {
    // Game over
    endGame(roomId);
    return;
  }
  
  // 从问题池中随机选择一个题目
  const questionIndex = Math.floor(Math.random() * questions.length);
  const question = questions[questionIndex];
  
  // 清除之前的计时器
  if (room.questionTimers[questionId-1]) {
    clearTimeout(room.questionTimers[questionId-1]);
  }
  
  // 创建新的答题计时器（10秒后自动进入下一题）
  const timeLimit = 10; // 10秒作答时间
  room.questionTimers[questionId] = setTimeout(() => {
    // 如果双方都还没回答，就自动为他们提交随机答案
    if (!room.answers[questionId] || Object.keys(room.answers[questionId]).length < 2) {
      // 为未答题的玩家自动提交随机答案
      room.players.forEach(playerId => {
        if (!room.answers[questionId] || !room.answers[questionId][playerId]) {
          // 如果该玩家还没回答
          if (!room.answers[questionId]) {
            room.answers[questionId] = {};
          }
          
          // 记录超时情况（不提交随机答案，标记为超时）
          room.answers[questionId][playerId] = {
            playerId,
            answerId: -1, // 表示超时未回答
            answerTime: timeLimit,
            isCorrect: false, // 超时未回答视为错误
            timedOut: true // 标记为超时
          };
          
          // 找到对手ID
          const opponentId = room.players.find(id => id !== playerId);
          
          // 超时未回答，对手得1分
          if (opponentId && room.scores) {
            room.scores[opponentId] += 1;
          }
        }
      });
      
      // 计算分数并进入下一题
      calculateScores(roomId, questionId);
    }
  }, timeLimit * 1000);
  
  // 发送题目给客户端
  io.to(roomId).emit('newQuestion', {
    questionId: questionId,
    question: question.question,
    options: question.options,
    timeLimit: timeLimit,
    totalQuestions: room.totalQuestions // 发送总题目数给客户端
  });
  
  console.log(`Room ${roomId} sent question ${questionId} of ${room.totalQuestions}`);
}

// Calculate scores function
function calculateScores(roomId, questionId) {
  const room = rooms[roomId];
  if (!room) return;
  
  // 清除该题的计时器
  if (room.questionTimers[questionId]) {
    clearTimeout(room.questionTimers[questionId]);
    delete room.questionTimers[questionId];
  }
  
  const answers = room.answers[questionId];
  const playerIds = Object.keys(answers);
  
  if (playerIds.length !== 2) return;
  
  const [player1Id, player2Id] = playerIds;
  const player1Answer = answers[player1Id];
  const player2Answer = answers[player2Id];
  
  // 如果已经在超时处理中给对手加分，则跳过
  if (!player1Answer.timedOut && !player2Answer.timedOut) {
    // 游戏规则：答对快者得2分，对手0分；答错则对手得1分
    if (player1Answer.isCorrect && player2Answer.isCorrect) {
      // 两人都答对，答得快的得2分，对手0分
      if (player1Answer.answerTime < player2Answer.answerTime) {
        room.scores[player1Id] += 2;
        // 对手0分，不需要加
      } else {
        room.scores[player2Id] += 2;
        // 对手0分，不需要加
      }
    } else if (player1Answer.isCorrect && !player2Answer.isCorrect) {
      // player1答对，player2答错
      room.scores[player1Id] += 2; // 答对者得2分
      // player2答错，不得分
    } else if (!player1Answer.isCorrect && player2Answer.isCorrect) {
      // player1答错，player2答对
      room.scores[player2Id] += 2; // 答对者得2分
      // player1答错，不得分
    } else {
      // 两人都答错，不得分
    }
    
    // 处理答错情况：答错则对手得1分
    if (!player1Answer.isCorrect && !player1Answer.timedOut) {
      room.scores[player2Id] += 1; // player1答错，对手得1分
    }
    
    if (!player2Answer.isCorrect && !player2Answer.timedOut) {
      room.scores[player1Id] += 1; // player2答错，对手得1分
    }
  }
  
  // 查找问题
  const questionForResult = questions.find(q => q.question === room.currentQuestionObj?.question) || 
                           questions[Math.floor(Math.random() * questions.length)];
  
  // Send round results
  io.to(roomId).emit('questionResult', {
    questionId,
    correctAnswer: questionForResult.correctAnswer,
    options: questionForResult.options,
    answers: answers,
    scores: room.scores,
    currentQuestion: questionId,
    totalQuestions: room.totalQuestions
  });
  
  // 固定3秒后进入下一题
  const nextQuestionDelay = 3000; // 固定3秒
  
  // Send next question or end game after delay
  setTimeout(() => {
    if (!rooms[roomId]) return;
    
    room.currentQuestion += 1;
    if (room.currentQuestion <= room.totalQuestions) {
      sendQuestion(roomId, room.currentQuestion);
    } else {
      endGame(roomId);
    }
  }, nextQuestionDelay);
}

// End game function
function endGame(roomId) {
  if (!rooms[roomId]) return;
  
  const room = rooms[roomId];
  const player1Id = room.players[0];
  const player2Id = room.players[1];
  const player1Score = room.scores[player1Id];
  const player2Score = room.scores[player2Id];
  const player1Name = players[player1Id] ? players[player1Id].name : 'Unknown';
  const player2Name = players[player2Id] ? players[player2Id].name : 'Unknown';
  
  let winner = 'Tie';
  let winnerId = null;
  let isTie = true;
  
  if (player1Score > player2Score) {
    winner = player1Name;
    winnerId = player1Id;
    isTie = false;
  } else if (player2Score > player1Score) {
    winner = player2Name;
    winnerId = player2Id;
    isTie = false;
  }
  
  // 保存游戏结果到数据库
  db.recordQuizResult(
    roomId,
    player1Id,
    player1Name,
    player2Id,
    player2Name,
    player1Score,
    player2Score,
    winner
  );
  
  // 发送结果给双方
  io.to(roomId).emit('gameOver', {
    scores: room.scores,
    player1: {
      id: player1Id,
      name: player1Name,
      score: player1Score
    },
    player2: {
      id: player2Id,
      name: player2Name,
      score: player2Score
    },
    winner: winner,
    winnerId: winnerId,
    isTie: isTie
  });
  
  // 更新玩家状态
  if (players[player1Id]) {
    players[player1Id].inGame = false;
    players[player1Id].room = null;
  }
  
  if (players[player2Id]) {
    players[player2Id].inGame = false;
    players[player2Id].room = null;
  }
  
  // 更新玩家列表
  io.emit('playersList', Object.values(players).filter(p => !p.inGame));
  
  // 删除房间
  delete rooms[roomId];
  
  console.log(`Game ended in room ${roomId}`);
}

// 关闭应用时正确关闭数据库连接
process.on('SIGINT', () => {
  db.closeDatabase();
  process.exit(0);
});

// Start server
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
