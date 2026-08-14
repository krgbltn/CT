# Официальная документация API Craft-Talk (текст из «Работа с базой знаний.docx»)

> Извлечено из D:\сигурд\21 век\Работа с базой знаний.docx. Скриншоты (примеры тел вложенных статей и скриншоты UI) в этом файле отсутствуют — их модель прочитать не может; при необходимости смотреть в оригинале.

Работа с базой знаний

Типы данных

IntentMarkup

Поиск статей

POST /api/external/article/search

Тело запроса: SearchArticleExtRequest

Ответ:

В случае успеха: HTTP 200 OK, тело ответа — SearchArticleExtResponse,

В случае неудачи: HTTP 403 Bad Request, тело ответа — пусто,

В случае ошибки сервера: HTTP 500, тело ответа — пусто.

Пример запроса:

curl --request POST \  --url http://release.craft-talk.com/api/external/article/search \  --header 'Authorization: Bearer <token>' \  --header 'Content-Type: application/json' \  --data '{    "ProjectId": "test",    "Text": "Title",    "EnableRemoved": true}'

Пример ответа:

{    "Articles": [        {            "ProjectId": "test",            "ExtId": "ExtId",            "ExtSourceId": "ExtSourceId",            "Id": "abc2f6a8-cd6a-4dc4-8233-4f2802aec19f",            "SymbolCode": "article-3264e9c4-737f-4278-bb1f-a7cac0e9f519",            "Title": "Title",            "ModifiedDate": 1639635721794        },        {            "ProjectId": "test",            "ExtId": "ExtId2",            "ExtSourceId": "ExtSourceId2",            "Id": "0105e45d-d7b3-49ad-b9e9-b52c9dbcad72",            "SymbolCode": "article-cd92e09b-51d9-4a5f-95fb-c78d269a85f1",            "Title": "Title",            "ModifiedDate": 1640084594221        }    ]}

Создание и изменение статьи

Обновление существующей или, в случае отсутствия, создание новой статьи

POST /api/external/article/update

Тело запроса: UpdateArticleExtRequest

Ответ:

В случае успеха: HTTP 200 OK, тело ответа — UpdateArticleExtResponse,

В случае неудачи: HTTP 403 Bad Request, тело ответа — пусто или сообщение о том, что идентификаторы статьи не были указаны,

HTTP 400 — Ошибка структуры запроса,

В случае ошибки сервера: HTTP 500, тело ответа — пусто.

Пример запроса:

curl --request POST \  --url http://release.craft-talk.com/api/external/article/update \  --header 'Authorization: Bearer <token>' \  --header 'Content-Type: application/json' \  --data '{    "ExtId": "ExtId",    "ExtSourceId": "ExtSourceId",    "ParentItemId": "classifier-94cc06da-388a-4218-919b-7cf7b25801c9",    "ParentCategoryCode": "root",    "GrandParentCategoryCode": "dd",    "ParentHasChildren": true,    "Permissions": [        {            "Action": "Edit",            "ProjectId": "test",            "Type": "All",            "Value": "All"        }    ],    "NextItem": null,    "ProjectId": "test",    "CatalogCode": "test",    "Title": "Title",    "Answers": [],    "Type": "",    "Tags": [],    "Parameters": [],    "Questions": []}'

Пример ответа:

{    "Article": {        "ProjectId": "test",        "ExtId": "ExtId",        "ExtSourceId": "ExtSourceId",        "Id": "c847dcbe-94d1-4797-b6cc-020f086d88b7",        "SymbolCode": "article-cd92e09b-51d9-4a5f-95fb-c78d269a85f1",        "Title": "Title",        "Status": "Draft",        "Version": 637756809959419854,        "Expire": 0,        "PrevVersion": 637756809937491873,        "FirstVersion": 637756809937491873,        "ModifiedDate": 1640084195855,        "ModifiedUserLogin": "test",        "Kind": "Common",        "Tags": [],        "Parameters": [],        "Permissions": [            {                "Type": "All",                "Action": "Edit",                "Value": "All",                "ProjectId": "test"            }        ]    },    "Categories": [        {            "ProjectId": "test",            "Id": "test:root:article-cd92e09b-51d9-4a5f-95fb-c78d269a85f1",            "SymbolCode": "article-cd92e09b-51d9-4a5f-95fb-c78d269a85f1",            "Title": "Title",            "CatalogCode": "test",            "ParentCategoryCode": "root",            "Permissions": [                {                    "Type": "All",                    "Action": "Edit",                    "Value": "All",                    "ProjectId": "test"                }            ],            "Status": "Draft",            "HasChildren": false        }    ]}

Значения:

ExtId— Произвольное значение, из внешней системы (при указании в данном запросе уже существующего в БЗ значения параметра ExtId, обновляется эта существующая статья (производится смена имени статьи и т.д. - действие зависит от отправляемых в запросе изменений), а новая статья создается только в случае, если в БЗ нет статей с указанным значением параметра ExtId);  ExtSourceID— Произвольное значение, из внешней системы;  ParentItemID — Символьный код каталога (получить можно следующим образом: devtools-network-reload-запрос catalogs);

ProjectId — идентификатор проекта (можно найти в ссылке проекта. Например, для ссылки https://cloud.craft-talk.com/app/project/docs/ идентификатор проекта равен docs, т.е. значение, идущее в ссылке после секции project между последующими символами /);

CatalogCode — символьный код каталога (получить можно следующим образом: devtools-network-reload-запрос catalogs);

Title — Название будущей статьи;

(Остальные поля можно оставить без изменения)

Questions — Примеры вопросов;

Answers — Варианты ответов.

Важно! Символьный код каталога в данном случае (CatalogCode и ParentItemID) — это идентификатор базы, в которую статья будет писаться (они совпадают, когда нет вложенности). Альтернативно, этот код можно получить через меню База знаний / Тематики (открыть на редактирование тематику, она же каталог базы знаний (отдельная база, заголовок которой в «Wiki и сценарии» пишется серым цветом))

Создание вложенных статей

Чтобы создать вложенную статью «Новая статья 1345» в статье «Без названия»

необходимо:

через devtools-network-reload-запрос catalogs найти идентификатор каталога, в котором находится статья или в База знаний / Тематики (открыть на редактирование тематику (в нашем случае это «ШАБЛОНЫ»);

В поле CatalogCode заполняем значение SymbolCode для каталога (или из поля «Символьный код» в База знаний/Тематики);

Затем находим идентификатор для статьи, в которую хотим вложить новую (в нашем случае поле Title пустое из-за того, что название стоит дефолтное).В поле ParentItemId заполняем значение id для статьи, в которую хотим вложить новую статью;

Прописываем в поле Title название статьи — Новая статья 1345;

Прописываем в поле ProjectId идентификатор проекта.Пример получившегося тела запроса:

Результат:

Для создания статьей вложенности «2+» (две и более), идентификатор родительской статьи, в которую создается новая вложенность больше 2 (двух), можно найти аналогично:devtools-network-reload-запрос categories

В поле ParentItemId запроса заполняем значение идентификатора для статьи, в которую хотим вложить новую статью.Пример тела запроса:

Результат:

Публикация статьи

POST /api/external/article/publish

Тело запроса: PublishArticleExtRequest

Ответ:

В случае успеха: HTTP 200 OK, тело ответа — PublishArticleExtResponse,

В случае неудачи: HTTP 403 Bad Request, тело ответа — пусто или сообщение о том, что идентификаторы статьи не были указаны,

В случае ошибки сервера: HTTP 500, тело ответа — пусто.

Пример запроса:

curl --request POST \  --url http://release.craft-talk.com/api/external/article/publish \  --header 'Authorization: Bearer <token>' \  --header 'Content-Type: application/json' \  --data '{    "ExtId": "ExtId",    "ExtSourceId": "ExtSourceId",    "ProjectId": "test"}'

Пример ответа:

{    "Article": {        "ProjectId": "test",        "ExtId": "ExtId",        "ExtSourceId": "ExtSourceId",        "Id": "cf91c1cc-0233-48c5-b57a-b5cf3b6ed826",        "SymbolCode": "article-cd92e09b-51d9-4a5f-95fb-c78d269a85f1",        "Title": "Title",        "Status": "Active",        "Version": 637756812067970008,        "Expire": 0,        "PrevVersion": 637756809959419854,        "FirstVersion": 637756809937491873,        "ModifiedDate": 1640084406690,        "ModifiedUserLogin": "test",        "Kind": "Common",        "Tags": [],        "Parameters": [],        "Permissions": [            {                "Type": "All",                "Action": "Edit",                "Value": "All",                "ProjectId": "test"            }        ]    },    "ArticleUserViews": [        {            "Login": "test",            "Viewed": true,            "ReadConfirmed": false        }    ]}

Удаление статьи

POST /api/external/article/remove

Тело запроса: RemoveArticleExtRequest

Ответ:

В случае успеха: HTTP 200 OK, тело ответа — RemoveArticleExtResponse,

В случае неудачи: HTTP 403 Bad Request, тело ответа — пусто или сообщение о том, что идентификаторы статьи не были указаны,

В случае ошибки сервера: HTTP 500, тело ответа — пусто.

Пример запроса:

curl --request POST \  --url http://release.craft-talk.com/api/external/article/remove \  --header 'Authorization: Bearer <token>' \  --header 'Content-Type: application/json' \  --data '{    "ExtId": "ExtId",    "ExtSourceId": "ExtSourceId",    "ProjectId": "test"}'

Пример ответа:

{    "Article": {        "ProjectId": "test",        "ExtId": "ExtId",        "ExtSourceId": "ExtSourceId",        "Id": "0105e45d-d7b3-49ad-b9e9-b52c9dbcad72",        "SymbolCode": "article-cd92e09b-51d9-4a5f-95fb-c78d269a85f1",        "Title": "Title",        "Status": "Removed",        "Version": 637756813943059782,        "Expire": 0,        "PrevVersion": 637756813292922099,        "FirstVersion": 637756809937491873,        "ModifiedDate": 1640084594221,        "ModifiedUserLogin": "test",        "Kind": "Common",        "Tags": [],        "Parameters": [],        "Permissions": [            {                "Type": "All",                "Action": "Edit",                "Value": "All",                "ProjectId": "test"            }        ]    }}

Снятие статьи с публикации

POST /api/external/article/deactivate

Тело запроса: DeactivateArticleExtRequest

Ответ:

В случае успеха: HTTP 200 OK, тело ответа — DeactivateArticleExtResponse,

В случае неудачи: HTTP 403 Bad Request, тело ответа — пусто или сообщение о том, что идентификаторы статьи не были указаны,

В случае ошибки сервера: HTTP 500, тело ответа — пусто.

Пример запроса:

curl --request POST \  --url http://release.craft-talk.com/api/external/article/deactivate \  --header 'Authorization: Bearer <token>' \  --header 'Content-Type: application/json' \  --data '{    "ExtId": "ExtId",    "ExtSourceId": "ExtSourceId",    "ProjectId": "test"}'

Пример ответа:

{    "Article": {        "ProjectId": "test",        "ExtId": "ExtId",        "ExtSourceId": "ExtSourceId",        "Id": "66983e3b-e785-41bf-bee4-ad66f0049b03",        "SymbolCode": "article-cd92e09b-51d9-4a5f-95fb-c78d269a85f1",        "Title": "Title",        "Status": "Inactive",        "Version": 637756813292922099,        "Expire": 0,        "PrevVersion": 637756812067970008,        "FirstVersion": 637756809937491873,        "ModifiedDate": 1640084529204,        "ModifiedUserLogin": "test",        "Kind": "Common",        "Tags": [],        "Parameters": [],        "Permissions": [            {                "Type": "All",                "Action": "Edit",                "Value": "All",                "ProjectId": "test"            }        ]    }}

Добавление разметки в статью

POST /api/external/markup/add

Тело запроса: AddMarkupRequest

Ответ:

В случае успеха: HTTP 200 OK, тело ответа — AddMarkupResponse,

В случае неудачи: HTTP 403 Bad Request, тело ответа — пусто,

В случае ошибки сервера: HTTP 500, тело ответа — пусто.

Пример запроса:

curl --request POST \  --url http://release.craft-talk.com/api/external/markup/add \  --header 'Authorization: Bearer <token>' \  --header 'Content-Type: application/json' \  --data '{    "markups": [        {            "markupText": "markupText AAAAAA",            "intentSymbolCode": "article-3264e9c4-737f-4278-bb1f-a7cac0e9f519"        }    ]}'

Пример ответа:

{    "MarkupBatchId": "052cbc4e-5333-466a-b991-6da2ccf7fc99"}

Удаление разметки из статьи

POST /api/external/markup/delete-batch

Тело запроса: DeleteMarkupBatchRequest

Ответ:

В случае успеха: HTTP 200 OK, тело ответа — DeleteMarkupBatchResponse,

В случае неудачи: HTTP 403 Bad Request, тело ответа — пусто,

В случае ошибки сервера: HTTP 500, тело ответа — пусто.

Пример запроса:

curl --request POST \  --url http://release.craft-talk.com/api/external/markup/delete-batch \  --header 'Authorization: Bearer <token>' \  --header 'Content-Type: application/json' \  --data '{"markupBatchId": "052cbc4e-5333-466a-b991-6da2ccf7fc99"}'

Пример ответа:

{    "Success": true}