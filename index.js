class Question {
    constructor(question, choices, correctAnswer) {
        this.question = question;
        this.choices = choices;
        this.correctAnswer = correctAnswer;
    }

    checkAnswer(answer) {
        return answer === this.correctAnswer;
    }
}

class Quiz {
    constructor() {
        this.questions = [];
        this.score = 0;
        this.currentIndex = 0;
    }

    async fetchQuestions() {
        const response = await fetch('https://opentdb.com/api.php?amount=5&type=multiple');
        const data = await response.json();
        this.questions = data.results.map(q => new Question(q.question, [...q.incorrect_answers, q.correct_answer], q.correct_answer));
        this.start();
    }

    *questionGenerator() {
        while (this.currentIndex < this.questions.length) {
            const question = this.questions[this.currentIndex];
            const userAnswer = yield question;
            if (question.checkAnswer(userAnswer)) {
                this.score++;
            }
            this.currentIndex++;
        }
    }

    start() {
        this.generator = this.questionGenerator();
        this.nextQuestion();
    }

    nextQuestion() {
        const next = this.generator.next();
        if (!next.done) {
            displayQuestion(next.value);
        } else {
            displayResults(this.score, this.questions.length);
        }
    }

    submitAnswer(answer) {
        this.generator.next(answer);
        this.nextQuestion();
    }
}

class User {
    constructor(username) {
        this.username = username;
        this.scoreHistory = [];
    }

    saveScore(score) {
        this.scoreHistory.push(score);
    }
}

const quiz = new Quiz();
quiz.fetchQuestions();

document.getElementById('submitAnswer').addEventListener('click', function() {
    const userAnswer = getUserAnswer();
    quiz.submitAnswer(userAnswer);
});

function displayQuestion(question) {
    document.getElementById('question').innerHTML = question.question;
    const choicesContainer = document.getElementById('choices');
    choicesContainer.innerHTML = '';
    question.choices.forEach(choice => {
        const button = document.createElement('button');
        button.textContent = choice;
        button.onclick = function() { setUserAnswer(choice); };
        choicesContainer.appendChild(button);
    });
}

function setUserAnswer(answer) {
    document.getElementById('submitAnswer').dataset.answer = answer;
}

function getUserAnswer() {
    return document.getElementById('submitAnswer').dataset.answer;
}

function displayResults(score, total) {
    document.getElementById('question').innerHTML = `Quiz Over! Your score: ${score}/${total}`;
    document.getElementById('choices').innerHTML = '';
}