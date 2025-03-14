class User {
    constructor(username) {
        this.username = username;
        this.scoreHistory = [];
    }

    saveScore(score, total) {
        this.scoreHistory.push({
            score,
            total,
            date: new Date().toLocaleString()
        });
        this.updateHistoryUI();
    }

    updateHistoryUI() {
        const historyList = document.getElementById('scoreHistory');
        historyList.innerHTML = this.scoreHistory
            .map((entry, index) => `
                <li>#${index + 1}: ${entry.score}/${entry.total} - ${entry.date}</li>
            `)
            .join('');
    }
}

class Question {
    constructor(question, choices, correctAnswer, difficulty) {
        this.question = question;
        this.choices = choices.sort(() => Math.random() - 0.5);
        this.correctAnswer = correctAnswer;
        this.difficulty = difficulty;
    }

    checkAnswer(answer) {
        return answer === this.correctAnswer;
    }
}

class Quiz {
    constructor(user) {
        this.user = user;
        this.questions = { easy: [], medium: [], hard: [] };
        this.currentDifficulty = 'medium';
        this.score = 0;
        this.questionsPresented = 0;
        this.generator = null;
    }

    async fetchQuestions() {
        try {
            const difficulties = ['easy', 'medium', 'hard'];
            const promises = difficulties.map(async diff => {
                try {
                    const res = await fetch(`https://opentdb.com/api.php?amount=5&difficulty=${diff}&type=multiple`);
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                    const data = await res.json();
                    
                    // Validate API response
                    if (data.response_code !== 0 || !data.results) {
                        console.warn(`No results for ${diff} difficulty`);
                        return { results: [] };
                    }
                    return data;
                } catch (error) {
                    console.error(`Failed to fetch ${diff} questions:`, error);
                    return { results: [] }; 
                }
            });
    
            const results = await Promise.allSettled(promises);
            
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    data.results.forEach(q => {
                        const question = new Question(
                            q.question,
                            [...q.incorrect_answers, q.correct_answer],
                            q.correct_answer,
                            q.difficulty
                        );
                        this.questions[q.difficulty].push(question);
                    });
                }
            });
    
            const totalQuestions = Object.values(this.questions).reduce((acc, arr) => acc + arr.length, 0);
            if (totalQuestions === 0) {
                throw new Error('No questions available. Please try again later.');
            }
    
            this.start();
        } catch (error) {
            this.showError(`Failed to fetch questions: ${error.message}`);
        }
    }
    
    *questionGenerator() {
        let consecutiveCorrect = 0;

        while (true) {
            let questionsPool = this.questions[this.currentDifficulty];
            
            if (questionsPool.length === 0) {
                const fallbackDifficulties = ['hard', 'medium', 'easy'].filter(d => d !== this.currentDifficulty);
                let fallbackFound = false;

                for (let fallback of fallbackDifficulties) {
                    if (this.questions[fallback].length > 0) {
                        questionsPool = this.questions[fallback];
                        fallbackFound = true;
                        break;
                    }
                }

                if (!fallbackFound) break; 
            }

            const question = questionsPool.pop();
            const answer = yield question;

            if (question.checkAnswer(answer)) {
                this.score++;
                consecutiveCorrect++;
                document.getElementById('score').textContent = `Score: ${this.score}`;

                if (consecutiveCorrect >= 2 && this.currentDifficulty !== 'hard') {
                    this.currentDifficulty = this.getNextDifficulty(1);
                    consecutiveCorrect = 0;
                }
            } else {
                consecutiveCorrect = 0;
                if (this.currentDifficulty !== 'easy') {
                    this.currentDifficulty = this.getNextDifficulty(-1);
                }
            }
        }
    }

    getNextDifficulty(direction) {
        const difficulties = ['easy', 'medium', 'hard'];
        const currentIndex = difficulties.indexOf(this.currentDifficulty);
        const newIndex = Math.min(Math.max(currentIndex + direction, 0), 2);
        return difficulties[newIndex];
    }

    start() {
        document.getElementById('quizContainer').classList.remove('hidden');
        document.getElementById('submitAnswer').classList.remove('hidden');
        this.generator = this.questionGenerator();
        
        const firstQuestionObj = this.generator.next().value;
        if (firstQuestionObj) {
            this.displayQuestion(firstQuestionObj);
        } else {
            this.endQuiz();
        }
    }

    nextQuestion(answer) { 
        const nextResult = answer ? 
          this.generator.next(answer).value : 
          this.generator.next().value;

        if (nextResult) { 
            this.displayQuestion(nextResult);
        } else { 
            this.endQuiz();
        }
    }

    displayQuestion(question) {
        this.questionsPresented++; 
        document.getElementById('question').innerHTML = question.question;
        document.getElementById('difficulty').className = `difficulty ${question.difficulty}`;
        document.getElementById('difficulty').textContent = question.difficulty.toUpperCase();

        const choicesContainer = document.getElementById('choices');
        choicesContainer.innerHTML = '';
        
        question.choices.forEach(choice => {
            const button = document.createElement('button');
            button.textContent = choice;
            button.addEventListener('click', this.handleAnswerSelect.bind(this));
            choicesContainer.appendChild(button);
        });
    }

    handleAnswerSelect(e) {
        document.querySelectorAll('#choices button').forEach(btn => btn.style.background = '#e5e7eb');
        e.target.style.background = '#bfdbfe';
        document.getElementById('submitAnswer').dataset.answer = e.target.textContent;
    }

    submitAnswer() {
        const answer = document.getElementById('submitAnswer').dataset.answer;
        if (!answer) return;

        const next = this.generator.next(answer);

        delete document.getElementById('submitAnswer').dataset.answer;

        if (!next.done) {
            this.displayQuestion(next.value);
        } else {
            this.endQuiz();
        }
    }

    endQuiz() {
        this.user.saveScore(this.score, this.questionsPresented);

        document.getElementById('question').innerHTML = `Quiz Complete!<br>Final Score: ${this.score}/${this.questionsPresented}`;
        document.getElementById('choices').innerHTML = '';
        document.getElementById('submitAnswer').classList.add('hidden');
    }
    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

document.getElementById('startQuiz').addEventListener('click', function () {
    const username = document.getElementById('username').value;
    if (!username) return;

    const user = new User(username);
    document.getElementById('loginForm').classList.add('hidden');

    const quiz = new Quiz(user);

    document.getElementById('submitAnswer').addEventListener(
        'click',
        quiz.submitAnswer.bind(quiz)
    );

    quiz.fetchQuestions().catch(error => {
        quiz.showError(`Quiz failed to start: ${error.message}`);
    });
});
