using FastFood.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FastFood.Api.Data;

public static class Seed
{
    public static async Task EnsureSeededAsync(AppDbContext db)
    {
        await db.Database.EnsureCreatedAsync();
        if (await db.Users.AnyAsync())
        {
            return;
        }

        var hasher = new PasswordHasher<User>();

        User MakeUser(string phone, string name, string role, int bonus = 0)
        {
            var user = new User { Phone = phone, Name = name, Role = role, BonusBalance = bonus };
            user.PasswordHash = hasher.HashPassword(user, "12345");
            return user;
        }

        db.Users.AddRange(
            MakeUser("+79991234567", "Иванов Иван", Roles.Customer, 158),
            MakeUser("+79990000001", "Оператор смены", Roles.Operator),
            MakeUser("+79990000002", "Администратор", Roles.Admin));

        db.MenuItems.AddRange(
            new MenuItem { Name = "Бургер «Классический»", Description = "Булочка, говяжья котлета, салат, томат, соус", Price = 320, Calories = 540, Category = "Бургеры" },
            new MenuItem { Name = "Комбо «Двойной»", Description = "Двойная котлета, сыр, соус, картофель фри", Price = 450, Calories = 780, Category = "Бургеры" },
            new MenuItem { Name = "Чизбургер", Description = "Котлета, сыр чеддер, маринованный огурец", Price = 280, Calories = 480, Category = "Бургеры" },
            new MenuItem { Name = "Картофель фри", Description = "Хрустящий картофель, соль", Price = 150, Calories = 310, Category = "Закуски" },
            new MenuItem { Name = "Крылья BBQ", Description = "Куриные крылья в соусе барбекю", Price = 280, Calories = 420, Category = "Закуски" },
            new MenuItem { Name = "Наггетсы", Description = "Куриные наггетсы, 6 шт.", Price = 190, Calories = 260, Category = "Закуски" },
            new MenuItem { Name = "Кола 0,5", Description = "Классическая кола", Price = 120, Calories = 210, Category = "Напитки" },
            new MenuItem { Name = "Молочный коктейль", Description = "Ванильный коктейль", Price = 220, Calories = 350, Category = "Напитки" });

        db.Promotions.Add(new Promotion { Title = "−20 % на второй бургер", DiscountPercent = 20 });
        await db.SaveChangesAsync();
    }
}
