// Socket.IO connection
const socket = io();

// DOM elements
const playerForm = document.getElementById('playerForm');
const playerNameInput = document.getElementById('playerName');
const playersList = document.getElementById('playersList');
const quizContainer = document.getElementById('quizContainer');
const questions = document.getElementById('questions');
const submitQuizBtn = document.getElementById('submitQuiz');
const resultsContainer = document.getElementById('resultsContainer');
const results = document.getElementById('results');

// Player information
let currentPlayer = null;
let currentQuestion = null;
let currentRoom = null;
let startTime = 0;
let challengeTimeout = null;

// Initialize form submit event
playerForm.addEventListener('submit', function(event) {
  event.preventDefault();
  const playerName = playerNameInput.value.trim();
  
  if (playerName) {
    // Register player
    socket.emit('register', playerName);
  }
});

// Registration successful
socket.on('registered', function(player) {
  currentPlayer = player;
  playerNameInput.disabled = true;
  playerForm.querySelector('button').disabled = true;
  
  // Show success message
  const successMessage = document.createElement('p');
  successMessage.classList.add('success-message');
  successMessage.textContent = `Welcome, ${player.name}! You have successfully registered. Wait for other players to join or challenge them.`;
  playerForm.appendChild(successMessage);
});

// Update players list
socket.on('playersList', function(players) {
  // Clear the list
  playersList.innerHTML = '';
  
  if (players.length === 0) {
    const noPlayersMsg = document.createElement('p');
    noPlayersMsg.textContent = 'No other players online';
    playersList.appendChild(noPlayersMsg);
    return;
  }
  
  // Create players list
  const ul = document.createElement('ul');
  ul.classList.add('players');
  
  players.forEach(player => {
    // Don't display current player
    if (currentPlayer && player.id === currentPlayer.id) return;
    
    const li = document.createElement('li');
    li.classList.add('player-item');
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    
    const challengeBtn = document.createElement('button');
    challengeBtn.textContent = 'Challenge';
    challengeBtn.classList.add('challenge-btn');
    challengeBtn.addEventListener('click', function() {
      socket.emit('challenge', player.id);
      
      // Show waiting message
      const waitingMsg = document.createElement('p');
      waitingMsg.classList.add('waiting-msg');
      waitingMsg.setAttribute('data-player-id', player.id);
      waitingMsg.textContent = `Challenge sent to ${player.name}, waiting for response...`;
      
      // Replace existing message if any
      const existingMsg = document.querySelector(`.waiting-msg[data-player-id="${player.id}"]`);
      if (existingMsg) {
        existingMsg.remove();
      }
      
      li.appendChild(waitingMsg);
      
      // Disable challenge button
      challengeBtn.disabled = true;
      
      // Timeout after 30 seconds
      if (challengeTimeout) {
        clearTimeout(challengeTimeout);
      }
      
      challengeTimeout = setTimeout(() => {
        waitingMsg.textContent = `${player.name} did not respond to your challenge.`;
        
        // Remove message after 10 seconds
        setTimeout(() => {
          if (waitingMsg.parentNode) {
            waitingMsg.remove();
            challengeBtn.disabled = false;
          }
        }, 10000);
      }, 30000);
    });
    
    li.appendChild(nameSpan);
    li.appendChild(challengeBtn);
    ul.appendChild(li);
  });
  
  playersList.appendChild(ul);
});

// Received challenge request
socket.on('challengeRequest', function(challenger) {
  // Create challenge notice
  const challengeNotice = document.createElement('div');
  challengeNotice.classList.add('challenge-notice');
  
  const message = document.createElement('p');
  message.textContent = `${challenger.name} has challenged you!`;
  
  const btnContainer = document.createElement('div');
  btnContainer.classList.add('notice-buttons');
  
  const acceptBtn = document.createElement('button');
  acceptBtn.textContent = 'Accept';
  acceptBtn.classList.add('accept-btn');
  acceptBtn.addEventListener('click', function() {
    socket.emit('acceptChallenge', challenger.id);
    challengeNotice.remove();
  });
  
  const rejectBtn = document.createElement('button');
  rejectBtn.textContent = 'Decline';
  rejectBtn.classList.add('reject-btn');
  rejectBtn.addEventListener('click', function() {
    socket.emit('rejectChallenge', challenger.id);
    challengeNotice.remove();
  });
  
  btnContainer.appendChild(acceptBtn);
  btnContainer.appendChild(rejectBtn);
  
  challengeNotice.appendChild(message);
  challengeNotice.appendChild(btnContainer);
  
  // Add to page
  document.body.appendChild(challengeNotice);
  
  // Auto-reject after 30 seconds
  setTimeout(() => {
    if (document.body.contains(challengeNotice)) {
      socket.emit('rejectChallenge', challenger.id);
      challengeNotice.remove();
    }
  }, 30000);
});

// Challenge accepted
socket.on('challengeAccepted', function(roomId) {
  currentRoom = roomId;
  
  // Clear challenge timeout
  if (challengeTimeout) {
    clearTimeout(challengeTimeout);
    challengeTimeout = null;
  }
  
  // Remove waiting messages
  document.querySelectorAll('.waiting-msg').forEach(msg => msg.remove());
  
  // Show game starting message
  const gameStartingMsg = document.createElement('div');
  gameStartingMsg.classList.add('game-starting');
  gameStartingMsg.textContent = 'Challenge accepted! Game starting soon...';
  
  document.body.appendChild(gameStartingMsg);
  
  // Remove message after 2 seconds
  setTimeout(() => {
    gameStartingMsg.remove();
  }, 2000);
});

// Challenge rejected
socket.on('challengeRejected', function(player) {
  // Clear challenge timeout
  if (challengeTimeout) {
    clearTimeout(challengeTimeout);
    challengeTimeout = null;
  }
  
  // Find and update waiting message
  const waitingMsg = document.querySelector(`.waiting-msg[data-player-id="${player.id}"]`);
  if (waitingMsg) {
    waitingMsg.textContent = `${player.name} declined your challenge.`;
    
    // Enable challenge button
    const challengeBtn = waitingMsg.parentNode.querySelector('.challenge-btn');
    if (challengeBtn) {
      challengeBtn.disabled = false;
    }
    
    // Remove message after 10 seconds
    setTimeout(() => {
      if (waitingMsg.parentNode) {
        waitingMsg.remove();
      }
    }, 10000);
  }
});

// Received new question
socket.on('newQuestion', function(data) {
  // Save current question
  currentQuestion = data;
  startTime = Date.now();
  
  // Hide results container
  resultsContainer.style.display = 'none';
  
  // Show question container
  quizContainer.style.display = 'block';
  
  // Create question HTML
  const questionHTML = `
    <div class="question" data-id="${data.questionId}">
      <div class="question-progress">
        <span>Question ${data.questionId} of ${data.totalQuestions}</span>
      </div>
      <div class="question-timer">
        <div class="timer-bar"></div>
      </div>
      <h3>Question ${data.questionId}: ${data.question}</h3>
      <div class="options">
        ${data.options.map((option, index) => {
          const letters = ['A', 'B', 'C', 'D', 'E', 'F']; // Option letters
          // Properly escape HTML content for display - needed for HTML tags in options
          const displayOption = option
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<button class="option-btn" data-index="${index}" data-letter="${letters[index] || index}">${displayOption}</button>`;
        }).join('')}
      </div>
      <div class="game-rules">
        <p>Rules: Faster correct answer gets 2 points, opponent 0 points; Wrong answer gives opponent 1 point</p>
        <p>Time remaining: <span class="time-left">${data.timeLimit}</span> seconds</p>
        <p class="auto-next-warning">If no answer is given, a random answer will be submitted automatically!</p>
      </div>
    </div>
  `;
  
  // Display question
  questions.innerHTML = questionHTML;
  
  // Set timer
  const timerBar = questions.querySelector('.timer-bar');
  const animationDuration = `${data.timeLimit}s`;
  timerBar.style.animationDuration = animationDuration;
  timerBar.classList.add('animate');
  
  // Update countdown timer
  const timeLeftSpan = questions.querySelector('.time-left');
  let timeLeft = data.timeLimit;
  const countdownInterval = setInterval(() => {
    timeLeft -= 1;
    if (timeLeftSpan) {
      timeLeftSpan.textContent = timeLeft;
    }
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);
  
  // Listen for option clicks
  const optionBtns = questions.querySelectorAll('.option-btn');
  optionBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      // Disable all options
      optionBtns.forEach(b => b.disabled = true);
      
      // Highlight selected option
      optionBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      // Calculate answer time
      const answerTime = (Date.now() - startTime) / 1000;
      
      // Add answering status message
      const statusMsg = document.createElement('p');
      statusMsg.classList.add('answer-status');
      statusMsg.textContent = 'Answer submitted, waiting for opponent...';
      questions.querySelector('.game-rules').appendChild(statusMsg);
      
      // Clear countdown interval
      clearInterval(countdownInterval);
      
      // Send answer
      socket.emit('submitAnswer', {
        roomId: currentRoom,
        questionId: data.questionId,
        answerId: parseInt(btn.getAttribute('data-index')),
        answerTime: answerTime
      });
    });
  });
  
  // Auto-submit on timeout
  setTimeout(() => {
    // If all options are not disabled, means user didn't answer
    if (![...optionBtns].every(btn => btn.disabled)) {
      // Disable all options
      optionBtns.forEach(btn => btn.disabled = true);
      
      // Add timeout message
      const statusMsg = document.createElement('p');
      statusMsg.classList.add('answer-status');
      statusMsg.textContent = 'Time\'s up! You did not answer in time. Your opponent will get 1 point.';
      statusMsg.style.color = '#dc3545';
      questions.querySelector('.game-rules').appendChild(statusMsg);
      
      // Clear countdown interval
      clearInterval(countdownInterval);
      
      // Send timeout (without random answer)
      socket.emit('submitAnswer', {
        roomId: currentRoom,
        questionId: data.questionId,
        answerId: -1, // -1 表示超时未回答
        answerTime: data.timeLimit,
        timedOut: true // 标记为超时
      });
    }
  }, data.timeLimit * 1000);
});

// Question result
socket.on('questionResult', function(data) {
  // Stop timer animation
  const timerBar = questions.querySelector('.timer-bar');
  if (timerBar) {
    timerBar.classList.remove('animate');
  }
  
  // Highlight correct answer
  const optionBtns = questions.querySelectorAll('.option-btn');
  optionBtns.forEach((btn, index) => {
    if (index === data.correctAnswer) {
      btn.classList.add('correct');
    } else {
      btn.classList.remove('correct');
    }
  });
  
  // Show results
  resultsContainer.style.display = 'block';
  
  // Get current player and opponent IDs
  const playerId = currentPlayer.id;
  const opponentId = Object.keys(data.scores).find(id => id !== playerId);
  
  // Get answer information
  const playerAnswer = data.answers[playerId];
  const opponentAnswer = data.answers[opponentId];
  
  // Calculate points earned this round
  const prevRound = document.querySelector('.round-result');
  let playerPrevScore = 0;
  let opponentPrevScore = 0;
  
  if (prevRound) {
    // Extract previous scores if available
    const playerScoreText = prevRound.querySelector('.player-score strong').nextSibling.textContent;
    const opponentScoreText = prevRound.querySelector('.opponent-score strong').nextSibling.textContent;
    
    playerPrevScore = parseInt(playerScoreText.match(/\d+/)[0]) || 0;
    opponentPrevScore = parseInt(opponentScoreText.match(/\d+/)[0]) || 0;
  }
  
  const playerPointsEarned = data.scores[playerId] - playerPrevScore;
  const opponentPointsEarned = data.scores[opponentId] - opponentPrevScore;
  
  // Get the correct answer text and properly escape HTML tags
  const correctAnswerText = data.options[data.correctAnswer]
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Create result HTML
  const resultHTML = `
    <div class="round-result">
      <h3>Question ${data.questionId} of ${data.totalQuestions} Results</h3>
      <p class="correct-answer">Correct answer: ${correctAnswerText}</p>
      <div class="scores">
        <div class="player-score">
          <p><strong>You</strong>: ${data.scores[playerId]} points <span class="points-earned">(+${playerPointsEarned})</span></p>
          <p class="answer ${playerAnswer?.isCorrect ? 'correct' : playerAnswer?.timedOut ? 'timeout' : 'wrong'}">
            ${playerAnswer?.isCorrect ? '✓ Correct' : 
              playerAnswer?.timedOut ? '⏱ Time\'s up' : '✗ Wrong'} 
            (${playerAnswer?.answerTime.toFixed(2)} seconds)
          </p>
        </div>
        <div class="opponent-score">
          <p><strong>Opponent</strong>: ${data.scores[opponentId]} points <span class="points-earned">(+${opponentPointsEarned})</span></p>
          <p class="answer ${opponentAnswer?.isCorrect ? 'correct' : opponentAnswer?.timedOut ? 'timeout' : 'wrong'}">
            ${opponentAnswer?.isCorrect ? '✓ Correct' : 
              opponentAnswer?.timedOut ? '⏱ Time\'s up' : '✗ Wrong'} 
            (${opponentAnswer?.answerTime.toFixed(2)} seconds)
          </p>
        </div>
      </div>
      <div class="next-question-notice">
        ${data.questionId < data.totalQuestions 
          ? `<p>Next question will start in <span class="next-question-countdown">3</span> seconds...</p>` 
          : `<p>This was the last question. Calculating final results...</p>`}
      </div>
    </div>
  `;
  
  results.innerHTML = resultHTML;
  
  // Begin a countdown timer for next question time
  if (data.questionId < data.totalQuestions) {
    const countdownEl = document.querySelector('.next-question-countdown');
    let estimatedCountdown = 3; // Fixed 3 seconds
    
    const nextQuestionInterval = setInterval(() => {
      estimatedCountdown -= 1;
      if (countdownEl) {
        countdownEl.textContent = estimatedCountdown;
      }
      if (estimatedCountdown <= 0) {
        clearInterval(nextQuestionInterval);
        countdownEl.textContent = "starting now";
      }
    }, 1000);
  }
});

// Game over
socket.on('gameOver', function(data) {
  // Hide question container
  quizContainer.style.display = 'none';
  
  // Show results container
  resultsContainer.style.display = 'block';
  
  // Get current player and opponent IDs
  const playerId = currentPlayer.id;
  const opponentId = Object.keys(data.scores).find(id => id !== playerId);
  
  // 调试信息，帮助排查问题
  console.log('Game over data:', data);
  console.log('Current player ID:', playerId);
  
  // Determine result
  let resultMessage = '';
  let resultClass = '';
  
  if (data.isTie) {
    resultMessage = 'Game Over, It\'s a tie!';
    resultClass = 'tie';
  } else if (data.winnerId === playerId) {
    resultMessage = 'Congratulations, You won!';
    resultClass = 'win';
  } else {
    resultMessage = 'Sorry, You lost!';
    resultClass = 'lose';
  }
  
  // 显示谁是获胜者
  const winnerName = data.winnerId ? 
    (data.winnerId === playerId ? 'You' : data.player2.id === data.winnerId ? data.player2.name : data.player1.name) : 
    'Nobody (Tie)';
  
  // Create final result HTML
  const finalResultHTML = `
    <div class="final-result ${resultClass}">
      <h3 class="result-message">${resultMessage}</h3>
      <div class="final-scores">
        <div class="player-final-score">
          <h4>Your Score</h4>
          <div class="score-value">${data.scores[playerId]}</div>
        </div>
        <div class="vs">VS</div>
        <div class="opponent-final-score">
          <h4>Opponent Score</h4>
          <div class="score-value">${data.scores[opponentId]}</div>
        </div>
      </div>
      <div class="game-summary">
        <p>Winner: <strong>${winnerName}</strong></p>
        <p>Game Rules: Faster correct answer gets 2 points, opponent 0 points; Wrong answer or timeout gives opponent 1 point</p>
        <p>Thanks for playing!</p>
      </div>
      <button id="returnToLobby" class="primary-btn">Return to Lobby</button>
    </div>
  `;
  
  results.innerHTML = finalResultHTML;
  
  // Add special styles for the final result
  addGameOverStyles();
  
  // Listen for return button
  document.getElementById('returnToLobby').addEventListener('click', function() {
    // Reset game state
    currentRoom = null;
    currentQuestion = null;
    
    // Hide results container
    resultsContainer.style.display = 'none';
    
    // Clear questions container
    questions.innerHTML = '';
  });
});

// Opponent left
socket.on('opponentLeft', function(data) {
  // Hide question and results containers
  quizContainer.style.display = 'none';
  resultsContainer.style.display = 'block';
  
  // Show opponent left message
  const opponentLeftHTML = `
    <div class="opponent-left">
      <h3>Opponent Left</h3>
      <p>${data.name} has left the game.</p>
      <button id="returnToLobby" class="primary-btn">Return to Lobby</button>
    </div>
  `;
  
  results.innerHTML = opponentLeftHTML;
  
  // Listen for return button
  document.getElementById('returnToLobby').addEventListener('click', function() {
    // Reset game state
    currentRoom = null;
    currentQuestion = null;
    
    // Hide results container
    resultsContainer.style.display = 'none';
  });
});

// Add styles for game over screen
function addGameOverStyles() {
  // Add a style element if it doesn't exist
  let styleElement = document.getElementById('gameOverStyles');
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'gameOverStyles';
    document.head.appendChild(styleElement);
  }
  
  // Add CSS rules
  styleElement.textContent = `
    .final-result {
      text-align: center;
      padding: 20px;
      border-radius: 10px;
      animation: fadeIn 0.5s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .result-message {
      font-size: 24px;
      margin-bottom: 20px;
    }
    
    .win .result-message { color: #28a745; }
    .lose .result-message { color: #dc3545; }
    .tie .result-message { color: #ffc107; }
    
    .final-scores {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 30px 0;
    }
    
    .player-final-score, .opponent-final-score {
      padding: 15px;
      border-radius: 5px;
      background-color: #f8f9fa;
      width: 40%;
    }
    
    .vs {
      margin: 0 20px;
      font-weight: bold;
      font-size: 18px;
    }
    
    .score-value {
      font-size: 36px;
      font-weight: bold;
      margin: 10px 0;
    }
    
    .win .player-final-score .score-value { color: #28a745; }
    .lose .opponent-final-score .score-value { color: #28a745; }
    
    .game-summary {
      margin: 20px 0;
      font-size: 14px;
      color: #6c757d;
    }
    
    .primary-btn {
      background-color: #4a89dc;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    
    .primary-btn:hover {
      background-color: #3a79cc;
    }
  `;
} 