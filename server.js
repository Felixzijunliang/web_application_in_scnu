const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

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
  }
];

// Game rooms
const rooms = {};
const players = {};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root path to index.html
app.get('/', (req, res) => {
  res.redirect('/index.html');
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
  
  // Send first question
  sendQuestion(roomId, room.currentQuestion);
}

// Send question function
function sendQuestion(roomId, questionId) {
  const room = rooms[roomId];
  if (!room || questionId > questions.length) {
    // Game over
    endGame(roomId);
    return;
  }
  
  const question = questions[questionId-1];
  io.to(roomId).emit('newQuestion', {
    questionId: question.id,
    question: question.question,
    options: question.options,
    timeLimit: 10 // 10 seconds to answer
  });
  
  console.log(`Room ${roomId} sent question ${questionId}`);
}

// Calculate scores function
function calculateScores(roomId, questionId) {
  const room = rooms[roomId];
  if (!room) return;
  
  const answers = room.answers[questionId];
  const playerIds = Object.keys(answers);
  
  playerIds.forEach(playerId => {
    const answer = answers[playerId];
    
    // Correct answer gets 2 points
    if (answer.isCorrect) {
      room.scores[playerId] += 2;
    } 
    // Wrong answer but faster than opponent gets 1 point
    else {
      const otherPlayerId = room.players.find(id => id !== playerId);
      if (otherPlayerId && answers[otherPlayerId]) {
        if (answers[otherPlayerId].isCorrect === false && 
            answer.answerTime < answers[otherPlayerId].answerTime) {
          room.scores[playerId] += 1;
        }
      }
    }
  });
  
  // Send round results
  io.to(roomId).emit('questionResult', {
    questionId,
    correctAnswer: questions[questionId-1].correctAnswer,
    answers: answers,
    scores: room.scores
  });
  
  // Send next question or end game after 5 seconds
  setTimeout(() => {
    if (!rooms[roomId]) return;
    
    room.currentQuestion += 1;
    if (room.currentQuestion <= questions.length) {
      sendQuestion(roomId, room.currentQuestion);
    } else {
      endGame(roomId);
    }
  }, 5000);
}

// End game function
function endGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  // Determine winner
  const [player1Id, player2Id] = room.players;
  let winnerId = null;
  let winnerName = null;
  
  if (room.scores[player1Id] > room.scores[player2Id]) {
    winnerId = player1Id;
    winnerName = players[player1Id].name;
  } else if (room.scores[player2Id] > room.scores[player1Id]) {
    winnerId = player2Id;
    winnerName = players[player2Id].name;
  }
  
  // Send game results
  io.to(roomId).emit('gameOver', {
    scores: room.scores,
    winnerId,
    winnerName,
    isTie: winnerId === null
  });
  
  console.log(`Game ${roomId} ended, winner: ${winnerName || 'Tie'}`);
  
  // Update player status
  room.players.forEach(playerId => {
    if (players[playerId]) {
      players[playerId].inGame = false;
      players[playerId].room = null;
    }
  });
  
  // Broadcast updated player list
  io.emit('playersList', Object.values(players).filter(p => !p.inGame));
  
  // Delete room
  setTimeout(() => {
    delete rooms[roomId];
  }, 1000);
}

// Start server
http.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
