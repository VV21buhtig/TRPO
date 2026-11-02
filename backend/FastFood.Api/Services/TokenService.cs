using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FastFood.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace FastFood.Api.Services;

public class TokenService(IConfiguration config)
{
    private readonly string _key = config["Jwt:Key"]
        ?? throw new InvalidOperationException("Не задан Jwt:Key в конфигурации");
    private readonly string _issuer = config["Jwt:Issuer"] ?? "FastFood.Api";
    private readonly string _audience = config["Jwt:Audience"] ?? "FastFood.Clients";

    public (string Access, string Refresh) Create(User user)
        => (Build(user, "access", TimeSpan.FromMinutes(15)),
            Build(user, "refresh", TimeSpan.FromDays(30)));

    private string Build(User user, string type, TimeSpan lifetime)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role),
            new(ClaimTypes.MobilePhone, user.Phone),
            new("token_type", type),
        };

        var creds = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.Add(lifetime),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public ClaimsPrincipal? Validate(string token, string expectedType)
    {
        var handler = new JwtSecurityTokenHandler();
        try
        {
            var principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = _issuer,
                ValidateAudience = true,
                ValidAudience = _audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_key)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            }, out _);

            return principal.FindFirstValue("token_type") == expectedType ? principal : null;
        }
        catch
        {
            return null;
        }
    }
}
