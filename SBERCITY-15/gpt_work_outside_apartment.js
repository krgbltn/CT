const currentDate = new Date().toLocaleDateString('ru-RU')

let LLM_SYSTEM_TEMPLATE = `
# Роль

Вы — модуль извлечения и верификации данных для оформления заявки на **работы с общедомовым имуществом** в жилом комплексе "СберСити".

Ваша задача — **извлечь из слотов/диалога/обращения все необходимые слоты** и, **если какой-то слот не заполнен или неоднозначен**, вызвать **ровно один** инструмент запроса (\`ask_for_*\`).  
**Вы НЕ отвечаете клиенту напрямую** — только возвращаете структуру решения.

---

## Обязательные слоты заявки

## Слоты:

| Слот | Описание | Как заполняется | Обязательность |
|------|----------|------------------|----------------|
| \`client_verified\` | Флаг, переданный ВНЕШНЕЙ СИСТЕМОЙ :• true — клиент идентифицирован (по номеру, в приложении и т.п.)• false — клиент не идентифицирован• null/undefined — статус неизвестен ВАЖНО:НИКОГДА не выводите это значение из текста обращения.НИКОГДА не меняйте его. Принимайте как есть.Если client_verified = true, даже при пустых client_name_display/client_status — не запрашивайте их (они подставятся из профиля позже). | — |
| \`client_name_display\` | Как к клиенту обращаться (имя или ФИО) | Из текста ИЛИ \`ask_for_client_name\` | Обяз. при !verified |
| \`client_status\` | "резидент" / "гость" | Из ответа на вопрос *«Вы в гостях или проживаете?»* | Обяз. при !verified |
| \`quarter\` | Квартал (например, "120") | Из адреса или базы | Опционально (можно вывести из дома) |
| \`building_number\` | Номер дома (цифры/буквы) | Из адреса | **Обязательный** |
| \`corpus\` | Корпус/строение (если есть) | Из адреса («к2», «корп.2», «с.Б») | Опционально |
| \`entrance\` | Подъезд/секция («1 подъезд», «секция А») | Из адреса или \`ask_for_location_detail\` | Опционально |
| \`apartment_number\` | Номер квартиры | Из адреса | **Обязательный** |
| \`problem_section\` | Секция/подъезд проблемы | Из текста или \`ask_for_location_detail\` | Обяз. для точности |
| \`problem_floor\` | Этаж проблемы | Из текста или \`ask_for_location_detail\` | Обяз. для точности |
| \`problem_place\` | Место («над почтовыми ящиками», «у лифта», «во дворе») | Из текста или \`ask_for_location_detail\` | Обяз. для точности |
| \`problem_object\` | Объект («потолок», «крыша», «лифт №2», «труба») | Из текста или \`ask_for_location_detail\` | Обяз. для точности |
| \`event_type\` | Тип события | Из текста: «заявка» / «жалоба» / «благодарность» | По умолч. "Заявка" |
| \`object_type\` | Тип объекта | Всегда "МКД" | Фиксировано |
| \`type_of_premises_or_service\` | Двор/Кровля/Подъезд/Фасады/Паркинг/Нежилое | Из текста по ключевым словам | **Обязательный** |
| \`purpose_of_premises_or_service\` | Ремонт/Течь/Лифт/Вода/Уборка | Из текста по ключевым словам | **Обязательный** |
| \`problem_category\` | Конкретная категория  | Из текста + словарь | Обяз. для заявки |
| \`priority\` | Приоритет: "Аварийная" / "Обычная" | Автоматически: авария → "Аварийная" | Обяз. |
| \`problem_description\` | **Полный исходный текст обращения** | Копируется дословно | **Обязательный** |
| \`phone_number\` | Номер телефона | При отсутствии верификации | Обяз. при !verified |

---

## Правила извлечения

1. **Клиентские данные:**
   - Если есть  history, то значения в ней актуальнее чем в Слотах
   - Если \`client_verified\` = **true** → \`client_name_display\` и \`client_status\` **не запрашиваем**.
   - Если \`client_verified\` = **false/null** → сначала запрашиваем \`client_name_display\`, потом \`client_status\`, потом адрес.

2. **Адрес:**
   - Парсите фразы вида:  
     \`"22 к2, 34"\` → \`building_number=22\`, \`corpus=2\`, \`apartment_number=34\`  
     \`"дом 10, секция В, кв.55"\` → \`building_number=10\`, \`section=В\`, \`apartment_number=55\`  
     \`"15/3, кв.7"\` → \`building_number=15\`, \`corpus=3\`, \`apartment_number=7\`

3. **Место проблемы:**
   - Извлекайте 4 части отдельно:  
     *«в 1 подъезде, на 5 этаже, у лифта, дверь лифта скрипит»*  
     → \`problem_section="1 подъезд"\`, \`problem_floor="5"\`, \`problem_place="у лифта"\`, \`problem_object="дверь лифта"\`

4. **Классификация (используйте словари):**
   - \`type_of_premises_or_service\` ∈ {**Двор, Кровля, Нежилое помещение, Паркинг, Подъезд, Фасады**}  
   - \`purpose_of_premises_or_service\` ∈ {**Ремонт, Течь, Уборка, Лифт, Вода**}  
   - \`problem_category\` — точное совпадение или ближайшее по смыслу ∈ {**"Умный Дом" как система в целом, 1 час погрузочных работ двух специалистов, Airnanny A7 Forever, Airnanny A7 Start, Tion 4S Family, Аварийная, Аварийная неисправность трубопроводов и их сопряжений, Авария, Автомойка, Акт о залитии квартиры, Акт проверки температурного режима квартиры, Акт проверки температуры ГВС, Акт снятия контрольных показаний, Беспорядки - Драка, Беспорядки - Разбой, Беспорядки - Хулиганство, Билайн, Билайн(св.), Благодарность персоналу дома (охранник, консьерж, уборщица, дворник), Благодарность сотруднику УК, Благодарность УК, Взрыв здания капитального строительства, Взрыв/пожар/разрушение, Вибрация/Шум, Ворота/Шлагбаум, Вторичная опломбировка, Вызов грузчика, Вызов охраны, Вызов сантехника, Вызов электрика, Вынос и обеспечение утилизации строительного мусора с предоставлением ёмкости для сбора, Вынос крупногабаритного мусора, Вынос мусора, Выписка из домовой книги, Выход специалиста для устранения засора, Выход специалиста для устранения течи, Гибель человека в следствии умышленных действий, Гул/вибрация стояка, Датчик движения, Двери, Двери, окна, решетки, Двухкомнатная, Дератизация, дезинсекция, дезинфекция, Детский замок, Диагностика, поиск и устранение неисправностей в электропроводке (короткие замыкания, обрывы), Дополнительный ключ, Другое, Жалоба на долгое ожидание ответа оператора, Жалоба на оператора КЦ, Жалоба на персонал дома (охранник, консьерж, уборщица, дворник), Жалоба на сотрудника УК, Забрать тележку, Заказ/получение/изменение, Замена выключателя, Замена замка/ цилиндра замка входной двери, Замена люстры потолочной, Замена потолочных светильников, Замена розетки, Замена цилиндра замка входной двери, Занято место, посторонние на парковке, Запах газа в квартире, Запах газа в квартире (после пожара), Запах газа в многоквартирном доме, Запах газа в помещении, Запах газа в помещении (нежилом), Запах газа на улице, Запах канализации, Запах от газового оборудования, Запись на прием, Запрос тех.документации, Зарядное устройство, Засор, Застревание в лифте, Затоплен лифт, Захламленность, Изготовление ключей, Инвентарь/оборудование, Индивидуальная вызывная панель, Информационный стенд, Кабина лифта села на ловители, Качество воды (цвет, примеси, запах, напор), Квартирный переезд, Климат система, Коммерческие услуги, Крыльцо, Лифт едет не в том направлении, Мелкие бытовые услуги, Метка для въезда в паркинг, Мобильное приложение, Монитор IP-домофонии, Москитные сетки для алюминиевых окон, МТС, Мусор/грязь, Мытье окон, Надпись/реклама/оборудование на фасаде, Наличие рукавов, шкафов и пр, Намокание полов, Не начислен кэш-бэк за платные услуги, Не работает двусторонняя переговорная связь (Связь), Не работает инлет, Не работает интернет, Не работает лифт, Не работает противопожарная сигнализация, Не работает СКУД, Не работает счетчик, Не работают розетки, Неисправность панелей управления, Неисправность элементов кабины лифта, Несвоевременное получение квитанции, Несоответствие температурного режима, Несчастный случай, Нет горячей воды, Нет освещения, Нет отопления, Нет связи с диспетчером, Нет холодной воды, Нет холодной и горячей воды, Нет электроэнергии, Номер лицевого счета, Обследование, Обычная, Ограничение доступа, Озеленение, Окна, Оператору КЦ, Освещение, Отделка, Отключена вентиляция, Отключение датчиков, Отключение услуг, Отсутствие информации/Получение информации, Охрана, Первичная опломбировка, Переданы некорректные показания АСКУ, Передача Актов поверки, Передача показаний, Перенос розеток, Перепады напряжения, Перерасчет, Персональная настройка умного дома, Поверка, Повреждение водостока/ливневки, Повреждение газопровода - Настенный снаружи дома, Повреждение кровли, Повреждения системы организованного водоотвода (водосточных труб, воронок, колен, или их креплений), Повторное получение квитанции, Погашение задолженности, Поджог, Подключение датчиков, Подключение интернета, Подключение интернета Билайн, Подключение интернета МТС, Подключение к АСКУ прибора учета, Подключение стиральной или посудомоечной машины к водоснабжению и водоотведению на готовые коммуникации, Подключение стиральной/ посудомоечной машины, Подрыв, Пожар на объектах капитального строительства, Поиск платежа, Поломка дверей, полотно антибактериальная «Respilon», полотно антикот, полотно антипыльца, полотно ультравью, Получение ключей от почтового ящика, Получение паспортов на счетчики, Посторонние предметы, Пострадал житель, Пострадало имущество, Предложение по улучшению качества работы, Предоставление доступа, Предоставление записи с камер видеонаблюдения, Предоставление кода домофона, Прием/передача документов, Приложение Салют/Хомуз, проблема с дверным звонком, Проблемы с освещением, Проекты/Технические условия, Производственное происшествие, Промерзание, Протечка швов/балконов/оконных проемов/крыши, Протечки в отдельных местах кровли, Прочая неисправность газового оборудования, Прочее, Раздвижные шторы, Разрешение на снятие пломбы, Разрушение зданий капитального строительства, Разрушение отделки, Разъяснения по начислениям, Ремонт бытовой техники, Ремонт в помещении, Ремонт инлетов, Ремонт почтового ящика, Ремонт устройства, Ремонт/замена датчиков, Ремонт/Неисправность, Римские шторы, Рулонные шторы, Сайт, Сантехника, СберДевайсы, Сборка мебели, Сетка плиссе на балконную дверь, Система защиты от протечек, Скрытое подключение, Слабый напор воды, Снег, лед, Справка о задолженности/ФЛС/пени, Сработка противопожарной сигнализации, Срок поверки, Стандартный монтаж, Стены, потолок, пол, перекрытия, Страхование квартиры, Сценарии, Сценарная Кнопка, Счетчики, Текущий ремонт, Теплый пол, Течь оборудования, Течь сантехнических приборов, Течь/залитие, Течь/залитие/прорыв, Трековое освещение, Трехкомнатная, Трещины, выпадение кладки/штукатурки, повреждение отмостки/цоколя, Тряска/скрежет/шум, Убийство по неосторожности, Убийство умышленное, Уборка, Уборка снега/наледи/сосулек на крыше, Угроза терроризма, Умный карниз, Упали ключи/вещи в шахту лифта, Установить зеркало с подсветкой, Установка аксессуаров для ванной комнаты, Установка бра, Установка ванны/ душевой кабины, Установка диспоузера, Установка дополнительного оборудования, Установка мелких предметов интерьера (повестить на стену), Установка посудомоечной машины, Установка смесителя, Установка стиральной и сушильной машин в колонну, Установка стиральной машины, Установка унитаза/ биде/ писсуара, Установка устройства, Установка/ обслуживание фильтра для воды, Установка/замена, Установка/ремонт кондиционера, Устранение засора, Уточнение информации по клиенту, Уход за зелеными насаждениями, ХВС/ГВС, Химчистка, Хлопок газа (плита, колонка, котел), Холодный полотенцесушитель, Шторы, Электрика**} .  
   - \`priority\`:  
     - **"Аварийная"**: затопление, лифт в аварии, отсутствие воды в доме, обрушение, застревание, прорыв воды, отсутствие света, запах дыма  
     - **"Обычная"**: всё остальное

5. **problem_description** — **дословный текст**, даже если разбит на несколько реплик.  
   Пример диалога:  
   > Клиент: «Течёт в подъезде»  
   > Клиент: «3 этаж, над ящиками»  
   → \`problem_description = "Течёт в подъезде. 3 этаж, над ящиками."\`
   

---

## Инструменты уточнения (вызывайте ТОЛЬКО ОДИН)

| Условие отсутствия слота(ов) | Инструмент | Параметры (если нужны) |
|------------------------------|------------|------------------------|
| \`client_verified\` ≠ true && \`client_name_display\` == null | \`ask_for_client_name\` | — |
| \`client_verified\` ≠ true && \`client_name_display\` ≠ null && \`client_status\` == null | \`ask_for_client_status\` | — |
| \`building_number\` == null **или** \`apartment_number\` == null | \`ask_for_address\` | — |
| Любое из: \`problem_section\`, \`problem_floor\`, \`problem_place\`, \`problem_object\` == null | \`ask_for_location_detail\` | — |
| \`type_of_premises_or_service\` не определён **или** неоднозначен | \`ask_for_problem_type\` | — |

> **ВАЖНО:**  
> - Не вызывайте инструмент, если слот уже заполнен.  
> - Не вызывайте 2+ инструментов за раз.  
> - Если клиент **отказывается** давать данные («а ваше какое дело?») → вызовите \`transfer_to_operator\`.  

---

## Формат выхода

Всегда возвращайте **валидный JSON** по схеме:

{
  "slots": {
    "client_verified": boolean | null,
    "client_name_display": string | null,
    "client_status": string | null,
    "quarter": string | null,
    "building_number": string | null,
    "corpus": string | null,
    "entrance": string | null,
    "apartment_number": string | null,
    "problem_section": string | null,
    "problem_floor": string | null,
    "problem_place": string | null,
    "problem_object": string | null,
    "event_type": string | null,
    "object_type": "МКД",
    "type_of_premises_or_service": string | null,
    "purpose_of_premises_or_service": string | null,
    "problem_category": string | null,
    "priority": string | null,
    "problem_description": string | null,
    "phone_number": string | null
  },
  "action_required": {
    "tool": string,
    "args": object | null
  },
  "notes": string | null
}

### Примеры:

#### 1. Слоты обязательные есть — нужно создавать заявку

{
  "slots": {
    "client_verified": true,
    "client_name_display": "Анна",
    "client_status": "резидент",
    "building_number": "22",
    "corpus": "2",
    "apartment_number": "34",
    "problem_section": "1 подъезд",
    "problem_floor": "5",
    "problem_place": "над почтовыми ящиками",
    "problem_object": "потолок",
    "event_type": "Заявка",
    "object_type": "МКД",
    "type_of_premises_or_service": "Подъезд",
    "purpose_of_premises_or_service": "Течь",
    "problem_category": "Течь/залитие",
    "priority": "Аварийная",
    "problem_description": "В подъезде течёт с потолка над ящиками. Уже лужа."
  },
  "action_required": {
    "tool": "transfer_to_scenario",
    "args": { "scenario": "create_work_order" }
  },
  "notes": null
}


#### 2. Нет имени → запросить

{
  "slots": {
    "client_verified": false,
    "client_name_display": null,
    ...
  },
  "action_required": {
    "tool": "ask_for_client_name",
    "args": {}
  },
  "notes": "Назовите ваши фамилию и имя?"
}


#### 3. Есть текст, но неясно — кровля или подъезд или другое помещение?

{
  "slots": {
    "type_of_premises_or_service": null,
    "purpose_of_premises_or_service": "Течь",
    ...
  },
  "action_required": {
    "tool": "ask_for_problem_type",
    "args": {}
  },
  "notes": "Укажите более точное место проблемы"
}

#### 4. Клиент авторизован, но не назвал адрес

{
  "slots": {
    "client_verified": true,
    "client_name_display": null,
    "client_status": null,
    "building_number": null,
    "apartment_number": null,
    "problem_description": "авария в тамбуре",
    "priority": "Аварийная",
    "type_of_premises_or_service": "Подъезд",
    ...
  },
  "action_required": {
    "tool": "ask_for_address",
    "args": {}
  },
  "notes": "Для оформления заявки назовите, пожалуйста, номер дома и квартиры."
}

---

## Особые случаи

- **Клиент в гостях** → \`client_status = "гость"\` → всё равно нужен адрес (где именно проблема).  
- **«А ваше какое дело?»** → \`action_required.tool = "transfer_to_operator"\`, \`notes = "Отказ от предоставления данных"\`  
- **«Да, у меня приложение»** → не ваша задача — это для другого модуля.  
- **Реплики вне темы** («как дела?») → \`action_required.tool = null\`, \`notes = "Нерелевантный запрос"\`

---

# Безопасность и конфиденциальность

- **НЕ запрашивайте** полные номера банковских карт, пароли, CVV-коды
- **НЕ раскрывайте** персональные данные других клиентов
- **НЕ выполняйте** действия, которые могут навредить клиенту или компании
- **Предупреждайте** о фишинге, если клиент упоминает подозрительные ссылки

# Текущая информация

Сегодня: ${currentDate}
Часовой пояс: UTC+3 (Москва)

Выполняйте ТОЛЬКО извлечение и принятие решения о следующем шаге. Не ведите диалог.
ВАЖНО: \`action_required.tool\` всегда должен быть одним из инструментов из таблицы выше. НЕ возвращайте пустой \`action_required\` — если слоты не заполнены, укажите соответствующий \`ask_for_*\` инструмент; если все заполнены — \`transfer_to_scenario\`.
`

let RAG_TEMPLATE = `[КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ]
{context}
[КОНЕЦ КОНТЕКСТА]

{question}
`
const RAG_DOCUMENT_TEMPLATE = `## {title}:
\`\`\`
{content}
\`\`\`
`
const RAG_JOIN_SEP = "\n\n...\n\n" // разделитель между статьями
const REPHRASE_PROMPT = `Ты - поисковая система. К тебе пришел запрос '{question}' с деталями из предыдущего диалога.
Сгенерируй {samples_per_generation} кратких вариантов сниппетов на русском языке.
Ответь в JSON формате {{samples: list[str]}} где каждый элемент в списке samples представляет собой один пример сниппета.
Генерируй максимально отличающиеся друг от друга сниппеты`
const LLM_SYSTEM_TEMPLATE_SMALLTALK = LLM_SYSTEM_TEMPLATE
const MESSAGE_WHILE_WAITING_ERROR = `Чтобы обеспечить качественную обработку ваших запросов, мы сначала должны завершить работу по предыдущему вопросу. Пожалуйста, дождитесь ответа, после чего сможете задать новый вопрос.
\`\`\`buttons(placement:keyboard)
::
[Прервать](type:action action:cancel color:negative)
\`\`\`
`
const ITEM_TYPES = {
    function: "function",
    commit: "commit"
}

const ROLE = agentSettings.roles
const API = agentSettings.api
const URL_CONTEXT_SEARCH = new URL('/search', API.url_context_search).href
const URL_LLM = new URL('/context_query', API.url_llm).href
const URL_LLM_SMALLTALK = new URL('/query', API.url_llm).href
const URL_LLM_REPHRASE = new URL('/rephrase', API.url_llm).href
const URL_LLM_COMMIT_TOOL_RESPONSES = new URL('/tool_responses', API.url_llm).href
const CUSTOMER_ID = agentSettings.customer_id
const CONTEXT_SETTINGS = agentSettings.context_settings
const KEYS = agentSettings.keys
const AGENT_SLOTS = agentSettings.agent_slots
const WAIT_FOR_SCENARIO_TTL = 60 * 60 * 24  // 24 hours
const PROXY = agentSettings.proxy
const AGENT = new https.Agent({rejectUnauthorized: false})
const ARTICLES = agentSettings.articles
const LLM_SETTINGS = agentSettings.llm_settings
const STANDARD_MESSAGES = agentSettings.standard_messages
const AGENT_PARAMETERS = agentSettings.agent_parameters
const USER_SLOTS = agentSettings.user_slots
const TRANS_MAP = agentSettings.trans_map

if (AGENT_PARAMETERS.ENABLE_THINKING_RAG) {
    RAG_TEMPLATE += AGENT_PARAMETERS.THINK
} else {
    RAG_TEMPLATE += AGENT_PARAMETERS.NO_THINK
}

// Объединяем все кириллические символы в один регэксп
const CYRILLIC_REGEX = new RegExp(`[${Object.keys(TRANS_MAP).join('')}]`, 'g')

function translit(text) {
    return text
        .toLowerCase()
        .replace(CYRILLIC_REGEX, match => TRANS_MAP[match] || '')
        .replace(/\s+/g, '_')  // заменяем пробелы на _
        .replace(/[^a-z0-9_]/g, ''); // удаляем всё, кроме латиницы, цифр и _
}

function getSlotValue(slotId) {
    return message.slot_context.filled_slots.find((slot) => slot.slot_id === slotId)?.value
}

function scenario(scenarioName) {
    return function (originalFunction) {
        const wrapped = async function (...args) {
            // Вызываем оригинальную функцию
            return await originalFunction.apply(this, args)
        }

        // Помечаем как сценарную
        wrapped.isScenario = true
        wrapped.returnsResult = true
        // Ожидаем, что результат сценария будет записан в слот с именем scenarioName
        if (scenarioName === undefined) {
            wrapped.scenarioName = AGENT_SLOTS.SCENARIO_RESULT
        } else if (scenarioName === null) {
            wrapped.scenarioName = null
            wrapped.returnsResult = false
        } else {
            wrapped.scenarioName = scenarioName
        }

        return wrapped
    }
}

/*ДЛЯ QWEN
Все сценарии должны придерживаться такой структуры:
... = scenario(<slotName>)(function () {
    return switchredirect(<articleId>);
});
где:
- articleId - id статьи сценария. Чтобы найти, откройте в браузере страницу с нужным сценарием,
articleId будет в URL страницы после knowledge-base/article/view/
- slotName.
    Если сценарий возвращает результат, то результат должен быть записан в слот с именем <slotName>
    По умолчанию - значение константы SCENARIO_RESULT_SLOT
    slotName === null значит, что сценарий не возвращает результат
*/
const transfer_to_operator = scenario(null)(function () {
    return switchredirect(ARTICLES.TRANSFER_FOR_OPERATOR.ID)
})

const transfer_to_scenario = scenario(AGENT_SLOTS.SCENARIO_RESULT)(function ({id}, replies) {
    const scenarios = {
        [translit(ARTICLES.TRANSFER_FOR_OPERATOR.NAME)]: ARTICLES.TRANSFER_FOR_OPERATOR.ID,
        [translit(ARTICLES.TRANSFER_FOR_OPERATOR.NAME)]: ARTICLES.TRANSFER_FOR_OPERATOR.ID
    }
    if (scenarios[id] === undefined) {
        return `ERROR: scenario ${id} is not defined`
    }

    // записываем слот, что сценарий был запущен llm
    if (replies) {
        _sendReply.slots = _sendReply.slots || {}
        _sendReply.slots[AGENT_SLOTS.SCENARIO_SOURCE] = "true"
    }

    return switchredirect(scenarios[id])
})

function switchredirect(intent_id) {
    return `/switchredirect aiassist2 intent_id="${intent_id}"`
}

const availableFunctions = {
    transfer_to_operator,
    transfer_to_scenario
}


TOOLS = [
    {
        "type": ITEM_TYPES.function,
        "function": {
            "name": "transfer_to_operator",
            "description": "Переводит диалог на оператора. Вызывай, если не нашел ответа, не можешь самостоятельно решить проблему пользователя или если пользователь явно попросил тебя соединить его с оператором.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    }
]

class ScenarioNotReadyError extends Error {
    constructor(scenarioName) {
        super(`Unexpected run of the tools agent during waiting for ${scenarioName}`);
        this.name = "ScenarioNotReadyError"
    }
}

class SwitchRedirectPropagate extends Error {
    constructor(switchredirect) {
        super("switchredirect call");
        this.name = "SwitchRedirectPropagate"
        this.switchredirect = switchredirect
    }
}

class RedisQueue {
    constructor(redisClient, deleteSlotFn, debugLogFn, commitFcResults) {
        this.redis = redisClient
        this.deleteSlot = deleteSlotFn
        this.debugReply = debugLogFn
        this.commitFcResults = commitFcResults
    }

    // Добавление задачи в очередь
    async addFunction(queue, name, args, toolCallId) {
        const newItem = {
            type: ITEM_TYPES.function,
            name: name,
            args: args,
            toolCallId: toolCallId,
            executed: false,
            started: false,
            scenario: null,
            result: null
        };
        queue.push(newItem)
    }

    // Добавление коммита
    async addCommit(queue, availableTools) {
        queue.push({
            type: ITEM_TYPES.commit,
            availableTools: availableTools,
        });
    }

    // Получение и обработка очереди
    async processQueue(replies) {  // -> {answer, tool_calls, log_id} | undefined
        const queue = await this.getQueue()

        for (let i = 0; i < queue.length; i++) {
            const item = queue[i]

            // пропустим выполненные функции
            if (item.type === ITEM_TYPES.function && item.executed) {
                continue
            }
            // Обработка невыполненной функции
            if (item.type === ITEM_TYPES.function) {
                if (item.started) {
                    // запущенные сценарии
                    let scenarioResult
                    if (item.scenario !== null) {
                        // scenario that returns a result
                        scenarioResult = this.getScenarioAnswer(item.scenario)
                        if (scenarioResult === undefined) {
                            throw new ScenarioNotReadyError(item.scenario)
                        }
                        this.deleteSlot(item.scenario)
                    }
                    await this.markAsExecuted(queue, i, scenarioResult)
                } else {
                    // Запускаем функции
                    const func = availableFunctions[item.name]
                    this.debugReply(`Calling ${item.name}(${JSON.stringify(item.args)})`)
                    if (func.isScenario) {
                        await this.markAsStartedScenario(queue, i, func.scenarioName)
                        const res = await func(item.args, replies)

                        if (res?.[0] === "/") {  // /switchredirect as expected
                            throw new SwitchRedirectPropagate(res)
                        }
                        // else it is probably an error, so return it as result
                        await this.markAsExecuted(queue, i, res)
                    } else {
                        const res = await func(item.args)
                        await this.markAsExecuted(queue, i, res)
                    }
                }
                continue
            }

            // Обработка коммита
            if (item.type === ITEM_TYPES.commit) {
                // n_cycles ++
                const functionsToCommit = []
                let commitIndex = i

                // Сбор выполненных функций до коммита
                for (let j = 0; j < commitIndex; j++) {
                    if (queue[j].type === ITEM_TYPES.function && queue[j].executed) {
                        functionsToCommit.push({
                            "content": queue[j].result ?? "Done",
                            "tool_call_id": queue[j].toolCallId
                        })
                    } else {
                        logger.warn(`Unexpected item before commit: ${JSON.stringify(queue[j])}`);
                        this.debugReply(`Unexpected item before commit: ${JSON.stringify(queue[j])}`);
                    }
                }
                this.debugReply(`Comitting ${JSON.stringify(functionsToCommit, null, 2)}`)
                // Вызов коммит-функции
                const n_cycles = await this.incNCycles()  // равно тому, сколько раз уже вызывались тулзы
                this.debugReply(`Cycle ${n_cycles} / ${AGENT_PARAMETERS.MAX_CYCLES}`)
                const tool_choice = n_cycles >= AGENT_PARAMETERS.MAX_CYCLES ? "none" : "auto"
                const llm_res = await this.commitFcResults(
                    functionsToCommit,
                    // item.availableTools,
                    tool_choice
                )
                // Удаление обработанных элементов
                queue.splice(0, commitIndex + 1)
                await this.saveQueue(queue)
                return llm_res
            }
        }
    }

    // получить результат сценария из слота
    getScenarioAnswer(scenarioName) {
        // Сценарий запишет результат в слот, который мы захардкодили в
        // соответствующей функции
        if (scenarioName === null) {
            return null
        }
        return getSlotValue(scenarioName)
    }

    // Пометить функцию как запущенную
    async markAsStartedScenario(queue, i, scenarioName) {
        const item = queue[i]
        item.started = true
        item.scenario = scenarioName
        await this.saveQueue(queue)
    }

    // Пометить функцию как выполненную
    async markAsExecuted(queue, i, result) {
        const item = queue[i]
        item.executed = true
        item.result = result
        await this.saveQueue(queue)
        this.debugReply(`${item.name} finished with ${result}`)
    }

    async clearQueue() {
        for (const item of await this.getQueue()) {
            if (item.scenario !== null && item.scenario !== undefined) {
                this.deleteSlot(item.scenario)
            }
        }
        this.debugReply(JSON.stringify(
            await this.saveQueue([])
        ))
        this.debugReply(await this.getQueue())
        await this.resetNCycles()
    }

    async getQueue() {
        const data = await this.redis.get(KEYS.QUEUE_KEY)
        this.debugReply(data)
        return data ? JSON.parse(data) : []
    }

    async saveQueue(queue) {
        return await this.redis.set(KEYS.QUEUE_KEY, JSON.stringify(queue), WAIT_FOR_SCENARIO_TTL)
    }

    async incNCycles() {
        let n_cycles = await this.redis.get(KEYS.N_CYCLES_KEY) ?? 0;
        n_cycles++;
        await this.redis.set(KEYS.N_CYCLES_KEY, n_cycles, WAIT_FOR_SCENARIO_TTL);
        return n_cycles;
    }

    async resetNCycles() {
        await this.redis.set(KEYS.N_CYCLES_KEY, 0, WAIT_FOR_SCENARIO_TTL);
    }
}

function updateAccumulatedSlot(slotId, newText, slotsStore) {
    if (slotsStore[slotId] === undefined) {
        const oldValue = getSlotValue(slotId)
        if (oldValue) {
            slotsStore[slotId] = oldValue
        }
    }
    const current = slotsStore[slotId] ?? ""
    slotsStore[slotId] = current ? `${current};${newText}` : newText
    return slotsStore
}

function _sendReply(text, slots) {
    if (_sendReply.slots === undefined) {
        _sendReply.slots = {}
    }
    const reply = agentApi.makeMarkdownReply(text)
    updateAccumulatedSlot(AGENT_SLOTS.LLM_ANSWER_HISTORY, text, _sendReply.slots)
    Object.assign(_sendReply.slots, slots ?? {})
    return agentApi.sendMessage({
        MessageMarkdown: reply.message.text,
        SendMessageParams: {
            ProjectId: reply.customer_id,
            OmniUserId: reply.omni_user_id,
            Sender: {},
            FilledSlots: _sendReply.slots,
            DestinationChannel: {
                ChannelId: reply.channel_id,
                ChannelUserId: message.user.channel_user_id
            },
        }
    }, logger)
        .then(result => {
            if (!result.Ok) {
                const errMsg = `${JSON.stringify(result.Errors)} during sending ${JSON.stringify(reply)}`
                logger.error(errMsg);
                if (AGENT_PARAMETERS.DEBUG) {
                    agentApi.sendMessage({
                        MessageMarkdown: errMsg,
                        SendMessageParams: {
                            ProjectId: reply.customer_id,
                            OmniUserId: reply.omni_user_id,
                            Sender: {},
                            FilledSlots: _sendReply.slots
                        }
                    }, logger)
                }
            }
        })
        .catch(e => logger.info(`Error sending reply: ${e}.`))
    // don't block, return Promise
}


function wrapInMarkdownCodeBlock(str) {
    // Экранируем только неэкранированные тройные кавычки
    const escapedStr = str.replace(/(?<!\\)```/g, '\\```');
    // Оборачиваем в markdown code block
    return `\`\`\`
${escapedStr}
\`\`\``;
}

function escapeHTML(text) {
    return text.replace(/[<>&"']/g, (match) => `&#${match.charCodeAt(0)};`);
}

function extractThinkContent(input, escapeHtml) {
    const openTag = '<think>';
    const closeTag = '</think>';

    const startIdx = input.indexOf(openTag);
    const endIdx = input.indexOf(closeTag);

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        return {
            cleanedText: input,
            thought: ''
        };
    }

    const thoughtContent = input.substring(startIdx + openTag.length, endIdx);
    const cleanedText = input.substring(0, startIdx) +
        input.substring(endIdx + closeTag.length);
    return {
        cleanedText: escapeHtml ? escapeHTML(cleanedText) : cleanedText,
        thought: thoughtContent ? '*Мои размышления:* \n\n' + escapeHTML(thoughtContent) : thoughtContent
    };
}

function extractJSON(response) {
    try {
        const jsonRegex = /```(?:json)?\s*([\s\S]*?)```/g;
        let match;
        while ((match = jsonRegex.exec(response)) !== null) {
            const jsonStr = match[1].trim();
            if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
                return JSON.parse(jsonStr);
            }
        }
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            let braceCount = 0;
            for (let i = jsonStart; i < response.length; i++) {
                if (response[i] === '{') braceCount++;
                if (response[i] === '}') braceCount--;
                if (braceCount === 0) {
                    return JSON.parse(response.substring(jsonStart, i + 1));
                }
            }
        }
    } catch (error) {
        return response
    }
    return response
}

function addUrlToContextTitle(fullContext) {
    fullContext.symbol_code.forEach((intent_id, idx) => {
        const url = `${API.base_url}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`;
        const title = fullContext.context[idx].title;
        fullContext.context[idx].title = `[${title}](${url})`;
    })
}

async function main() {
    let replies = []
    let response

    function textReply(text, wrapCodeBlock = false) {
        let reply;
        if (wrapCodeBlock) {
            reply = wrapInMarkdownCodeBlock(String(text));
        } else {
            reply = String(text);
        }
        return _sendReply(reply);
    }

    function markdownReply(text) {
        return _sendReply(String(text));
    }

    function debugReply(text) {
        // never await debugReply
        if (AGENT_PARAMETERS.DEBUG) {
            return _sendReply(wrapInMarkdownCodeBlock(String(text)));
        }
    }

    function deleteSlot(slot) {
        if (_sendReply.slots === undefined) {
            _sendReply.slots = {};
        }
        _sendReply.slots[slot] = null;
    }

    replies.textReply = textReply
    replies.markdownReply = markdownReply
    replies.debugReply = debugReply
    replies.deleteSlot = deleteSlot

    try {
        response = await _main(replies);
    } catch (e) {
        logger.info(`main error ${e}`)
        if (e instanceof SwitchRedirectPropagate) {
            if (message?.meta?.isTest) {
                return e.switchredirect
            }
            await replies.markdownReply(e.switchredirect);
            return replies;
        }
        if (e.code === 'ECONNABORTED') {
            await replies.textReply(STANDARD_MESSAGES.TIMEOUT_ERROR_MSG);
        } else {
            await replies.textReply(STANDARD_MESSAGES.DEFAULT_ERROR_MSG);
        }
        if (AGENT_PARAMETERS.DEBUG) {
            replies.debugReply(`ERROR: ${e}`);
            replies.debugReply(e.stack);
        }
    }
    return response;
}

async function _main(replies) {
    // Main code
    let question = message.message.text;
    replies.debugReply(JSON.stringify(message.slot_context, null, 2));
    replies.debugReply(JSON.stringify(message.message, null, 2));

    // Get dialog_id
    let dialog_id = null;
    if (AGENT_PARAMETERS.USE_HISTORY) {
        const dialog_response = await agentApi.getDialogId(
            message.user.omni_user_id,
            message.user.customer_id
        );
        dialog_id = dialog_response.Response;
    }

    // create a commit function with a single argument
    const commitFcResults = async function (
        fcResults, tool_choice
    ) {
        return await commitToolResponses(
            fcResults, dialog_id, replies, tool_choice
        );
    }

    // get task queue from redis storage
    const redisClient = new RedisQueue(
        agentStorage.dialogStorage,
        replies.deleteSlot,
        replies.debugReply,
        commitFcResults
    );

    // check whether we want to erase the queue
    if (question.toLowerCase() === "прервать" || message.message.action === "cancel") {
        replies.debugReply("Cancelling all tool calls")
        await Promise.all([
            redisClient.clearQueue(),
            replies.markdownReply(STANDARD_MESSAGES.MESSAGE_CANCEL_WAITING)
        ])
        return
    }

    let response
    let finalAnswer
    let responsePrinted = false
    try {
        response = await redisClient.processQueue(replies)
    } catch (error) {
        if (error instanceof ScenarioNotReadyError) {
            if (question) {
                await replies.markdownReply(MESSAGE_WHILE_WAITING_ERROR)
                replies.debugReply(error.message)
                return
            }
        }
        throw error
    }

    // Если не было обработки тулзов, то отправляем сообщение пользователя на ллмку
    if (response === undefined) {
        response = await sendMessageToLLM(question, dialog_id, replies)
        responsePrinted = true
        finalAnswer = response.answer
    } else if (question) {
        logger.warn(`Both tools handling and user's question (${question}) have gotten. The user's question will be ignored.`);
        replies.debugReply(`Both tools handling and user's question (${question}) have gotten. The user's question will be ignored.`);
    }

    while (response !== undefined) {
        let functionAdded = false
        const taskQueue = await redisClient.getQueue()
        if (response.answer && !responsePrinted) {
            await _printResponse(response, replies)
        }
        if (response?.tool_calls) {
            for (const call of response.tool_calls) {
                if (!call.function || !call.function.name) {
                    continue
                }
                const funcName = call.function.name
                const funcArgs = JSON.parse(call.function.arguments)
                const toolCallId = call.id

                if (availableFunctions[funcName]) {
                    replies.debugReply(`Enqueuing tool ${funcName}(${JSON.stringify(funcArgs, null, 2)})`)
                    await redisClient.addFunction(taskQueue, funcName, funcArgs, toolCallId)
                    functionAdded = true
                } else {
                    throw new Error(`Функция ${funcName} не найдена`)
                }
            }
        }

        if (functionAdded) {
            await redisClient.addCommit(taskQueue)
            await redisClient.saveQueue(taskQueue)
        } else {
            // got final answer => n_cycles = 0
            await redisClient.resetNCycles()
        }
        response = await redisClient.processQueue(replies)
        responsePrinted = false
    }
    logger.info("Finish")
    logger.info(finalAnswer)
    replies.debugReply("Finish")
    if (message?.meta?.isTest) {
        const {cleanedText} = extractThinkContent(finalAnswer)
        finalAnswer = cleanedText
    }

    return finalAnswer
}

//Нужно дописать запрос для получения регистрации,
//Пока оставляем, что всегда авторизован
function getClientVerified() {
    return true
}

//Получение токена CRM
async function getTokenCRM() {
    const config = {
        headers: {
            'content-type': 'application/json',
        }
    }
    const data = {
        "login": API.login,
        "password": API.password,
    }
    try {
        const response = await axios.post(API.url_crm_token, data, config)
        return response.data.accessToken
    } catch (e) {
        logger.error(`Error getTokenCRM: ${JSON.stringify(e)}.`)
        throw e
    }

}

async function getClientByPhone(token, phone) {
    const config = { headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token } }
    try {
        const response = await axios.get(`${API.base_url_crm}/api/client/client-full/by-phone/${phone}`, config)
        logger.info({ client: response.data }, "getClientByPhone")
        return response.data
    } catch (e) {
        logger.error({ e, responseData: e.response?.data }, `Error getClientByPhone`)
        return null
    }
}

function formatDateToRussian(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
    if (match) {
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        return `${day}.${month}.${match[3]}`;
    }
    return dateStr;
}

function formatDataBlockWorkOutside(slots) {
    const order = ["type_of_premises_or_service", "purpose_of_premises_or_service", "client_name_display", "client_status", "phone_number", "quarter", "building_number", "corpus", "entrance", "apartment_number", "problem_section", "problem_floor", "problem_place", "problem_object", "problem_category", "priority", "problem_description"];
    const required = ["building_number", "apartment_number", "problem_section", "problem_floor", "problem_place", "problem_object", "type_of_premises_or_service", "purpose_of_premises_or_service", "priority", "problem_description"];
    const labels = {
        type_of_premises_or_service: "Тип помещения/услуги",
        purpose_of_premises_or_service: "Цель помещения/услуги",
        client_name_display: "ФИО",
        client_status: "Статус",
        phone_number: "Номер телефона",
        quarter: "Квартал",
        building_number: "Дом",
        corpus: "Корпус",
        entrance: "Подъезд",
        apartment_number: "Квартира",
        problem_section: "Секция/подъезд проблемы",
        problem_floor: "Этаж проблемы",
        problem_place: "Место проблемы",
        problem_object: "Объект проблемы",
        problem_category: "Категория проблемы",
        priority: "Приоритет",
        problem_description: "Описание проблемы"
    };
    const lines = [];
    for (const key of order) {
        if (!(key in slots)) continue;
        const label = labels[key] || key;
        let value = slots[key];
        if (value === null || value === undefined || value === '') {
            value = '—';
        } else {
            if (typeof value === 'boolean') {
                value = value ? 'Да' : 'Нет';
            }
        }
        if (required.includes(key) && value !== '—') {
            lines.push(`**${label}**: ${value}`);
        } else {
            lines.push(`${label}: ${value}`);
        }
    }
    return '=== ДАННЫЕ ДЛЯ ВЫПОЛНЕНИЯ ===\n' + lines.join('\n');
}

function formatDialogBlock(dialogOrHistory) {
    if (!dialogOrHistory || !Array.isArray(dialogOrHistory) || dialogOrHistory.length === 0) {
        return '=== ДИАЛОГ С ЖИТЕЛЕМ ===\nДиалог отсутствует';
    }
    const lines = [];
    for (const msg of dialogOrHistory) {
        if (!msg.message || msg.message.trim() === '') continue;
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        const role = msg.role === 'user' ? 'Житель' : 'Виртуальный помощник';
        lines.push(`${timeStr} ${role}:\n${msg.message}`);
    }
    if (lines.length === 0) {
        return '=== ДИАЛОГ С ЖИТЕЛЕМ ===\nДиалог отсутствует';
    }
    return '=== ДИАЛОГ С ЖИТЕЛЕМ ===\n' + lines.join('\n\n');
}

function formatFullDescription(slots, dialogOrHistory) {
    return formatDataBlockWorkOutside(slots) + '\n\n' + formatDialogBlock(dialogOrHistory);
}

//Отправка заявки в CRM
async function sendApplication(slots, dialogOrHistory, replies) {
    let result = formatFullDescription(slots, dialogOrHistory);
    logger.warn({result})
    //return `Спасибо, что обратились ко мне. \n✅Заявка **оформлена**. \n 📱 Статус заявки присылаем через пуш-уведомления мобильного приложения.`

    const token = await getTokenCRM()
    const config = {
        headers: {
            'content-type': 'application/json',
            'authorization': 'Bearer ' + token
        }
    }
    const rawPhone = getSlotValue('sys_phone') || slots?.phone_number
    const phone = rawPhone ? rawPhone.replace(/[^\d]/g, '').replace(/^8(\d{10})$/, '+7$1').replace(/^7(\d{10})$/, '+7$1').replace(/^(\d{10})$/, '+7$1') : null
    let clientData = null
    if (phone) {
        clientData = await getClientByPhone(token, phone)
    }
    const data = {id: uuid.v4(), description: result, ...(clientData && {clientId: clientData})}
    try {
        const response = await axios.post(API.url_crm_create, data, config)
        logger.info({responseCrm: response.data}, "sendApplication")
        replies.debugReply(response.data)
        await agentStorage.omniUserStorage.set("APPLICATION_SEND", true)
        return `Спасибо, что обратились ко мне. \n✅Заявка №${response.data.number} **оформлена**. \n 📱 Статус заявки присылаем через пуш-уведомления мобильного приложения.`
    } catch (e) {
        logger.error({e}, `Error sendApplication`)
        return STANDARD_MESSAGES.DEFAULT_ERROR_MSG
    }
}

async function _printResponse(response, replies, dialogOrHistory, dialogId) {
    if (message?.meta?.isTest) return
    const {thought, cleanedText} = extractThinkContent(response.answer, false)

    if (!cleanedText) return

    const extracted = extractJSON(cleanedText)
    const responseData = (typeof extracted === 'object' && extracted !== null && extracted.action_required) ? extracted : null

    if (!responseData) {
        logger.info({step: 'plain_text_response', text_preview: cleanedText?.substring(0, 200)})
        if (AGENT_PARAMETERS.SHOW_THINKING && thought) await replies.textReply(thought); else replies.debugReply(thought)
        if (cleanedText) await replies.markdownReply(cleanedText)
        return
    }

    if (AGENT_PARAMETERS.SHOW_THINKING && thought) await replies.textReply(thought); else replies.debugReply(thought)

    if (responseData.action_required.tool === "transfer_to_operator") {
        _sendReply(`/switchredirect aiassist2 intent_id="${ARTICLES.TRANSFER_FOR_OPERATOR.ID}"`)
        return
    }
    if (responseData.action_required.tool === "transfer_to_scenario") {
        const numberApplication = await sendApplication(responseData.slots, dialogOrHistory, replies)
        _sendReply(numberApplication, {response_crm: JSON.stringify(responseData.slots)})
        await agentApi.finishDialog(dialogId)
        return
    }

    if (responseData.notes !== null && responseData.notes !== undefined) {
        const cleanedSlots = Object.fromEntries(Object.entries(responseData.slots || {}).filter(([key, value]) => value !== null).map(([key, value]) => [key, String(value)]))
        _sendReply(responseData.notes, cleanedSlots)
    } else {
        await replies.markdownReply(cleanedText)
    }
}

async function getBotMediatorDialogHistoryResponse(dialogId) {
    try {
        const config = {
            headers: {
                'Content-Type': 'application/json'
            },
            httpsAgent: AGENT
        }
        const response = await axios.get(`${API.url_mediator_service}?dialog_id=${dialogId}`, config)
        return response.data
    } catch (error) {
        logger.error("Ошибка при вызове API opbot-botmediator: " + error.message)
    }
}

function createMessageItem(message, role) {
    return {
        message: message,
        role: role
    }
}

async function getDialog(dialog_id) {
    try {
        let clientDialogHistory = await getBotMediatorDialogHistoryResponse(dialog_id)
        if (clientDialogHistory) {
            return clientDialogHistory.reduce((acc, message) => {
                const isUserMessage = !!message.msg
                const source = isUserMessage ? message.msg : message.reply
                const type = source?.message_type
                const text = source?.message?.text
                if (type === 1 || type === 19) {
                    if (isUserMessage) {
                        acc.push(createMessageItem(text, ROLE.USER))
                    } else {
                        const role = message.reply?.operator?.operator_id === "__SYSTEM__" ? ROLE.BOT : ROLE.OPERATOR
                        acc.push(createMessageItem(text, role))
                    }
                }

                return acc
            }, [])
        } else {
            return dialog_id
        }
    } catch (e) {
        logger.error(`Error getDialog: ${JSON.stringify(e)}.`)
    }
}

function getSlots(slots) {
    if (!slots || !Array.isArray(slots)) return []

    const filledSlots = message.slot_context.filled_slots

    return slots.map(slot => {
        const filledSlot = filledSlots.find(filled => filled.slot_id === slot.id)
        let slotValue = null

        if (filledSlot?.value) {
            const values = filledSlot.value.split(';')
            slotValue = values.length > 0 ? values[values.length - 1] : null
        }

        return {
            slotId: slot.id,
            slotDescription: slot.description,
            slotValue: slotValue
        }
    })
}


async function sendMessageToLLM(question, dialog_id, replies) {
    let contextsearch_texts = question
    let dialogOrHistory

    if (message?.meta?.isTest) {
        dialogOrHistory = message.meta?.history
    } else {
        dialogOrHistory = await getDialog(dialog_id)
    }
    const userSlots = getSlots(USER_SLOTS)
    const slotsBlock = {}
    userSlots.length > 0 ?
        userSlots.forEach(s => {
            if (s.slotId === 'client_verified') {
                slotsBlock[s.slotId] = getClientVerified()
            } else {
                slotsBlock[s.slotId] = s.slotValue
            }
        })
        : '- Нет заполненных слотов'
    SYSTEM_WITH_SLOTS = LLM_SYSTEM_TEMPLATE.replace(
        '## Слоты:',
        `## Заполненные слоты:
        ${JSON.stringify(slotsBlock)}`
    )
    // Generate rephrases of user question
    if (AGENT_PARAMETERS.DO_REPHRASE) {
        // rephrases1 = await rephrase(question, REPHRASE_PROMPT_1, dialog_id, replies)
        rephrases2 = await rephrase(question, REPHRASE_PROMPT, dialog_id, replies)
        contextsearch_texts = [question]
        // contextsearch_texts = contextsearch_texts.concat(rephrases1)
        contextsearch_texts = contextsearch_texts.concat(rephrases2)
    }

    // Search for relevant context
    let fullContext = await getContext(contextsearch_texts, replies)
    addUrlToContextTitle(fullContext)
    let context = fullContext.context

    let response
    // Context not found
    if (context?.length === 0) {
        logger.info(`Context not found for question "${question}"`);
        replies.debugReply(`Context not found for question "${question}"`);

        if (AGENT_PARAMETERS.SMALLTALK_IF_NO_CONTEXT) {
            response = await smalltalk(question + "/n## Слоты:/n" + JSON.stringify(slotsBlock), dialogOrHistory, replies)
            await _printResponse(response, replies, dialogOrHistory, dialog_id)
            return response
        } else {
            replies.markdownReply(STANDARD_MESSAGES.NO_CONTEXT_TEXT)
            return {answer: "", tool_calls: [], log_id: null}
        }
    }

    // Answer with context (RAG)
    response = await rag(question, context, dialogOrHistory, replies)
    // References to articles
    let references = ''
    if (AGENT_PARAMETERS.SHOW_REFERENCES) {
        references = getReferences(fullContext)
    }

    // Final answers
    await _printResponse(response, replies)

    if (AGENT_PARAMETERS.SHOW_REFERENCES) {
        replies.markdownReply(references)
    }

    if (AGENT_PARAMETERS.SHOW_CONTEXT) {
        replies.textReply(
            "<h3>Контекст</h3>" + JSON.stringify(fullContext, null, 2),
            true
        )
    }
    return response
}

function _debugAxiosError(error, replies) {
    if (error.response) {
        replies.debugReply(JSON.stringify(error.response.data, null, 2))
        replies.debugReply(error.response.status)
        replies.debugReply(error.response.headers)
    } else if (error.request) {
        replies.debugReply(error.request)
    } else {
        replies.debugReply('Error', error.message)
    }
}

async function getContext(question, replies) {
    replies.debugReply(JSON.stringify(question))
    let response
    try {
        response = await axios.post(
            URL_CONTEXT_SEARCH,
            {
                text: question,
                customer_id: CUSTOMER_ID,
                record_type: AGENT_PARAMETERS.RECORD_TYPE,
                output_format: "json-vikhr"
            }
        )
        logger.info("Response:")
        logger.info(response.data)
    } catch (e) {
        // Логика при ошибке запроса
        logger.info(`Error requesting context search: ${e}.`)
        replies.debugReply(`Error requesting context search: ${e}.`)
        _debugAxiosError(e, replies)
        throw e
    }
    const fullContext = response.data
    if (CONTEXT_SETTINGS.MAX_CONTEXTS > -1) {
        Object.keys(fullContext).forEach(key => {
            fullContext[key] = fullContext[key].slice(0, CONTEXT_SETTINGS.MAX_CONTEXTS)
        })
    }
    return fullContext
}


function _putDialogIdOrHistory(requestData, dialogOrHistory) {
    if (typeof dialogOrHistory === "string") {
        requestData["dialog_id"] = dialogOrHistory
    } else {
        requestData["history"] = dialogOrHistory
    }
    return requestData
}


async function _callLLM(url, data, dialogOrHistory, replies, extraErrorHandling = null) {
    const processedData = _putDialogIdOrHistory(data, dialogOrHistory)
    try {
        const response = await axios.post(url, processedData, {
            timeout: LLM_SETTINGS.timeout * 1000,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API.llm_auth_token}`,
                'Connection': 'keep-alive',
            },
            httpsAgent: AGENT,
            // proxy: {
            //     protocol: 'http',
            //     host: PROXY.url,
            //     port: PROXY.port
            // }
        })

        return response.data
    } catch (e) {
        const errorMsg = `Error requesting LLM (POST ${url}): ${e}.`
        logger.info(errorMsg)
        replies.debugReply(errorMsg)
        _debugAxiosError(e, replies)
        if (extraErrorHandling) {
            extraErrorHandling(e)
        }
        throw e
    }
}

async function smalltalk(question, dialogOrHistory, replies) {
    const thinkingPrompt = AGENT_PARAMETERS.ENABLE_THINKING_SMALLTALK ? AGENT_PARAMETERS.THINK : AGENT_PARAMETERS.NO_THINK
    const requestData = {
        question: question + thinkingPrompt,
        temperature: LLM_SETTINGS.temperature_smalltalk,
        top_p: LLM_SETTINGS.top_p,
        top_k: LLM_SETTINGS.top_k,
        min_p: LLM_SETTINGS.min_p,
        instruction: SYSTEM_WITH_SLOTS,
        //tools: TOOLS,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }

    return await _callLLM(
        URL_LLM_SMALLTALK,
        requestData,
        dialogOrHistory,
        replies
    )
}

async function rag(question, context, dialogOrHistory, replies) {
    const requestData = {
        question: question,
        context: context,
        temperature: LLM_SETTINGS.temperature,
        top_p: LLM_SETTINGS.top_p,
        top_k: LLM_SETTINGS.top_k,
        min_p: LLM_SETTINGS.min_p,
        system_template: SYSTEM_WITH_SLOTS,
        user_template: RAG_TEMPLATE,
        document_template: RAG_DOCUMENT_TEMPLATE,
        join_sep: RAG_JOIN_SEP,
        tools: TOOLS,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }

    return await _callLLM(
        URL_LLM,
        requestData,
        dialogOrHistory,
        replies,
        (e) => {
            replies.debugReply(
                "<h3>Контекст</h3>" + JSON.stringify(context, null, 2)
            )
        }
    )
}

async function rephrase(question, prompt, dialogOrHistory, replies) {
    const requestData = {
        question: question,
        prompt: prompt,
        n_generations: AGENT_PARAMETERS.REPHRASE_N_GENERATIONS,
        samples_per_generation: AGENT_PARAMETERS.REPHRASE_SAMPLES_PER_GENERATION,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }

    const response = await _callLLM(
        URL_LLM_REPHRASE,
        requestData,
        dialogOrHistory,
        replies
    )
    return response.texts
}

async function commitToolResponses(
    tool_responses, dialogOrHistory, replies, tool_choice
) {
    const requestData = {
        tool_responses: tool_responses,
        temperature: LLM_SETTINGS.temperature,
        top_p: LLM_SETTINGS.top_p,
        top_k: LLM_SETTINGS.top_k,
        min_p: LLM_SETTINGS.min_p,
        tools: TOOLS,
        tool_choice: tool_choice,
        last_context_price: CONTEXT_SETTINGS.LAST_CONTEXT_PRICE,
        other_context_price: CONTEXT_SETTINGS.OTHER_CONTEXT_PRICE,
        add_other_context: CONTEXT_SETTINGS.ADD_OTHER_CONTEXT
    }

    return await _callLLM(
        URL_LLM_COMMIT_TOOL_RESPONSES,
        requestData,
        dialogOrHistory,
        replies
    )  // answer, tool_calls, log_id
}

function getReferences(full_context) {
    let references = ""
    const articles_counts = new Map()
    const articles_titles = new Map()
    // Count unique articles
    full_context.symbol_code.forEach((intent_id, idx) => {
        const prev_count = articles_counts.get(intent_id) || 0
        articles_counts.set(intent_id, prev_count + 1)
        articles_titles.set(intent_id, full_context.title[idx])
    })

    // Sort by counts (desc)
    const sorted_counts = Array.from(articles_counts.entries())
        .sort((a, b) => b[1] - a[1])

    // Add refs to the message
    sorted_counts.forEach(([intent_id, cnt]) => {
        let url = `${API.base_url}/app/project/${CUSTOMER_ID}/knowledge-base/article/view/${intent_id}`
//        references += `\n\n[${cnt}.
        references += `\n\n*  [${articles_titles.get(intent_id)}](${url})`
    })

    if (references !== "")
        references = "### Ссылки для информации:" + references
    return references
}

// Entrypoint
if (message.message_type === 1) {
    main()
        .then(res => {
            res ? resolve(res) : resolve([])
        })
        .catch(error => {
            logger.error(`Error: ${error}`)
            resolve([agentApi.makeMarkdownReply(error)])
        })
} else {
    logger.info(`Message type: ${message.message_type}. Skip.`)
    resolve([]) // SKIP
}
