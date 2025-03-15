class User {
    constructor(username) {
        this.username = username;
        this.scoreHistory = [];
    }

    saveScore(score, total) {
        this.scoreHistory.push({
            username: this.username,
            score,
            total,
            date: new Date().toLocaleString()
        });
        this.updateHistoryUI();
    }

    updateHistoryUI() {
        const historyList = document.getElementById('scoreHistory');
        historyList.innerHTML = this.scoreHistory
            .map((entry, index) => 
                `<li>#${index + 1}: ${entry.username} - ${entry.score}/${entry.total} - ${entry.date}</li>`
            )
            .join('');
    }
}

class Question {
    constructor(question, choices, correctAnswer, difficulty) {
        this.question = question;
        this.choices = this.shuffleChoices([...choices, correctAnswer]);
        this.correctAnswer = correctAnswer;
        this.difficulty = difficulty;
    }

    shuffleChoices(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    checkAnswer(answer) {
        return answer === this.correctAnswer;
    }
}

class Quiz {
    constructor(user) {
        this.user = user;
        this.initializeState();
        this.bindElements();
        this.bindEvents();
    }

    initializeState() {
        this.queues = { easy: [], medium: [], hard: [] };
        this.currentDifficulty = 'easy';
        this.score = 0;
        this.questionsPresented = 0;
        this.generator = null;
        this.currentQuestion = null;
        this.selectedAnswer = null;
        this.isFetching = false;
    }

    bindElements() {
        this.elements = {
            quizContainer: document.getElementById('quizContainer'),
            difficulty: document.getElementById('difficulty'),
            score: document.getElementById('score'),
            question: document.getElementById('question'),
            choices: document.getElementById('choices'),
            submitButton: document.getElementById('submitAnswer'),
            error: document.getElementById('error')
        };
    }

    bindEvents() {
        this.elements.submitButton.addEventListener(
            'click', 
            this.handleSubmit.bind(this)
        );
    }

    async fetchQuestions() {
        const BASE_DELAY = 2000;
        const MAX_RETRIES = 5;
        const DIFFICULTIES = ["easy", "medium", "hard"];
        this.isFetching = true;

        try {
            this.showLoadingState();
            const results = await Promise.all(
                DIFFICULTIES.map(d => this.fetchDifficultyQuestions(d, BASE_DELAY, MAX_RETRIES))
            );

            this.queues = DIFFICULTIES.reduce((acc, d, i) => {
                acc[d] = results[i];
                return acc;
            }, {});

            if (Object.values(this.queues).every(q => q.length === 0)) {
                throw new Error('Failed to load any questions');
            }

            this.start();
        } catch (error) {
            this.showError(`Failed to load questions: ${error.message}`);
            throw error;
        } finally {
            this.isFetching = false;
            this.hideLoadingState();
        }
    }

    async fetchDifficultyQuestions(difficulty, baseDelay, maxRetries) {
        const url = `https://opentdb.com/api.php?amount=10&difficulty=${difficulty}&type=multiple`;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url);
                
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || 1;
                    await this.delay(baseDelay * Math.pow(2, attempt) + (retryAfter * 1000));
                    continue;
                }

                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                
                const data = await response.json();
                if (data.response_code !== 0 || !data.results) {
                    throw new Error('Invalid API response');
                }

                return data.results.map(q => new Question(
                    q.question,
                    q.incorrect_answers,
                    q.correct_answer,
                    difficulty
                ));
            } catch (error) {
                if (attempt === maxRetries) return [];
                await this.delay(baseDelay * Math.pow(2, attempt) + Math.random() * 500);
            }
        }
        return [];
    }

    *questionGenerator() {
        let state = {
            consecutiveCorrect: 0,
            consecutiveIncorrect: 0,
            questionsAsked: 0,
            maxQuestions: 10
        };

        while (state.questionsAsked < state.maxQuestions) {
            this.adjustDifficulty(state);
            const question = this.getNextQuestion();
            if (!question) break;

            const answer = yield question;
            state.questionsAsked++;
            this.processAnswer(answer, question, state);
        }
    }

    adjustDifficulty(state) {
        if (state.consecutiveCorrect >= 2) {
            if (this.currentDifficulty === 'easy' && this.queues.medium.length) {
                this.currentDifficulty = 'medium';
            } else if (this.currentDifficulty === 'medium' && this.queues.hard.length) {
                this.currentDifficulty = 'hard';
            }
            state.consecutiveCorrect = 0;
        }

        if (state.consecutiveIncorrect >= 2) {
            if (this.currentDifficulty === 'hard' && this.queues.medium.length) {
                this.currentDifficulty = 'medium';
            } else if (this.currentDifficulty === 'medium' && this.queues.easy.length) {
                this.currentDifficulty = 'easy';
            }
            state.consecutiveIncorrect = 0;
        }
    }

    getNextQuestion() {
        const queue = this.queues[this.currentDifficulty];
        if (queue.length > 0) return queue.shift();

        const fallbackDifficulty = Object.keys(this.queues).find(d => 
            d !== this.currentDifficulty && this.queues[d].length > 0
        );
        
        if (fallbackDifficulty) {
            this.currentDifficulty = fallbackDifficulty;
            return this.queues[fallbackDifficulty].shift();
        }
        return null;
    }

    processAnswer(answer, question, state) {
        if (question.checkAnswer(answer)) {
            this.score++;
            state.consecutiveCorrect++;
            state.consecutiveIncorrect = 0;
        } else {
            state.consecutiveIncorrect++;
            state.consecutiveCorrect = 0;
        }
    }

    start() {
        this.elements.quizContainer.classList.remove('hidden');
        this.generator = this.questionGenerator();
        const firstQuestion = this.generator.next().value;
        
        if (firstQuestion) {
            this.displayQuestion(firstQuestion);
            this.elements.submitButton.style.display = 'block';
        } else {
            this.endQuiz();
        }
    }

    displayQuestion(question) {
        this.currentQuestion = question;
        this.questionsPresented++;
        this.selectedAnswer = null;

        this.elements.question.innerHTML = question.question;
        this.elements.difficulty.className = `difficulty ${question.difficulty}`;
        this.elements.difficulty.textContent = question.difficulty.toUpperCase();
        this.elements.score.textContent = `Score: ${this.score}/${this.questionsPresented - 1}`;

        this.elements.choices.innerHTML = '';
        question.choices.forEach(choice => {
            const button = document.createElement('button');
            button.textContent = choice;
            button.addEventListener('click', e => this.handleAnswerSelect(e));
            this.elements.choices.appendChild(button);
        });

        this.elements.submitButton.disabled = true;
    }

    handleAnswerSelect(e) {
        document.querySelectorAll('#choices button').forEach(btn => 
            btn.classList.remove('selected')
        );
        e.target.classList.add('selected');
        this.selectedAnswer = e.target.textContent;
        this.elements.submitButton.disabled = false;
    }

    handleSubmit() {
        if (!this.selectedAnswer) return;
    
        const isCorrect = this.currentQuestion.checkAnswer(this.selectedAnswer);
        const correctAnswer = this.currentQuestion.correctAnswer;
    
        // Highlight answers
        document.querySelectorAll('#choices button').forEach(btn => {
            btn.disabled = true;
            if (btn.textContent === correctAnswer) {
                btn.style.border = '2px solid #10b981';
            }
            if (btn.textContent === this.selectedAnswer) {
                btn.style.background = isCorrect ? '#bbf7d0' : '#fecaca';
            }
        });
    
        // popup feedback
        this.showFeedback(isCorrect, correctAnswer);
    
        // Process after delay
        setTimeout(() => {
            const next = this.generator.next(this.selectedAnswer);
            if (!next.done) {
                this.displayQuestion(next.value);
            } else {
                this.endQuiz();
            }
        }, 1500);
    }

    highlightAnswers(isCorrect) {
        document.querySelectorAll('#choices button').forEach(btn => {
            btn.disabled = true;
            if (btn.textContent === this.currentQuestion.correctAnswer) {
                btn.style.border = '2px solid #10b981';
            }
            if (btn.textContent === this.selectedAnswer) {
                btn.style.background = isCorrect ? '#bbf7d0' : '#fecaca';
            }
        });
    }

    showFeedback(isCorrect, correctAnswer) {
        const feedback = document.getElementById('feedback');
        feedback.innerHTML = '';
    
        //overlay elements
        const overlay = document.createElement('div');
        overlay.className = 'popup-overlay';
        
        const content = document.createElement('div');
        content.className = 'popup-content';
        
        content.innerHTML = `
            <h3>${isCorrect ? 'Correct! 🎉' : 'Incorrect! 😞'}</h3>
            ${!isCorrect ? `<p>Correct answer: ${correctAnswer}</p>` : ''}
        `;
        
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        document.getElementById('quizContainer').classList.add('blur');
    
        setTimeout(() => {
            document.body.removeChild(overlay);
            document.getElementById('quizContainer').classList.remove('blur');
        }, 1500);
    }
    endQuiz() {
        this.user.saveScore(this.score, this.questionsPresented);
        this.elements.question.innerHTML = `
            <h2>Quiz Complete!</h2>
            <p>Final Score: ${this.score}/${this.questionsPresented}</p>
        `;
        this.elements.choices.innerHTML = '';
        this.elements.submitButton.style.display = 'none';
        
        const playAgain = document.createElement('button');
        playAgain.textContent = 'Play Again';
        playAgain.addEventListener('click', () => this.restartQuiz());
        this.elements.question.appendChild(playAgain);
    }

    restartQuiz() {
        this.initializeState();
        this.elements.question.innerHTML = 'Loading new questions...';
        this.fetchQuestions().catch(error => 
            this.showError(`Failed to restart: ${error.message}`)
        );
    }

    showLoadingState() {
        document.getElementById('loading').classList.remove('hidden');
    }

    hideLoadingState() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        this.elements.error.textContent = message;
        this.elements.error.classList.remove('hidden');
        setTimeout(() => 
            this.elements.error.classList.add('hidden'), 3000
        );
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialization
let quizInstance;

document.getElementById('startQuiz').addEventListener('click', () => {
    const username = document.getElementById('username').value.trim();
    if (!username) return;

    document.getElementById('loginForm').classList.add('hidden');
    
    if (!quizInstance || quizInstance.user.username !== username) {
        quizInstance = new Quiz(new User(username));
    }

    quizInstance.fetchQuestions().catch(error => 
        console.error('Quiz initialization failed:', error)
    );
});
