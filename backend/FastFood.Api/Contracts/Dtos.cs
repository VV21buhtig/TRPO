namespace FastFood.Api.Contracts;

public record LoginRequest(string Phone, string Password);
public record SmsCodeRequest(string Phone);
public record SmsLoginRequest(string Phone, string Code);
public record RefreshRequest(string RefreshToken);

public record OrderItemRequest(int MenuItemId, int Quantity);
public record CreateOrderRequest(List<OrderItemRequest> Items, string? Comment);
public record UpdateStatusRequest(string Status, string? Comment = null);
public record StopListRequest(bool InStopList);

public record PaymentRequest(int OrderId, string Method);
public record SpendBonusRequest(int Amount);
public record UpdateProfileRequest(string Name);
public record CreatePromotionRequest(
    string Title,
    int DiscountPercent,
    string? Scope = null,
    string? Category = null,
    int? MenuItemId = null);
public record UpdatePromotionRequest(
    string? Title,
    int? DiscountPercent,
    bool? IsActive,
    string? Scope = null,
    string? Category = null,
    int? MenuItemId = null);
public record CreateStaffRequest(string Name, string Phone, string Password, string? Role);
public record UpdateStaffActiveRequest(bool IsActive);
