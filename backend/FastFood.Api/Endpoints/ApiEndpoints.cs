using System.Security.Claims;
using FastFood.Api.Contracts;
using FastFood.Api.Data;
using FastFood.Api.Hubs;
using FastFood.Api.Models;
using FastFood.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FastFood.Api.Endpoints;

public static class ApiEndpoints
{
    private static int? Uid(ClaimsPrincipal user)
        => int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    private static string? Role(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.Role);

    private static object UserDto(User u) => new
    {
        id = u.Id,
        name = u.Name,
        phone = u.Phone,
        role = u.Role,
        bonusBalance = u.BonusBalance,
    };

    private static object MenuDto(MenuItem m) => new
    {
        id = m.Id,
        name = m.Name,
        description = m.Description,
        price = m.Price,
        calories = m.Calories,
        category = m.Category,
        isInStopList = m.IsInStopList,
    };

    private static object OrderDto(Order o) => new
    {
        id = o.Id,
        number = o.Number,
        status = o.Status,
        totalAmount = o.TotalAmount,
        bonusAccrued = o.BonusAccrued,
        comment = o.Comment,
        createdAt = o.CreatedAt,
        customer = o.Customer is null ? null : new
        {
            id = o.Customer.Id,
            name = o.Customer.Name,
            phone = o.Customer.Phone,
        },
        items = o.Items.Select(i => new
        {
            menuItemId = i.MenuItemId,
            name = i.Name,
            quantity = i.Quantity,
            price = i.PurchasePrice,
        }),
        payment = o.Payment is null ? null : new
        {
            method = o.Payment.Method,
            status = o.Payment.Status,
        },
    };

    private static async Task<Order?> LoadOrderAsync(AppDbContext db, int id)
        => await db.Orders
            .Include(o => o.Items)
            .Include(o => o.Customer)
            .Include(o => o.Payment)
            .FirstOrDefaultAsync(o => o.Id == id);

    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1");

        // ---------- служебные ----------
        api.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTime.UtcNow }));

        // ---------- аутентификация ----------
        api.MapPost("/auth/login", async (LoginRequest req, AppDbContext db, TokenService tokens) =>
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == req.Phone);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            var hasher = new PasswordHasher<User>();
            if (hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password) ==
                PasswordVerificationResult.Failed)
            {
                return Results.Unauthorized();
            }

            var (access, refresh) = tokens.Create(user);
            return Results.Ok(new { accessToken = access, refreshToken = refresh, user = UserDto(user) });
        });

        api.MapPost("/auth/sms-code", async (SmsCodeRequest req, AppDbContext db) =>
        {
            var exists = await db.Users.AnyAsync(u => u.Phone == req.Phone);
            return Results.Ok(new
            {
                sent = exists,
                code = "0000",
                note = "Демо-режим: код подтверждения всегда 0000",
            });
        });

        api.MapPost("/auth/login-sms", async (SmsLoginRequest req, AppDbContext db, TokenService tokens) =>
        {
            if (req.Code != "0000")
            {
                return Results.BadRequest(new { error = "Неверный код подтверждения" });
            }

            var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == req.Phone);
            if (user is null)
            {
                return Results.NotFound(new { error = "Пользователь не найден" });
            }

            var (access, refresh) = tokens.Create(user);
            return Results.Ok(new { accessToken = access, refreshToken = refresh, user = UserDto(user) });
        });

        api.MapPost("/auth/refresh", async (RefreshRequest req, AppDbContext db, TokenService tokens) =>
        {
            var principal = tokens.Validate(req.RefreshToken, "refresh");
            if (principal is null ||
                !int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
            {
                return Results.Unauthorized();
            }

            var user = await db.Users.FindAsync(id);
            if (user is null)
            {
                return Results.Unauthorized();
            }

            var (access, refresh) = tokens.Create(user);
            return Results.Ok(new { accessToken = access, refreshToken = refresh });
        });

        // ---------- каталог ----------
        api.MapGet("/menu-items", async (string? category, bool? includeStopList, AppDbContext db) =>
        {
            var query = db.MenuItems.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(category) && category != "Все")
            {
                query = query.Where(m => m.Category == category);
            }

            if (includeStopList != true)
            {
                query = query.Where(m => !m.IsInStopList);
            }

            var items = await query.OrderBy(m => m.Id).ToListAsync();
            return Results.Ok(items.Select(MenuDto));
        });

        api.MapGet("/menu-items/{id:int}", async (int id, AppDbContext db) =>
        {
            var item = await db.MenuItems.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id);
            return item is null ? Results.NotFound() : Results.Ok(MenuDto(item));
        });

        api.MapGet("/categories", async (AppDbContext db) =>
            Results.Ok(await db.MenuItems
                .Select(m => m.Category)
                .Distinct()
                .OrderBy(c => c)
                .ToListAsync()));

        api.MapPatch("/menu-items/{id:int}/stoplist", async (
            int id, StopListRequest req, AppDbContext db, IHubContext<OrdersHub> hub) =>
        {
            var item = await db.MenuItems.FindAsync(id);
            if (item is null)
            {
                return Results.NotFound();
            }

            item.IsInStopList = req.InStopList;
            await db.SaveChangesAsync();

            var dto = MenuDto(item);
            await hub.Clients.All.SendAsync("StopListChanged", dto);
            return Results.Ok(dto);
        }).RequireAuthorization("Staff");

        // ---------- заказы ----------
        api.MapPost("/orders", async (
            CreateOrderRequest req, ClaimsPrincipal user, AppDbContext db, IHubContext<OrdersHub> hub) =>
        {
            if (req.Items is null || req.Items.Count == 0)
            {
                return Results.BadRequest(new { error = "Корзина пуста" });
            }

            if (req.Items.Any(i => i.Quantity <= 0))
            {
                return Results.BadRequest(new { error = "Количество должно быть больше нуля" });
            }

            var ids = req.Items.Select(i => i.MenuItemId).Distinct().ToList();
            var menu = await db.MenuItems.Where(m => ids.Contains(m.Id)).ToListAsync();
            if (menu.Count != ids.Count)
            {
                return Results.BadRequest(new { error = "Одно или несколько блюд не найдены" });
            }

            if (menu.Any(m => m.IsInStopList))
            {
                return Results.Conflict(new { error = "Блюдо находится в стоп-листе" });
            }

            var order = new Order
            {
                CustomerId = Uid(user),
                Comment = req.Comment,
                CreatedAt = DateTime.UtcNow,
            };

            foreach (var line in req.Items)
            {
                var item = menu.First(m => m.Id == line.MenuItemId);
                order.Items.Add(new OrderItem
                {
                    MenuItemId = item.Id,
                    Name = item.Name,
                    PurchasePrice = item.Price,
                    Quantity = line.Quantity,
                });
            }

            order.TotalAmount = order.Items.Sum(i => i.PurchasePrice * i.Quantity);
            var next = (await db.Orders.MaxAsync(o => (int?)o.Id) ?? 0) + 1001;
            order.Number = $"FA-{next}";

            db.Orders.Add(order);
            await db.SaveChangesAsync();

            var dto = OrderDto((await LoadOrderAsync(db, order.Id))!);
            await hub.Clients.Group(OrdersHub.OperatorsGroup).SendAsync("OrderCreated", dto);
            return Results.Created($"/api/v1/orders/{order.Id}", dto);
        }).RequireAuthorization("Customer");

        api.MapGet("/orders", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var query = db.Orders
                .Include(o => o.Items)
                .Include(o => o.Customer)
                .Include(o => o.Payment)
                .AsNoTracking();

            if (Role(user) == Roles.Customer)
            {
                var uid = Uid(user);
                query = query.Where(o => o.CustomerId == uid);
            }

            var orders = await query.OrderByDescending(o => o.CreatedAt).Take(100).ToListAsync();
            return Results.Ok(orders.Select(OrderDto));
        }).RequireAuthorization();

        api.MapGet("/orders/{id:int}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var order = await LoadOrderAsync(db, id);
            if (order is null)
            {
                return Results.NotFound();
            }

            if (Role(user) == Roles.Customer && order.CustomerId != Uid(user))
            {
                return Results.Forbid();
            }

            return Results.Ok(OrderDto(order));
        }).RequireAuthorization();

        api.MapPatch("/orders/{id:int}/status", async (
            int id, UpdateStatusRequest req, ClaimsPrincipal user, AppDbContext db,
            IHubContext<OrdersHub> hub) =>
        {
            if (!OrderStatuses.All.Contains(req.Status))
            {
                return Results.BadRequest(new { error = "Неизвестный статус заказа" });
            }

            var order = await LoadOrderAsync(db, id);
            if (order is null)
            {
                return Results.NotFound();
            }

            order.Status = req.Status;
            order.OperatorId ??= Uid(user);
            await db.SaveChangesAsync();

            var dto = OrderDto(order);
            await hub.Clients.Group(OrdersHub.OperatorsGroup).SendAsync("OrderStatusChanged", dto);
            await hub.Clients.Group($"order:{order.Number}").SendAsync("OrderStatusChanged", dto);
            return Results.Ok(dto);
        }).RequireAuthorization("Staff");

        // ---------- оплата ----------
        api.MapPost("/payments", async (
            PaymentRequest req, ClaimsPrincipal user, AppDbContext db, IHubContext<OrdersHub> hub) =>
        {
            var uid = Uid(user);
            var order = await db.Orders
                .Include(o => o.Items)
                .Include(o => o.Payment)
                .FirstOrDefaultAsync(o => o.Id == req.OrderId && o.CustomerId == uid);

            if (order is null)
            {
                return Results.NotFound(new { error = "Заказ не найден" });
            }

            if (order.Payment is not null)
            {
                return Results.Conflict(new { error = "Заказ уже оплачен" });
            }

            var payment = new Payment
            {
                OrderId = order.Id,
                Method = req.Method,
                Amount = order.TotalAmount,
                Status = "Paid",
                CreatedAt = DateTime.UtcNow,
            };
            db.Payments.Add(payment);

            order.Status = OrderStatuses.Accepted;
            var bonus = (int)Math.Floor(order.TotalAmount * 0.05m);
            order.BonusAccrued = bonus;

            var customer = await db.Users.FindAsync(uid);
            if (customer is not null)
            {
                customer.BonusBalance += bonus;
            }

            await db.SaveChangesAsync();

            var dto = OrderDto((await LoadOrderAsync(db, order.Id))!);
            await hub.Clients.Group(OrdersHub.OperatorsGroup).SendAsync("OrderCreated", dto);
            await hub.Clients.Group($"order:{order.Number}").SendAsync("OrderStatusChanged", dto);

            return Results.Ok(new
            {
                paymentId = payment.Id,
                status = payment.Status,
                bonusAccrued = bonus,
                order = dto,
            });
        }).RequireAuthorization("Customer");

        api.MapGet("/payments/{id:int}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var payment = await db.Payments.Include(p => p.Order).AsNoTracking()
                .FirstOrDefaultAsync(p => p.Id == id);
            if (payment is null)
            {
                return Results.NotFound();
            }

            if (Role(user) == Roles.Customer && payment.Order?.CustomerId != Uid(user))
            {
                return Results.Forbid();
            }

            return Results.Ok(new
            {
                id = payment.Id,
                orderId = payment.OrderId,
                method = payment.Method,
                amount = payment.Amount,
                status = payment.Status,
                createdAt = payment.CreatedAt,
            });
        }).RequireAuthorization();

        // ---------- лояльность ----------
        api.MapGet("/loyalty/balance", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var customer = await db.Users.FindAsync(Uid(user));
            return customer is null
                ? Results.NotFound()
                : Results.Ok(new { balance = customer.BonusBalance });
        }).RequireAuthorization("Customer");

        api.MapPost("/loyalty/spend", async (SpendBonusRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var customer = await db.Users.FindAsync(Uid(user));
            if (customer is null)
            {
                return Results.NotFound();
            }

            if (req.Amount <= 0 || req.Amount > customer.BonusBalance)
            {
                return Results.BadRequest(new { error = "Недостаточно бонусов" });
            }

            customer.BonusBalance -= req.Amount;
            await db.SaveChangesAsync();
            return Results.Ok(new { balance = customer.BonusBalance });
        }).RequireAuthorization("Customer");

        // ---------- профиль ----------
        api.MapGet("/users/me", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var current = await db.Users.FindAsync(Uid(user));
            return current is null ? Results.NotFound() : Results.Ok(UserDto(current));
        }).RequireAuthorization();

        api.MapPatch("/users/me", async (UpdateProfileRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var current = await db.Users.FindAsync(Uid(user));
            if (current is null)
            {
                return Results.NotFound();
            }

            if (!string.IsNullOrWhiteSpace(req.Name))
            {
                current.Name = req.Name.Trim();
            }

            await db.SaveChangesAsync();
            return Results.Ok(UserDto(current));
        }).RequireAuthorization();

        api.MapGet("/users/me/orders", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var uid = Uid(user);
            var orders = await db.Orders
                .Include(o => o.Items)
                .Include(o => o.Customer)
                .Include(o => o.Payment)
                .Where(o => o.CustomerId == uid)
                .OrderByDescending(o => o.CreatedAt)
                .AsNoTracking()
                .ToListAsync();
            return Results.Ok(orders.Select(OrderDto));
        }).RequireAuthorization("Customer");

        // ---------- администрирование ----------
        api.MapPost("/admin/promotions", async (CreatePromotionRequest req, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Title) || req.DiscountPercent is <= 0 or > 90)
            {
                return Results.BadRequest(new { error = "Некорректные параметры акции" });
            }

            var promo = new Promotion { Title = req.Title.Trim(), DiscountPercent = req.DiscountPercent };
            db.Promotions.Add(promo);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/admin/promotions/{promo.Id}", new
            {
                promo.Id,
                promo.Title,
                promo.DiscountPercent,
                promo.IsActive,
            });
        }).RequireAuthorization("Admin");

        api.MapGet("/admin/promotions", async (AppDbContext db) =>
            Results.Ok(await db.Promotions.AsNoTracking().OrderBy(p => p.Id).ToListAsync()))
            .RequireAuthorization("Admin");

        api.MapGet("/admin/reports/sales", async (DateTime? from, DateTime? to, AppDbContext db) =>
        {
            var start = from ?? DateTime.UtcNow.AddDays(-30);
            var end = to ?? DateTime.UtcNow.AddDays(1);

            var paid = await db.Payments
                .Where(p => p.Status == "Paid" && p.CreatedAt >= start && p.CreatedAt < end)
                .ToListAsync();

            var ordersCount = await db.Orders.CountAsync(o => o.CreatedAt >= start && o.CreatedAt < end);

            var topItems = await db.OrderItems
                .Where(i => i.Order!.CreatedAt >= start && i.Order.CreatedAt < end)
                .GroupBy(i => i.Name)
                .Select(g => new
                {
                    name = g.Key,
                    quantity = g.Sum(x => x.Quantity),
                    revenue = g.Sum(x => x.PurchasePrice * x.Quantity),
                })
                .OrderByDescending(x => x.quantity)
                .Take(5)
                .ToListAsync();

            return Results.Ok(new
            {
                from = start,
                to = end,
                ordersCount,
                paidCount = paid.Count,
                revenue = paid.Sum(p => p.Amount),
                topItems,
            });
        }).RequireAuthorization("Admin");
    }
}
