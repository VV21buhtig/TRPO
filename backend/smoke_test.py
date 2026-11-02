# -*- coding: utf-8 -*-
"""Smoke-тест REST API «Онлайн-заказ». Запуск: python3 smoke_test.py [base_url]"""

import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5080"
API = BASE + "/api/v1"
ok = 0


def call(method, path, body=None, token=None, expect=200):
    global ok
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()

    assert status == expect, f"{method} {path}: ожидали {expect}, получили {status}: {raw[:200]}"
    ok += 1
    return json.loads(raw) if raw else None


print("1. health")
assert call("GET", "/health")["status"] == "ok"

print("2. вход клиента")
customer = call("POST", "/auth/login", {"phone": "+79991234567", "password": "12345"})
ct = customer["accessToken"]

print("3. каталог")
menu = call("GET", "/menu-items")
assert len(menu) == 8, menu
assert all(not m["isInStopList"] for m in menu)

print("4. создание заказа")
order = call("POST", "/orders", {"items": [
    {"menuItemId": 1, "quantity": 2},
    {"menuItemId": 4, "quantity": 1},
], "comment": "Без лука"}, token=ct, expect=201)
assert order["totalAmount"] == 790, order
assert order["status"] == "New"
print("   номер:", order["number"], "сумма:", order["totalAmount"])

print("5. оплата")
pay = call("POST", "/payments", {"orderId": order["id"], "method": "Card"}, token=ct)
assert pay["bonusAccrued"] == 39, pay
assert pay["order"]["status"] == "Accepted"

print("6. повторная оплата запрещена")
call("POST", "/payments", {"orderId": order["id"], "method": "Card"}, token=ct, expect=409)

print("7. история заказов клиента")
mine = call("GET", "/orders", token=ct)
created = next((o for o in mine if o["id"] == order["id"]), None)
assert created is not None and created["status"] == "Accepted", mine

print("8. вход оператора и смена статуса")
oper = call("POST", "/auth/login", {"phone": "+79990000001", "password": "12345"})["accessToken"]
all_orders = call("GET", "/orders", token=oper)
assert any(o["id"] == order["id"] for o in all_orders)
updated = call("PATCH", f"/orders/{order['id']}/status", {"status": "Cooking"}, token=oper)
assert updated["status"] == "Cooking"

print("9. стоп-лист")
call("PATCH", "/menu-items/4/stoplist", {"inStopList": True}, token=oper)
visible = call("GET", "/menu-items")
assert all(m["id"] != 4 for m in visible)
call("PATCH", "/menu-items/4/stoplist", {"inStopList": False}, token=oper)

print("10. заказ блюда из стоп-листа отклоняется")
call("PATCH", "/menu-items/4/stoplist", {"inStopList": True}, token=oper)
call("POST", "/orders", {"items": [{"menuItemId": 4, "quantity": 1}]}, token=ct, expect=409)
call("PATCH", "/menu-items/4/stoplist", {"inStopList": False}, token=oper)

print("11. администратор: акция и отчёт")
admin = call("POST", "/auth/login", {"phone": "+79990000002", "password": "12345"})["accessToken"]
call("POST", "/admin/promotions", {"title": "Тестовая акция", "discountPercent": 15}, token=admin, expect=201)
report = call("GET", "/admin/reports/sales", token=admin)
assert report["ordersCount"] >= 1 and report["revenue"] >= 790, report

print("12. разграничение доступа")
call("GET", "/orders", expect=401)
call("GET", "/admin/reports/sales", token=ct, expect=403)

print("13. SMS-вход (демо-код)")
call("POST", "/auth/sms-code", {"phone": "+79991234567"})
sms = call("POST", "/auth/login-sms", {"phone": "+79991234567", "code": "0000"})
assert sms["user"]["role"] == "Customer"

print(f"\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: {ok} запросов")
