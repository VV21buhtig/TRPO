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
# Цена берётся из каталога: активная акция уже применена сервером.
price = {m["id"]: m["price"] for m in menu}
expected_total = price[1] * 2 + price[4]
order = call("POST", "/orders", {"items": [
    {"menuItemId": 1, "quantity": 2},
    {"menuItemId": 4, "quantity": 1},
], "comment": "Без лука"}, token=ct, expect=201)
assert order["totalAmount"] == expected_total, (expected_total, order)
assert order["status"] == "New"
assert order["statusHistory"][0]["changedBy"]["role"] == "Customer", order["statusHistory"]
print("   номер:", order["number"], "сумма:", order["totalAmount"])

print("5. оплата")
pay = call("POST", "/payments", {"orderId": order["id"], "method": "Card"}, token=ct)
assert pay["bonusAccrued"] == int(expected_total * 0.05), pay
assert pay["order"]["status"] == "Accepted"
assert any(
    h["status"] == "Accepted" and "оплачен" in (h["comment"] or "").lower()
    for h in pay["order"]["statusHistory"]
), pay["order"]["statusHistory"]

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
assert updated["statusHistory"][-1]["changedBy"]["role"] == "Operator", updated["statusHistory"]

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
cancel_order = call("POST", "/orders", {
    "items": [{"menuItemId": 3, "quantity": 1}],
    "comment": "Проверка отмены",
}, token=ct, expect=201)
cancelled = call("PATCH", f"/orders/{cancel_order['id']}/status", {
    "status": "Cancelled",
    "comment": "Тестовая причина отмены",
}, token=admin)
assert cancelled["status"] == "Cancelled"
assert cancelled["statusHistory"][-1]["changedBy"]["role"] == "Administrator", cancelled["statusHistory"]
assert cancelled["statusHistory"][-1]["comment"] == "Тестовая причина отмены"
report = call("GET", "/admin/reports/sales", token=admin)
assert report["ordersCount"] >= 1 and report["revenue"] >= expected_total, report

print("12. управление сотрудниками и акциями")
staff = call("GET", "/admin/staff", token=admin)
admin_row = next(x for x in staff if x["role"] == "Administrator")
assert all("id" in x and "name" in x and "isActive" in x for x in staff), staff
call("PATCH", f"/admin/staff/{admin_row['id']}/active", {"isActive": False}, token=admin, expect=400)
call("GET", "/admin/staff", token=oper, expect=403)
promo = call("GET", "/admin/promotions", token=admin)[0]
changed = call("PATCH", f"/admin/promotions/{promo['id']}", {
    "title": promo["title"],
    "discountPercent": promo["discountPercent"],
    "isActive": True,
}, token=admin)
assert changed["title"] == promo["title"], changed
reserve = next((x for x in staff if x["phone"] == "+79990000099"), None)
if reserve is None:
    reserve = call("POST", "/admin/staff", {
        "name": "Резервный оператор",
        "phone": "+79990000099",
        "password": "12345",
        "role": "Operator",
    }, token=admin, expect=201)
call("PATCH", f"/admin/staff/{reserve['id']}/active", {"isActive": True}, token=admin)
reserve_token = call("POST", "/auth/login", {
    "phone": "+79990000099", "password": "12345",
})["accessToken"]
call("PATCH", f"/admin/staff/{reserve['id']}/active", {"isActive": False}, token=admin)
call("POST", "/auth/login", {"phone": "+79990000099", "password": "12345"}, expect=403)
call("GET", "/users/me", token=reserve_token, expect=401)
call("PATCH", f"/admin/staff/{reserve['id']}/active", {"isActive": True}, token=admin)

print("13. разграничение доступа")
call("GET", "/orders", expect=401)
call("GET", "/admin/reports/sales", token=ct, expect=403)

print("14. SMS-вход (демо-код)")
call("POST", "/auth/sms-code", {"phone": "+79991234567"})
sms = call("POST", "/auth/login-sms", {"phone": "+79991234567", "code": "0000"})
assert sms["user"]["role"] == "Customer"

print(f"\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ: {ok} запросов")
