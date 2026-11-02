namespace FastFood.Api.Models;

public static class Roles
{
    public const string Customer = "Customer";
    public const string Operator = "Operator";
    public const string Admin = "Administrator";
}

public static class OrderStatuses
{
    public const string New = "New";
    public const string Accepted = "Accepted";
    public const string Cooking = "Cooking";
    public const string Ready = "Ready";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";

    public static readonly string[] All = [New, Accepted, Cooking, Ready, Completed, Cancelled];
}

public class User
{
    public int Id { get; set; }
    public string Phone { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = Roles.Customer;
    public int BonusBalance { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class MenuItem
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public int Calories { get; set; }
    public string Category { get; set; } = string.Empty;
    public bool IsInStopList { get; set; }
}

public class Order
{
    public int Id { get; set; }
    public string Number { get; set; } = string.Empty;
    public int? CustomerId { get; set; }
    public User? Customer { get; set; }
    public int? OperatorId { get; set; }
    public string Status { get; set; } = OrderStatuses.New;
    public decimal TotalAmount { get; set; }
    public int BonusAccrued { get; set; }
    public string? Comment { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<OrderItem> Items { get; set; } = [];
    public Payment? Payment { get; set; }
}

public class OrderItem
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public int MenuItemId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal PurchasePrice { get; set; }
    public int Quantity { get; set; }
}

public class Payment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public Order? Order { get; set; }
    public string Method { get; set; } = "Card";
    public decimal Amount { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Promotion
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public int DiscountPercent { get; set; }
    public bool IsActive { get; set; } = true;
}
