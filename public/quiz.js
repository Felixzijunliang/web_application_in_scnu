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
      <div class="question-timer">
        <div class="timer-bar"></div>
      </div>
      <h3>Question ${data.questionId}: ${data.question}</h3>
      <div class="options">
        ${data.options.map((option, index) => `
          <button class="option-btn" data-index="${index}">${option}</button>
        `).join('')}
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
      
      // Send timeout (random answer)
      socket.emit('submitAnswer', {
        roomId: currentRoom,
        questionId: data.questionId,
        answerId: Math.floor(Math.random() * data.options.length),
        answerTime: data.timeLimit
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
  
  // Create result HTML
  const resultHTML = `
    <div class="round-result">
      <h3>Question ${data.questionId} Results</h3>
      <div class="scores">
        <div class="player-score">
          <p><strong>You</strong>: ${data.scores[playerId]} points</p>
          <p class="answer ${playerAnswer?.isCorrect ? 'correct' : 'wrong'}">
            ${playerAnswer?.isCorrect ? '✓ Correct' : '✗ Wrong'} 
            (${playerAnswer?.answerTime.toFixed(2)} seconds)
          </p>
        </div>
        <div class="opponent-score">
          <p><strong>Opponent</strong>: ${data.scores[opponentId]} points</p>
          <p class="answer ${opponentAnswer?.isCorrect ? 'correct' : 'wrong'}">
            ${opponentAnswer?.isCorrect ? '✓ Correct' : '✗ Wrong'} 
            (${opponentAnswer?.answerTime.toFixed(2)} seconds)
          </p>
        </div>
      </div>
    </div>
  `;
  
  results.innerHTML = resultHTML;
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
  
  // Determine result
  let resultMessage = '';
  if (data.isTie) {
    resultMessage = 'Game Over, It\'s a tie!';
  } else if (data.winnerId === playerId) {
    resultMessage = 'Congratulations, You won!';
  } else {
    resultMessage = 'Sorry, You lost!';
  }
  
  // Create final result HTML
  const finalResultHTML = `
    <div class="final-result">
      <h3>${resultMessage}</h3>
      <div class="final-scores">
        <p><strong>Your score</strong>: ${data.scores[playerId]}</p>
        <p><strong>Opponent score</strong>: ${data.scores[opponentId]}</p>
      </div>
      <button id="returnToLobby">Return to Lobby</button>
    </div>
  `;
  
  results.innerHTML = finalResultHTML;
  
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
      <button id="returnToLobby">Return to Lobby</button>
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