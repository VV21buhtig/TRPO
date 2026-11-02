using FastFood.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace FastFood.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Promotion> Promotions => Set<Promotion>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().HasIndex(u => u.Phone).IsUnique();

        b.Entity<Order>()
            .HasMany(o => o.Items)
            .WithOne(i => i.Order!)
            .HasForeignKey(i => i.OrderId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<Order>()
            .HasOne(o => o.Payment)
            .WithOne(p => p.Order!)
            .HasForeignKey<Payment>(p => p.OrderId);

        b.Entity<Order>().HasIndex(o => o.CreatedAt);

        // SQLite не хранит decimal нативно — используем double на уровне хранилища.
        b.Entity<MenuItem>().Property(m => m.Price).HasConversion<double>();
        b.Entity<Order>().Property(o => o.TotalAmount).HasConversion<double>();
        b.Entity<OrderItem>().Property(i => i.PurchasePrice).HasConversion<double>();
        b.Entity<Payment>().Property(p => p.Amount).HasConversion<double>();

        base.OnModelCreating(b);
    }
}
