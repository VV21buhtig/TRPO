using System.Security.Claims;
using System.Text;
using FastFood.Api.Data;
using FastFood.Api.Endpoints;
using FastFood.Api.Hubs;
using FastFood.Api.Models;
using FastFood.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=fastfood.db";
var usePostgres = builder.Configuration.GetValue<bool>("UsePostgres")
    || connectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (usePostgres)
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});

builder.Services.AddSingleton<TokenService>();
builder.Services.AddSignalR();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Онлайн-заказ API",
        Version = "v1",
        Description = """
            Единый REST API программного комплекса «Онлайн-заказ».
            Обслуживает веб-клиент, Electron-приложение оператора и Flutter-клиент.

            Авторизация: JWT Bearer. Получите токен через POST /api/v1/auth/login,
            нажмите Authorize и вставьте accessToken.
            """,
        Contact = new OpenApiContact
        {
            Name = "Учебный проект ПМ.02",
            Url = new Uri("https://github.com/"),
        },
    });

    var bearer = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Вставьте accessToken, полученный при входе.",
    };
    options.AddSecurityDefinition("Bearer", bearer);
    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = new List<string>(),
    });
});

builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
    .SetIsOriginAllowed(_ => true)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
});

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? "dev-super-secret-key-for-fastfood-prototype-2026";

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "FastFood.Api",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "FastFood.Clients",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(60),
        };

        // Токен для SignalR передаётся в query-параметре access_token.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var token = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) &&
                    context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
                {
                    context.Token = token;
                }

                return Task.CompletedTask;
            },
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Customer", p => p.RequireRole(Roles.Customer));
    options.AddPolicy("Staff", p => p.RequireRole(Roles.Operator, Roles.Admin));
    options.AddPolicy("Admin", p => p.RequireRole(Roles.Admin));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await Seed.EnsureSeededAsync(db);
}

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.DocumentTitle = "Онлайн-заказ API — Swagger";
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Онлайн-заказ API v1");
});
app.UseForwardedHeaders();
app.UseCors();
app.UseAuthentication();

// Заблокированный сотрудник теряет доступ сразу, не дожидаясь истечения JWT.
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true &&
        int.TryParse(context.User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
    {
        var db = context.RequestServices.GetRequiredService<AppDbContext>();
        var isActive = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.IsActive)
            .FirstOrDefaultAsync();
        if (!isActive)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new { error = "Учётная запись заблокирована" });
            return;
        }
    }

    await next();
});

app.UseAuthorization();

app.MapApi();
app.MapHub<OrdersHub>("/hubs/orders");

app.Run();
