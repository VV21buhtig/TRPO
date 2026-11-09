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
        isActive = u.IsActive,
    };

    private static object StaffDto(User u) => new
    {
        id = u.Id,
        name = u.Name,
        phone = u.Phone,
        role = u.Role,
        isActive = u.IsActive,
        createdAt = u.CreatedAt,
    };

    private static Promotion? BestPromotion(MenuItem item, IEnumerable<Promotion> promotions)
        => promotions
            .Where(p => p.IsActive &&
                (p.Scope == PromotionScopes.All ||
                 (p.Scope == PromotionScopes.Category && p.Category == item.Category) ||
                 (p.Scope == PromotionScopes.MenuItem && p.MenuItemId == item.Id)))
            .OrderByDescending(p => p.DiscountPercent)
            .FirstOrDefault();

    private static decimal PromoPrice(MenuItem item, Promotion? promotion)
        => promotion is null
            ? item.Price
            : Math.Round(item.Price * (100 - promotion.DiscountPercent) / 100m, 2);

    private static object MenuDto(MenuItem m, Promotion? promotion = null) => new
    {
        id = m.Id,
        name = m.Name,
        description = m.Description,
        price = PromoPrice(m, promotion),
        basePrice = m.Price,
        discountPercent = promotion?.DiscountPercent ?? 0,
        promotionTitle = promotion?.Title,
        calories = m.Calories,
        category = m.Category,
        isInStopList = m.IsInStopList,
    };

    private static async Task<(string? Error, string Scope, string? Category, int? MenuItemId)>
        ResolvePromotionTargetAsync(AppDbContext db, string? scope, string? category, int? menuItemId)
    {
        var normalized = string.IsNullOrWhiteSpace(scope) ? PromotionScopes.None : scope;
        if (!PromotionScopes.AllScopes.Contains(normalized))
        {
            return ("Неизвестная область действия акции", PromotionScopes.None, null, null);
        }

        if (normalized == PromotionScopes.All || normalized == PromotionScopes.None)
        {
            return (null, normalized, null, null);
        }

        if (normalized == PromotionScopes.Category)
        {
            var categoryName = category?.Trim();
            if (string.IsNullOrWhiteSpace(categoryName) ||
                !await db.MenuItems.AnyAsync(m => m.Category == categoryName))
            {
                return ("Выберите существующую категорию", PromotionScopes.None, null, null);
            }
            return (null, normalized, categoryName, null);
        }

        if (menuItemId is null || !await db.MenuItems.AnyAsync(m => m.Id == menuItemId))
        {
            return ("Выберите существующее блюдо", PromotionScopes.None, null, null);
        }
        return (null, normalized, null, menuItemId);
    }

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
        statusHistory = o.StatusHistory
            .OrderBy(h => h.ChangedAt)
            .Select(h => new
            {
                status = h.Status,
                changedAt = h.ChangedAt,
                changedBy = new
                {
                    id = h.ChangedByUserId,
                    name = h.ChangedByName,
                    role = h.ChangedByRole,
                },
                comment = h.Comment,
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
            .Include(o => o.StatusHistory)
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

            if (!user.IsActive)
            {
                return Results.Json(
                    new { error = "Учётная запись заблокирована. Обратитесь к менеджеру." },
                    statusCode: StatusCodes.Status403Forbidden);
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

            if (!user.IsActive)
            {
                return Results.Json(
                    new { error = "Учётная запись заблокирована. Обратитесь к менеджеру." },
                    statusCode: StatusCodes.Status403Forbidden);
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
            if (user is null || !user.IsActive)
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
            var promotions = await db.Promotions
                .Where(p => p.IsActive)
                .AsNoTracking()
                .ToListAsync();
            return Results.Ok(items.Select(m => MenuDto(m, BestPromotion(m, promotions))));
        });

        api.MapGet("/menu-items/{id:int}", async (int id, AppDbContext db) =>
        {
            var item = await db.MenuItems.AsNoTracking().FirstOrDefaultAsync(m => m.Id == id);
            if (item is null)
            {
                return Results.NotFound();
            }
            var promotions = await db.Promotions
                .Where(p => p.IsActive)
                .AsNoTracking()
                .ToListAsync();
            return Results.Ok(MenuDto(item, BestPromotion(item, promotions)));
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

            var promotions = await db.Promotions
                .Where(p => p.IsActive)
                .AsNoTracking()
                .ToListAsync();
            var dto = MenuDto(item, BestPromotion(item, promotions));
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

            var promotions = await db.Promotions
                .Where(p => p.IsActive)
                .AsNoTracking()
                .ToListAsync();

            var order = new Order
            {
                CustomerId = Uid(user),
                Comment = req.Comment,
                CreatedAt = DateTime.UtcNow,
            };

            foreach (var line in req.Items)
            {
                var item = menu.First(m => m.Id == line.MenuItemId);
                var promotion = BestPromotion(item, promotions);
                order.Items.Add(new OrderItem
                {
                    MenuItemId = item.Id,
                    Name = item.Name,
                    PurchasePrice = PromoPrice(item, promotion),
                    Quantity = line.Quantity,
                });
            }

            order.TotalAmount = order.Items.Sum(i => i.PurchasePrice * i.Quantity);
            var next = (await db.Orders.MaxAsync(o => (int?)o.Id) ?? 0) + 1001;
            order.Number = $"FA-{next}";
            order.StatusHistory.Add(new OrderStatusHistory
            {
                Status = order.Status,
                ChangedByUserId = Uid(user),
                ChangedByName = user.FindFirstValue(ClaimTypes.Name) ?? "Клиент",
                ChangedByRole = Role(user) ?? Roles.Customer,
                ChangedAt = order.CreatedAt,
                Comment = "Заказ оформлен",
            });

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
                .Include(o => o.StatusHistory)
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

            if (order.Status != req.Status)
            {
                var changedAt = DateTime.UtcNow;
                order.Status = req.Status;
                order.OperatorId ??= Uid(user);
                order.StatusHistory.Add(new OrderStatusHistory
                {
                    Status = req.Status,
                    ChangedByUserId = Uid(user),
                    ChangedByName = user.FindFirstValue(ClaimTypes.Name) ?? "Сотрудник",
                    ChangedByRole = Role(user) ?? "Staff",
                    ChangedAt = changedAt,
                    Comment = string.IsNullOrWhiteSpace(req.Comment) ? null : req.Comment.Trim(),
                });
            }

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

            order.StatusHistory.Add(new OrderStatusHistory
            {
                Status = OrderStatuses.Accepted,
                ChangedByUserId = uid,
                ChangedByName = customer?.Name ?? user.FindFirstValue(ClaimTypes.Name) ?? "Клиент",
                ChangedByRole = Roles.Customer,
                ChangedAt = payment.CreatedAt,
                Comment = "Заказ оплачен и передан в обработку",
            });

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
                .Include(o => o.StatusHistory)
                .Where(o => o.CustomerId == uid)
                .OrderByDescending(o => o.CreatedAt)
                .AsNoTracking()
                .ToListAsync();
            return Results.Ok(orders.Select(OrderDto));
        }).RequireAuthorization("Customer");

        // ---------- администрирование ----------
        api.MapGet("/admin/staff", async (AppDbContext db) =>
        {
            var staff = await db.Users
                .Where(u => u.Role == Roles.Operator || u.Role == Roles.Admin)
                .OrderByDescending(u => u.IsActive)
                .ThenBy(u => u.Id)
                .AsNoTracking()
                .ToListAsync();
            return Results.Ok(staff.Select(StaffDto));
        }).RequireAuthorization("Admin");

        api.MapPost("/admin/staff", async (CreateStaffRequest req, AppDbContext db) =>
        {
            var hasher = new PasswordHasher<User>();
            var name = req.Name.Trim();
            var phone = req.Phone.Trim();
            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(phone) ||
                string.IsNullOrWhiteSpace(req.Password))
            {
                return Results.BadRequest(new { error = "Укажите ФИО, телефон и пароль" });
            }

            if (req.Password.Length < 5)
            {
                return Results.BadRequest(new { error = "Пароль должен содержать не менее 5 символов" });
            }

            if (await db.Users.AnyAsync(u => u.Phone == phone))
            {
                return Results.Conflict(new { error = "Пользователь с таким телефоном уже существует" });
            }

            var role = req.Role == Roles.Admin ? Roles.Admin : Roles.Operator;
            var staff = new User
            {
                Name = name,
                Phone = phone,
                Role = role,
                IsActive = true,
            };
            staff.PasswordHash = hasher.HashPassword(staff, req.Password);
            db.Users.Add(staff);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/admin/staff/{staff.Id}", StaffDto(staff));
        }).RequireAuthorization("Admin");

        api.MapPatch("/admin/staff/{id:int}/active", async (
            int id, UpdateStaffActiveRequest req, ClaimsPrincipal user, AppDbContext db) =>
        {
            var staff = await db.Users.FindAsync(id);
            if (staff is null || (staff.Role != Roles.Operator && staff.Role != Roles.Admin))
            {
                return Results.NotFound();
            }

            if (!req.IsActive)
            {
                if (staff.Id == Uid(user))
                {
                    return Results.BadRequest(new { error = "Нельзя заблокировать собственную учётную запись" });
                }

                if (staff.Role == Roles.Admin)
                {
                    var activeAdmins = await db.Users
                        .CountAsync(u => u.Role == Roles.Admin && u.IsActive);
                    if (activeAdmins <= 1)
                    {
                        return Results.BadRequest(new { error = "Нельзя заблокировать последнего менеджера" });
                    }
                }
            }

            staff.IsActive = req.IsActive;
            await db.SaveChangesAsync();
            return Results.Ok(StaffDto(staff));
        }).RequireAuthorization("Admin");

        api.MapPost("/admin/promotions", async (CreatePromotionRequest req, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Title) || req.DiscountPercent is <= 0 or > 90)
            {
                return Results.BadRequest(new { error = "Некорректные параметры акции" });
            }

            var target = await ResolvePromotionTargetAsync(
                db, req.Scope, req.Category, req.MenuItemId);
            if (target.Error is not null)
            {
                return Results.BadRequest(new { error = target.Error });
            }

            var promo = new Promotion
            {
                Title = req.Title.Trim(),
                DiscountPercent = req.DiscountPercent,
                Scope = target.Scope,
                Category = target.Category,
                MenuItemId = target.MenuItemId,
            };
            db.Promotions.Add(promo);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/admin/promotions/{promo.Id}", promo);
        }).RequireAuthorization("Admin");

        api.MapGet("/admin/promotions", async (AppDbContext db) =>
            Results.Ok(await db.Promotions.AsNoTracking().OrderBy(p => p.Id).ToListAsync()))
            .RequireAuthorization("Admin");

        api.MapPatch("/admin/promotions/{id:int}", async (
            int id, UpdatePromotionRequest req, AppDbContext db) =>
        {
            var promo = await db.Promotions.FindAsync(id);
            if (promo is null)
            {
                return Results.NotFound();
            }

            if (req.Title is not null)
            {
                if (string.IsNullOrWhiteSpace(req.Title))
                {
                    return Results.BadRequest(new { error = "Название акции не может быть пустым" });
                }
                promo.Title = req.Title.Trim();
            }

            if (req.DiscountPercent is not null)
            {
                if (req.DiscountPercent is <= 0 or > 90)
                {
                    return Results.BadRequest(new { error = "Скидка должна быть в диапазоне 1–90%" });
                }
                promo.DiscountPercent = req.DiscountPercent.Value;
            }

            if (req.IsActive is not null)
            {
                promo.IsActive = req.IsActive.Value;
            }

            var target = await ResolvePromotionTargetAsync(
                db,
                req.Scope ?? promo.Scope,
                req.Scope is null ? promo.Category : req.Category,
                req.Scope is null ? promo.MenuItemId : req.MenuItemId);
            if (target.Error is not null)
            {
                return Results.BadRequest(new { error = target.Error });
            }
            promo.Scope = target.Scope;
            promo.Category = target.Category;
            promo.MenuItemId = target.MenuItemId;

            await db.SaveChangesAsync();
            return Results.Ok(promo);
        }).RequireAuthorization("Admin");

        api.MapGet("/admin/reports/sales", async (DateTime? from, DateTime? to, AppDbContext db) =>
        {
            var start = from ?? DateTime.UtcNow.AddDays(-30);
            var end = to ?? DateTime.UtcNow.AddDays(1);

            var paid = await db.Payments
                .Where(p => p.Status == "Paid" && p.CreatedAt >= start && p.CreatedAt < end)
                .ToListAsync();

            var orders = await db.Orders
                .Where(o => o.CreatedAt >= start && o.CreatedAt < end)
                .AsNoTracking()
                .ToListAsync();

            var ordersCount = orders.Count;
            var cancelledOrders = orders.Where(o => o.Status == OrderStatuses.Cancelled).ToList();
            var completedCount = orders.Count(o => o.Status == OrderStatuses.Completed);
            var statusCounts = orders
                .GroupBy(o => o.Status)
                .ToDictionary(g => g.Key, g => g.Count());

            var operatorStats = await db.OrderStatusHistories
                .Where(h => h.ChangedAt >= start && h.ChangedAt < end &&
                    (h.ChangedByRole == Roles.Operator || h.ChangedByRole == Roles.Admin))
                .GroupBy(h => new { h.ChangedByUserId, h.ChangedByName, h.ChangedByRole })
                .Select(g => new
                {
                    id = g.Key.ChangedByUserId,
                    name = g.Key.ChangedByName,
                    role = g.Key.ChangedByRole,
                    actions = g.Count(),
                    lastAt = g.Max(h => h.ChangedAt),
                })
                .OrderByDescending(x => x.actions)
                .ToListAsync();

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

            var revenue = paid.Sum(p => p.Amount);
            return Results.Ok(new
            {
                from = start,
                to = end,
                ordersCount,
                paidCount = paid.Count,
                completedCount,
                cancelledCount = cancelledOrders.Count,
                cancelledAmount = cancelledOrders.Sum(o => o.TotalAmount),
                revenue,
                averageCheck = paid.Count > 0 ? revenue / paid.Count : 0,
                statusCounts,
                operatorStats,
                topItems,
            });
        }).RequireAuthorization("Admin");
    }
}
