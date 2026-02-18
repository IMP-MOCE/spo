// Настройка PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Импортируем WebLLM
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// КОНФИГУРАЦИЯ
const MODEL_ID = "Qwen3-4B-q4f16_1-MLC";
const ENABLE_THINKING = true;

let engine = null;
let modelLoaded = false; // Флаг для отслеживания загрузки модели

// DOM элементы
let pdfUpload, totalHoursInput, generateBtn, statusBadge;
let progressContainer, progressFill, progressText, cardsGrid;

// Инициализация DOM
function initDOM() {
    pdfUpload = document.getElementById('pdf-upload');
    totalHoursInput = document.getElementById('total-hours');
    generateBtn = document.getElementById('generate-btn');
    statusBadge = document.getElementById('status-badge');
    progressContainer = document.getElementById('progress-container');
    progressFill = document.getElementById('progress-fill');
    progressText = document.getElementById('progress-text');
    cardsGrid = document.getElementById('cards-grid');

    // Проверяем все ли элементы найдены
    const elements = {
        'pdf-upload': pdfUpload,
        'total-hours': totalHoursInput,
        'generate-btn': generateBtn,
        'status-badge': statusBadge,
        'progress-container': progressContainer,
        'progress-fill': progressFill,
        'progress-text': progressText,
        'cards-grid': cardsGrid
    };

    let allFound = true;
    for (const [id, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`❌ Элемент с id "${id}" не найден в DOM`);
            allFound = false;
        }
    }
    
    return allFound;
}

// Проверка WebGPU
async function checkWebGPUSupport() {
    if (!navigator.gpu) {
        statusBadge.textContent = "❌ WebGPU не поддерживается";
        statusBadge.className = "badge loading";
        return false;
    }
    
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            statusBadge.textContent = "❌ Нет GPU адаптера";
            statusBadge.className = "badge loading";
            return false;
        }
        
        const device = await adapter.requestDevice();
        console.log("✅ WebGPU поддерживается");
        console.log("Адаптер:", adapter.name);
        console.log("Макс. память:", adapter.limits?.maxBufferSize || "неизвестно");
        
        return true;
    } catch (e) {
        console.error("Ошибка WebGPU:", e);
        statusBadge.textContent = "❌ Ошибка WebGPU";
        statusBadge.className = "badge loading";
        return false;
    }
}

// Загрузка модели
async function initWebLLM() {
    // Сначала проверяем DOM
    if (!initDOM()) {
        console.error("DOM не инициализирован");
        return;
    }

    // Проверяем поддержку WebGPU
    const webGPUSupported = await checkWebGPUSupport();
    if (!webGPUSupported) {
        alert("WebGPU не поддерживается в этом браузере. Используйте Chrome/Edge 113+ или Firefox с включенным флагом dom.webgpu.enabled");
        return;
    }

    try {
        // Обновляем UI
        statusBadge.textContent = "⚪ Загрузка модели...";
        statusBadge.className = "badge loading";
        progressContainer.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = 'Инициализация...';

        console.log("🚀 Начинаем загрузку модели:", MODEL_ID);

        // Загружаем модель
        engine = await webllm.CreateMLCEngine(
            MODEL_ID,
            {
                initProgressCallback: (progress) => {
                    if (progressFill && progressText) {
                        const percent = Math.round(progress.progress * 100);
                        progressFill.style.width = percent + '%';
                        progressText.textContent = progress.text || `Загрузка: ${percent}%`;
                    }
                    console.log("Прогресс:", progress.text);
                }
            }
        );

        // Модель загружена
        modelLoaded = true;
        statusBadge.textContent = `🟢 ${MODEL_ID}`;
        statusBadge.className = "badge ready";
        progressContainer.style.display = 'none';

        // Активируем элементы управления
        pdfUpload.disabled = false;
        totalHoursInput.disabled = false;
        generateBtn.disabled = false;
        
        console.log("✅ Модель успешно загружена!");

    } catch (error) {
        console.error("❌ Ошибка загрузки модели:", error);
        statusBadge.textContent = "🔴 Ошибка загрузки";
        statusBadge.className = "badge loading";
        progressContainer.style.display = 'none';
        
        // Показываем детальную ошибку
        let errorMessage = "Не удалось загрузить модель.\n\n";
        if (error.message.includes("Memory")) {
            errorMessage += "Недостаточно памяти GPU. Попробуйте:\n";
            errorMessage += "• Закрыть другие вкладки\n";
            errorMessage += "• Перезагрузить браузер\n";
            errorMessage += "• Использовать устройство с большим объемом видеопамяти";
        } else {
            errorMessage += `Ошибка: ${error.message}\n\n`;
            errorMessage += "Проверьте:\n";
            errorMessage += "1. Соединение с интернетом\n";
            errorMessage += "2. Поддержку WebGPU\n";
            errorMessage += "3. Консоль браузера (F12) для деталей";
        }
        
        alert(errorMessage);
    }
}

// Запрос к модели
async function askModel(messages, enableThinking = ENABLE_THINKING) {
    if (!engine || !modelLoaded) {
        throw new Error("Модель не загружена или загружается");
    }

    try {
        console.log("📤 Отправка запроса к модели...");
        
        const reply = await engine.chat.completions.create({
            messages,
            temperature: 0.1,
            max_tokens: 2048,
            extra_body: enableThinking ? { enable_thinking: true } : undefined
        });

        console.log("📥 Получен ответ от модели");
        return reply.choices[0].message.content;
        
    } catch (error) {
        console.error("Ошибка при запросе к модели:", error);
        throw new Error(`Ошибка модели: ${error.message}`);
    }
}

// Извлечение текста из PDF
async function extractTextFromPDF(file) {
    try {
        console.log("📄 Чтение PDF файла...");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = "";
        const maxPages = Math.min(pdf.numPages, 5);
        
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + " ";
            console.log(`Страница ${i} обработана, длина: ${pageText.length}`);
        }
        
        console.log(`✅ PDF обработан, всего символов: ${fullText.length}`);
        return fullText;
        
    } catch (error) {
        console.error("Ошибка при чтении PDF:", error);
        throw new Error(`Не удалось прочитать PDF: ${error.message}`);
    }
}

// Основная функция генерации плана
async function generatePlan() {
    console.log("🎯 Нажата кнопка генерации плана");

    // Проверяем наличие файла
    if (!pdfUpload.files || pdfUpload.files.length === 0) {
        alert("Пожалуйста, загрузите PDF файл");
        return;
    }

    const file = pdfUpload.files[0];
    const totalHours = parseFloat(totalHoursInput.value);

    if (isNaN(totalHours) || totalHours <= 0) {
        alert("Пожалуйста, укажите корректное количество часов");
        return;
    }

    if (!engine || !modelLoaded) {
        alert("Модель ещё не загружена. Пожалуйста, подождите.");
        return;
    }

    // Блокируем кнопку на время генерации
    generateBtn.disabled = true;
    const originalButtonText = generateBtn.textContent;
    
    // Очищаем предыдущие результаты
    cardsGrid.innerHTML = '';
    cardsGrid.classList.add('hidden');

    try {
        // Шаг 1: Чтение PDF
        generateBtn.textContent = "📄 Чтение PDF...";
        const pdfText = await extractTextFromPDF(file);

        // Шаг 2: Извлечение тем
        generateBtn.textContent = "🤔 Анализ тем (1/2)...";
        console.log("Запрос на извлечение тем...");
        
        const topicsResponse = await askModel([
            { 
                role: "user", 
                content: `Проанализируй этот текст экзаменационного билета и выпиши ТОЛЬКО список тем и вопросов через запятую. Никакого дополнительного текста. Текст: ${pdfText.substring(0, 8000)}` 
            }
        ]);
        
        const topicsList = topicsResponse;
        console.log("📋 Извлеченные темы:", topicsList);

        // Шаг 3: Оценка весов
        generateBtn.textContent = "🧮 Расчет времени (2/2)...";
        console.log("Запрос на оценку сложности...");
        
        const prompt = `
        На основе этих тем: ${topicsList}
        
        Создай план подготовки. Для каждой темы укажи:
        - title: название темы
        - weight: сложность от 1 до 10
        - complexity: "low", "medium" или "high"
        - description: краткое описание (1 предложение)
        
        ВЕРНИ ТОЛЬКО JSON в таком формате:
        {
          "plan": [
            { "title": "Тема 1", "weight": 5, "complexity": "medium", "description": "Описание" }
          ]
        }`;

        const jsonResponse = await askModel([{ role: "user", content: prompt }]);
        console.log("📦 Ответ модели (JSON):", jsonResponse);

        // Очищаем JSON от markdown
        const cleanJson = jsonResponse
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();

        // Ищем JSON объект
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Модель не вернула валидный JSON");
        }

        const rawData = JSON.parse(jsonMatch[0]);
        
        // Проверяем структуру
        if (!rawData.plan || !Array.isArray(rawData.plan)) {
            throw new Error("Неверный формат данных: отсутствует массив plan");
        }

        // Нормализация времени
        const tasks = rawData.plan;
        const totalWeight = tasks.reduce((sum, task) => sum + (task.weight || 1), 0);

        const normalizedPlan = tasks.map(task => ({
            title: task.title || "Без названия",
            weight: task.weight || 1,
            complexity: task.complexity || "medium",
            description: task.description || "Описание отсутствует",
            hours: Math.round(((task.weight || 1) / totalWeight) * totalHours * 10) / 10
        }));

        console.log("✅ План готов:", normalizedPlan);
        
        // Отображаем результаты
        renderCards(normalizedPlan);

    } catch (error) {
        console.error("❌ Ошибка генерации:", error);
        
        // Показываем понятную ошибку пользователю
        let userMessage = "Произошла ошибка при генерации плана.\n\n";
        
        if (error.message.includes("JSON")) {
            userMessage += "Модель вернула некорректный формат данных. Попробуйте еще раз.";
        } else if (error.message.includes("PDF")) {
            userMessage += "Ошибка при чтении PDF файла. Убедитесь, что файл не поврежден.";
        } else if (error.message.includes("модель")) {
            userMessage += "Ошибка при работе с моделью. Попробуйте перезагрузить страницу.";
        } else {
            userMessage += error.message;
        }
        
        alert(userMessage);
        
    } finally {
        // Возвращаем кнопку в исходное состояние
        generateBtn.disabled = false;
        generateBtn.textContent = originalButtonText;
    }
}

// Отрисовка карточек
function renderCards(planArray) {
    cardsGrid.innerHTML = '';
    
    if (!planArray || planArray.length === 0) {
        cardsGrid.innerHTML = '<div class="no-data">Нет данных для отображения</div>';
        cardsGrid.classList.remove('hidden');
        return;
    }
    
    planArray.forEach(task => {
        const complexity = task.complexity.toLowerCase();
        let complexityClass = 'comp-medium';
        let complexityText = 'Средняя';
        
        if (complexity.includes('high')) {
            complexityClass = 'comp-high';
            complexityText = 'Высокая';
        } else if (complexity.includes('low')) {
            complexityClass = 'comp-low';
            complexityText = 'Низкая';
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${task.title}</div>
                <div class="card-time">⏳ ${task.hours} ч.</div>
            </div>
            <div class="card-complexity ${complexityClass}">
                Сложность: ${complexityText}
            </div>
            <div class="card-desc">${task.description}</div>
        `;
        
        cardsGrid.appendChild(card);
    });
    
    cardsGrid.classList.remove('hidden');
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
    console.log("📱 Страница загружена, инициализация...");
    
    if (!initDOM()) {
        console.error("Критическая ошибка: не найдены элементы DOM");
        return;
    }

    // Добавляем обработчик на кнопку
    if (generateBtn) {
        generateBtn.addEventListener('click', generatePlan);
        console.log("✅ Обработчик кнопки добавлен");
    } else {
        console.error("❌ Кнопка не найдена!");
    }

    // Запускаем загрузку модели
    await initWebLLM();
});

// Дополнительная проверка, что кнопка существует
console.log("🔍 Скрипт загружен, поиск кнопки...");