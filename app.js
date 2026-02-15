import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

// DOM элементы
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusBadge = document.getElementById('status-badge');
const loadingContainer = document.getElementById('loading-container');
const loadingText = document.getElementById('loading-text');
const progressFill = document.getElementById('progress-fill');

let engine;
// Память бота (системный промпт)
const messages = [
    { role: "system", content: "Ты полезный, умный и лаконичный ИИ-ассистент. Отвечай на русском языке." }
];

// 1. Инициализация нейросети
async function init() {
    try {
        const initProgressCallback = (report) => {
            // Обновляем прогресс-бар при скачивании весов
            loadingText.textContent = report.text;
            const percentage = Math.round(report.progress * 100);
            progressFill.style.width = `${percentage}%`;
        };

        // Загружаем оптимизированную Llama 3.2 1B
        engine = await CreateMLCEngine(
            "Llama-3.2-1B-Instruct-q4f16_1-MLC", 
            { initProgressCallback }
        );

        // Готово к работе: включаем интерфейс
        statusBadge.textContent = "Готов";
        statusBadge.className = "badge ready";
        loadingContainer.style.display = "none";
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();

    } catch (error) {
        loadingText.textContent = "Ошибка: WebGPU не поддерживается или сбой сети.";
        loadingText.style.color = "red";
        console.error(error);
    }
}

// 2. Функция добавления сообщений в UI
function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div; // Возвращаем элемент, чтобы обновлять его при стриминге
}

// 3. Отправка сообщения и потоковая генерация
async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    // Блокируем ввод на время ответа
    userInput.value = '';
    userInput.disabled = true;
    sendBtn.disabled = true;

    // Показываем сообщение пользователя
    appendMessage('user', text);
    messages.push({ role: "user", content: text });

    // Создаем пустой пузырь для ответа бота
    const botMessageElement = appendMessage('bot', '...');
    let botReply = "";

    try {
        // Запрашиваем генерацию со стримингом
        const chunks = await engine.chat.completions.create({
            messages,
            stream: true,
            temperature: 0.7
        });

        botMessageElement.textContent = ""; // Очищаем '...'

        // Читаем ответ по токенам (по мере их появления на видеокарте)
        for await (const chunk of chunks) {
            const token = chunk.choices[0]?.delta?.content || "";
            botReply += token;
            botMessageElement.textContent += token;
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        // Сохраняем ответ в память
        messages.push({ role: "assistant", content: botReply });

    } catch (error) {
        botMessageElement.textContent = "Произошла ошибка при генерации.";
        console.error(error);
    } finally {
        // Разблокируем ввод
        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
}

// Слушатели событий
sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// Запуск при открытии страницы
init();