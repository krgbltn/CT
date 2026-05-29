import requests
from json.decoder import JSONDecodeError
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class CrafttalkAPI():
    
    def __init__(self,ACCESS_TOKEN, DOMAIN, PROJECT_ID, IS_SSL):
        self.ACCESS_TOKEN = ACCESS_TOKEN
        self.DOMAIN = DOMAIN
        self.PROJECT_ID = PROJECT_ID
        self.IS_SSL = IS_SSL

    def get_history_messages(self, dialog_id: str) -> dict:
        url = f"{self.DOMAIN}/api/external/history/messages"

        payload = {
            "DialogId": dialog_id,
            "CustomerId": self.PROJECT_ID
        }

        cookies = {
            "CurrentCustomerId": f"{self.PROJECT_ID}",
            "CraftTalk.Auth": f"{self.ACCESS_TOKEN}",
        }
        print(f"[WARN] get_dialog_info failed: {payload}")
        response = requests.post(url, json=payload, cookies=cookies, timeout=30, verify=self.IS_SSL)
        print(f"[WARN] get_dialog_info failed: { response.json()}")
        return response.json()

    def get_dialog_info(self, dialog_id: str) -> dict:
        """Получить метаданные диалога (статус, теги, операторы и т.д.)"""
        url = f"{self.DOMAIN}/api/external/dialogs/{dialog_id}"

        cookies = {
            "CurrentCustomerId": f"{self.PROJECT_ID}",
            "CraftTalk.Auth": f"{self.ACCESS_TOKEN}",
        }

        try:
            response = requests.get(url, cookies=cookies, timeout=30, verify=self.IS_SSL)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            print(f"[WARN] get_dialog_info failed: {e}")
        return {}

    def get_aticles_content(self, article_symbol_codes: str):
        url = f"{self.DOMAIN}/api/v2/{self.PROJECT_ID}/articles/{article_symbol_codes}"

        params = {
            "onlyPublished": "false"
        }

        cookies = {
            "CurrentCustomerId": f"{self.PROJECT_ID}",
            "CraftTalk.Auth": f"{self.ACCESS_TOKEN}",
        }

        try:
            response = requests.get(
                url,
                params=params,
                cookies=cookies,
                timeout=30,
                verify=self.IS_SSL
            )

            # Попробуем распарсить JSON
            return response.json()

        except JSONDecodeError:
            print(f"[ERROR] Сервер вернул не JSON! Status code: {response.status_code}")
            print("Raw response:", response.text)
            return {}  # Возвращаем пустой словарь для безопасной работы

        except requests.exceptions.RequestException as e:
            # Ловим ошибки сети, тайм-аута и т.п.
            print(f"[ERROR] Ошибка запроса: {e}")
            return {}