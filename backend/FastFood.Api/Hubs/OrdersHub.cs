using Microsoft.AspNetCore.SignalR;

namespace FastFood.Api.Hubs;

public class OrdersHub : Hub
{
    public const string OperatorsGroup = "operators";

    public Task JoinOperators() => Groups.AddToGroupAsync(Context.ConnectionId, OperatorsGroup);

    public Task JoinOrder(string orderNumber)
        => Groups.AddToGroupAsync(Context.ConnectionId, $"order:{orderNumber}");
}
