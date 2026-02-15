import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

// Настройка PDF.js (указываем путь к worker)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// DOM элементы
const pdfUpload = document.getElementById('pdf-upload');
const totalHoursInput = document.getElementById('total-hours');
const generateBtn = document.getElementById('generate-btn');
const statusBadge = document.getElementById('status-badge');
const progressContainer = document.getElementById('progress-container');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');
const cardsGrid = document.getElementById('cards-grid');

let engine;

// 1. Инициализация ИИ (используем 3B модель для ума)
async function initAI() {
    try {
        const initProgressCallback = (report) => {
            progressText.textContent = report.text;
            progressFill.style.width = `${Math.round(report.progress * 100)}%`;
        };

        engine = await CreateMLCEngine(
            "Qwen2.5-3B-Instruct-q4f16_1-MLC", 
            { initProgressCallback }
        );

        statusBadge.textContent = "ИИ Готов";
        statusBadge.className = "badge ready";
        progressContainer.classList.add('hidden');
        
        // Разблокируем интерфейс
        pdfUpload.disabled = false;
        totalHoursInput.disabled = false;
        generateBtn.disabled = false;
    } catch (e) {
        progressText.textContent = "Ошибка инициализации WebGPU.";
        console.error(e);
    }
}

// 2. Извлечение текста из PDF
async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    // Читаем первые 3 страницы (чтобы не перегрузить контекст нейросети)
    const maxPages = Math.min(pdf.numPages, 3);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + " ";
    }
    
    // Обрезаем до 4000 символов для гарантии стабильности на смартфоне
    return fullText.substring(0, 4000); 
}

// 3. Отправка в нейросеть и получение JSON
async function generatePlan() {
    const file = pdfUpload.files[0];
    const totalHours = parseFloat(totalHoursInput.value);

    if (!file) {
        alert("Пожалуйста, загрузите PDF файл.");
        return;
    }

    // Блокируем кнопку и показываем загрузку
    generateBtn.disabled = true;
    generateBtn.textContent = "Читаю PDF и думаю...";
    cardsGrid.innerHTML = '';
    cardsGrid.classList.add('hidden');

    try {
        const pdfText = await extractTextFromPDF(file);
        console.log("Извлеченный текст:", pdfText);

        // Строгий промпт для выбивания JSON
        const prompt = `
        Ты — опытный репетитор по высшей математике. Твоя задача: проанализировать демо-билет и составить ПОШАГОВЫЙ план подготовки.
        ПРАВИЛА:
        1. Дели план по ТЕМАМ (от простых к сложным), а не по видам деятельности.
        2. Каждая подзадача должна соответствовать конкретным номерам заданий из билета.
        3. Используй только русский язык.
        4. Общее время {total_hours} должно быть распределено так: 20% теория, 80% практика.
        5. Выводи СТРОГО JSON.
        Текст билета: "${pdfText}"
        Всего времени: ${totalHours} часов.
        Выведи ТОЛЬКО валидный JSON без маркдауна, без комментариев. Формат:
        {
          "plan": [
            {
              "title": "Название темы",
              "hours": 2.5,
              "complexity": "high",
              "description": "Что именно нужно выучить"
            }
          ]
        }`;

        const response = await engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1, // Минимум креатива, максимум логики
        });

        const rawText = response.choices[0].message.content;
        
        // Магия Regex: вытаскиваем JSON, даже если модель добавила текст "Вот ваш JSON:"
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Модель не вернула JSON.");
        console.log("Ответ модели:", rawText);
        const planData = JSON.parse(jsonMatch[0]);
        renderCards(planData.plan);

    } catch (error) {
        console.error("Ошибка:", error);
        alert("Произошла ошибка при анализе. Попробуйте еще раз.");
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "Сгенерировать план";
    }
}

// 4. Отрисовка карточек в DOM
function renderCards(planArray) {
    cardsGrid.innerHTML = ''; // Очищаем старые
    
    planArray.forEach(task => {
        // Защита от кривых данных
        const complexityCls = task.complexity.toLowerCase() === 'high' ? 'comp-high' : 
                              task.complexity.toLowerCase() === 'medium' ? 'comp-medium' : 'comp-low';
        
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${task.title}</div>
                <div class="card-time">⏳ ${task.hours} ч.</div>
            </div>
            <div class="card-complexity ${complexityCls}">Сложность: ${task.complexity}</div>
            <div class="card-desc">${task.description}</div>
        `;
        cardsGrid.appendChild(card);
    });

    cardsGrid.classList.remove('hidden');
}

// Слушатели событий
generateBtn.addEventListener('click', generatePlan);

// Запуск
initAI();