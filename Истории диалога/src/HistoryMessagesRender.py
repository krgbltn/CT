from datetime import datetime, timezone

from src.ElementRender.StartRender import StartRender
from src.ElementRender.MessageRender import MessageRender
from src.ElementRender.ConditionRender import ConditionRender
from src.ElementRender.ArticleRender import ArticleRender
from src.ElementRender.CommandRender import CommandRender
from src.ElementRender.FormRender import FormRender
from src.ElementRender.AgentRender import AgentRender

from src.API.CrafttalkAPI import CrafttalkAPI


# ──────────────────────────────────────────────────────────────────────────────
# Таблица типов сообщений Crafttalk (из JSON примера)
# ──────────────────────────────────────────────────────────────────────────────
MESSAGE_TYPE_NAMES = {
    1:   "Сообщение клиента (текст/кнопка)",
    2:   "Прочитано клиентом",
    4:   "Доставлено в канал",
    11:  "Сообщение обработано ботом",
    12:  "Назначено оператору",
    13:  "Оператор взял диалог",
    14:  "Оператор покинул диалог",
    16:  "Диалог завершён оператором",
    18:  "Диалог назначен (routing)",
    30:  "Системная команда бота",
    33:  "Инициализация диалога",
    201: "Комментарий оператора",
    202: "Оператор начал печатать",
    203: "Оператор остановил печать",
}


def _ts_to_str(ts_ms: int | None) -> str:
    """Миллисекунды → читаемая дата UTC."""
    if not ts_ms:
        return "—"
    dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")


def _duration_str(start_ms: int, end_ms: int) -> str:
    """Разница двух timestamp в читаемом виде."""
    diff_sec = (end_ms - start_ms) / 1000
    if diff_sec < 60:
        return f"{diff_sec:.0f} сек"
    elif diff_sec < 3600:
        return f"{diff_sec/60:.1f} мин"
    else:
        return f"{diff_sec/3600:.1f} ч"


# ──────────────────────────────────────────────────────────────────────────────


class HistoryMessagesRender():

    def __init__(self, ACCESS_TOKEN, DOMAIN, PROJECT_ID, IS_SSL):
        self.crafttalk_api = CrafttalkAPI(ACCESS_TOKEN, DOMAIN, PROJECT_ID, IS_SSL)
        self.message_elements_render = {
            "Start":     StartRender().render,
            "Message":   MessageRender().render,
            "Condition": ConditionRender().render,
            "Article":   ArticleRender().render,
            "Command":   CommandRender().render,
            "Form":      FormRender().render,
            "Agent":     AgentRender().render,
            "Unknown":   lambda message: f"Unknown element type: {self.get_element_type(message)}"
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Публичный метод
    # ─────────────────────────────────────────────────────────────────────────

    def render_history_messages(self, dialog_id: str):
        raw = self.crafttalk_api.get_history_messages(dialog_id)
        messages: list[dict] = raw.get("Messages", [])

        # ── 1. Шапка диалога ──────────────────────────────────────────────────
        self._print_dialog_header(dialog_id, messages)

        # ── 2. Хронология действий пользователя / операторов ─────────────────
        self._print_timeline(messages)

        # ── 3. Статистика сообщений ───────────────────────────────────────────
        self._print_stats(messages)

        # ── 4. Путь бота (интенты) с рендером статей ─────────────────────────
        print("\n" + "═" * 70)
        print("  БОТ: путь интентов и содержимое статей")
        print("═" * 70)
        self._render_bot_path(messages)

    # ─────────────────────────────────────────────────────────────────────────
    # Блок 1: Шапка диалога
    # ─────────────────────────────────────────────────────────────────────────

    def _print_dialog_header(self, dialog_id: str, messages: list[dict]):
        print("═" * 70)
        print("  ИНФОРМАЦИЯ О ДИАЛОГЕ")
        print("═" * 70)

        timestamps = [m["Timestamp"] for m in messages if "Timestamp" in m]
        start_ts   = min(timestamps) if timestamps else None
        end_ts     = max(timestamps) if timestamps else None

        # Базовые поля из первого сообщения
        first = messages[0] if messages else {}
        customer_id = first.get("CustomerId", "—")
        omni_user   = first.get("OmniUserId",  "—")
        channel_ids = sorted({m.get("ChannelId", "") for m in messages if m.get("ChannelId")})

        print(f"  Dialog ID     : {dialog_id}")
        print(f"  Customer ID   : {customer_id}")
        print(f"  OmniUser ID   : {omni_user}")
        print(f"  Каналы        : {', '.join(channel_ids)}")
        print(f"  Начало        : {_ts_to_str(start_ts)}")
        print(f"  Конец         : {_ts_to_str(end_ts)}")
        if start_ts and end_ts:
            print(f"  Длительность  : {_duration_str(start_ts, end_ts)}")
        print(f"  Всего событий : {len(messages)}")

        # Операторы
        operators = {}
        for m in messages:
            op = m.get("Operator", {})
            op_id = op.get("Id", "")
            if op_id and op_id != "__SYSTEM__" and op_id not in operators:
                operators[op_id] = f"{op.get('FirstName','')} {op.get('LastName','')}".strip()
        if operators:
            print(f"\n  Операторы ({len(operators)}):")
            for op_id, name in operators.items():
                print(f"    • {name}  [{op_id}]")

        # Вложения
        attachments = []
        for m in messages:
            for att in m.get("Attachments", []):
                attachments.append(att.get("AttachmentName", "?"))
        if attachments:
            print(f"\n  Вложения ({len(attachments)}):")
            for a in attachments:
                print(f"    📎 {a}")

        print()

    # ─────────────────────────────────────────────────────────────────────────
    # Блок 2: Хронология
    # ─────────────────────────────────────────────────────────────────────────

    def _print_timeline(self, messages: list[dict]):
        print("═" * 70)
        print("  ХРОНОЛОГИЯ ДИАЛОГА")
        print("═" * 70)

        # Отбираем только «видимые» события
        visible_types = {1, 2, 12, 13, 14, 16, 18, 33, 201}

        for m in messages:
            mtype = m.get("MessageType")
            if mtype not in visible_types:
                continue

            ts_str   = _ts_to_str(m.get("Timestamp"))
            type_str = MESSAGE_TYPE_NAMES.get(mtype, f"Type {mtype}")
            agent_id = m.get("AgentId", "")
            op       = m.get("Operator", {})
            op_name  = f"{op.get('FirstName','')} {op.get('LastName','')}".strip() if op else ""
            text     = m.get("Text", "")
            actions  = m.get("Actions", [])

            # actor
            if not m.get("IsReply"):
                actor = "👤 КЛИЕНТ"
            elif agent_id == "routingagent":
                actor = f"🔀 routing → {op_name or '?'}"
            elif op_name and op.get("Id", "") != "__SYSTEM__":
                actor = f"🧑‍💼 {op_name}"
            elif agent_id:
                actor = f"🤖 {agent_id}"
            else:
                actor = "❓"

            print(f"[{ts_str}]  {type_str}")
            print(f"  {actor}")

            if text:
                short = text[:120].replace("\n", " ")
                if len(text) > 120:
                    short += "…"
                print(f"  ✉  {short}")

            if actions:
                btns = [a.get("ActionText", "") for a in actions]
                print(f"  🔘 Кнопки: {' | '.join(btns)}")

            if mtype == 201:  # комментарий оператора
                note = m.get("Text", "")
                if note:
                    print(f"  📝 Заметка: {note}")

            print()

    # ─────────────────────────────────────────────────────────────────────────
    # Блок 3: Статистика
    # ─────────────────────────────────────────────────────────────────────────

    def _print_stats(self, messages: list[dict]):
        print("═" * 70)
        print("  СТАТИСТИКА")
        print("═" * 70)

        # Подсчёт по типам
        from collections import Counter
        type_counter = Counter(m.get("MessageType") for m in messages)
        print("  Распределение событий по типам:")
        for t, cnt in sorted(type_counter.items()):
            name = MESSAGE_TYPE_NAMES.get(t, f"Type {t}")
            print(f"    {t:>4} — {name}: {cnt}")

        # Сообщения клиента (type 1, IsReply=False)
        client_msgs = [m for m in messages if m.get("MessageType") == 1 and not m.get("IsReply")]
        texts = [m.get("Text", "") for m in client_msgs if m.get("Text")]
        print(f"\n  Текстовых сообщений от клиента: {len(texts)}")
        for t in texts:
            print(f"    → {t[:120]}")

        # Сообщения операторов (type 1, IsReply=True, агент != aiassist2 и не бот)
        op_msgs = [
            m for m in messages
            if m.get("MessageType") == 1
            and m.get("IsReply")
            and m.get("AgentId") == "routingagent"
            and m.get("Operator", {}).get("Id", "__SYSTEM__") != "__SYSTEM__"
            and m.get("Text")
        ]
        print(f"\n  Ответов операторов: {len(op_msgs)}")
        for m in op_msgs:
            op = m.get("Operator", {})
            name = f"{op.get('FirstName','')} {op.get('LastName','')}".strip()
            print(f"    [{name}] {m['Text'][:100]}")

        # Бот переключений
        redirects = [
            m for m in messages
            if m.get("MessageType") == 30
            and m.get("AgentId") == "aiassist2"
            and "/switchredirect" in (m.get("Text") or "")
        ]
        print(f"\n  Переключений бота (switchredirect): {len(redirects)}")
        for r in redirects:
            print(f"    → {r.get('Text', '').strip()}")

        # Classifiers hit
        classifier_hits = []
        seen = set()
        for m in messages:
            meta = m.get("Meta", {})
            clf = meta.get("intent_qa_id_classifier_name")
            score = meta.get("intent_qa_id_classifier_score")
            intent = meta.get("intent_qa_id")
            if clf and clf not in seen:
                seen.add(clf)
                classifier_hits.append((clf, score, intent))
        if classifier_hits:
            print(f"\n  Срабатывания классификаторов ({len(classifier_hits)}):")
            for clf, score, intent in classifier_hits:
                print(f"    classifier: {clf}  score: {score}  intent: {intent}")

        print()

    # ─────────────────────────────────────────────────────────────────────────
    # Блок 4: Путь бота
    # ─────────────────────────────────────────────────────────────────────────

    def _render_bot_path(self, messages: list[dict]):
        intents = []
        last_intent = None

        for msg in messages:
            if msg.get("AgentId") != "aiassist2":
                continue
            intent = msg.get("Meta", {}).get("intent_qa_id")
            if intent and intent != last_intent:
                intents.append(intent)
                last_intent = intent

        article_content = None
        blocks_index: dict = {}

        for intent in intents:
            if intent.startswith("article-"):
                article_content = self.crafttalk_api.get_aticles_content(intent)
                print(f"\n{'='*60}")
                print(f"ARTICLE: {intent}")
                if "Kind" in article_content.get("Article", {}) \
                        and article_content["Article"]["Kind"] == "Common":
                    self.pretty_print_conditions(
                        self.message_elements_render["Article"](article_content)
                    )
                    continue
                blocks = (
                    article_content
                    .get("Article", {})
                    .get("Scenario", {})
                    .get("Blocks", [])
                )
                blocks_index = {block["Id"]: block for block in blocks}

            elif intent.startswith("block_") and article_content:
                block = blocks_index.get(intent)
                if block:
                    self.render_scenario_block(block)

    # ─────────────────────────────────────────────────────────────────────────
    # Вспомогательные методы
    # ─────────────────────────────────────────────────────────────────────────
    def render_scenario_block(self, message: dict) -> str:
        element_type = self.get_element_type(message)
        if element_type in self.message_elements_render:
            self.pretty_print_conditions(self.message_elements_render[element_type](message))
        else:
            return f"Unknown element type: {element_type}"

    def get_element_type(self, message: dict) -> str:
        block_type = message.get("Type")
        return block_type if block_type else "Unknown"

    def pretty_print_conditions(self, text: str):
        for line in text.split("\n"):
            print(line)
