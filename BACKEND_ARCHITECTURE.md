# Backend Architecture Summary - eCommerce Microservices

## Overview

The backend is a **microservices architecture** built on **Cloudflare Workers** with **Durable Objects** for stateful operations. It follows a **gateway pattern** where all client requests go through a single API gateway that routes to specialized microservices.

## Architecture Pattern

```
Client Request
    ↓
Gateway Worker (API Gateway)
    ↓
Service Routing (Service Bindings or URLs)
    ↓
Microservices (Workers)
    ↓
Durable Objects / D1 Database / KV Storage
```

## Core Components

### 1. **Gateway Worker** (`gateway-worker/`)
**Role**: API Gateway - Single entry point for all client requests

**Responsibilities**:
- Routes incoming requests to appropriate microservices
- Handles authentication/authorization (JWT validation)
- Manages CORS headers
- Implements distributed tracing (OpenTelemetry)
- Provides timeout protection and error handling
- Acts as a reverse proxy with service discovery

**Key Features**:
- **Service Bindings**: Uses Cloudflare Service Bindings for internal communication (faster, no network overhead)
- **URL Fallback**: Falls back to HTTP URLs if service bindings unavailable
- **Distributed Tracing**: Propagates trace context across services for observability
- **Timeout Protection**: Prevents hanging requests with configurable timeouts

**Routing**:
- `/api/auth/*` → `AUTH_SERVICE` (auth-worker)
- `/api/products/*` → `PRODUCTS_SERVICE` (product-worker)
- `/api/cart/*` → Cart Durable Objects (via cart-worker)
- `/api/orders/*` → `ORDER_SERVICE` (order-worker)
- `/api/checkout/*` → Payment & Order services
- `/api/admin/*` → Admin operations with HMAC signing

### 2. **Auth Worker** (`auth-worker/`)
**Role**: Authentication and User Management

**Responsibilities**:
- User registration and login
- JWT token generation and validation
- User profile management
- Address management
- Session management
- Admin user creation and promotion

**Storage**: D1 Database (SQLite)

**Key Endpoints**:
- `POST /auth/signup` - User registration
- `POST /auth/login` - User authentication
- `GET /auth/me` - Get current user (includes addresses)
- `POST /auth/addresses` - Create address
- `GET /auth/addresses` - List user addresses

### 3. **Cart Worker** (`cart-worker/`)
**Role**: Shopping Cart Management

**Architecture**: Uses **Durable Objects** for stateful cart storage

**How It Works**:
1. **Top-level Worker** (`index.js`): Receives requests and routes to appropriate Durable Object
2. **Cart Durable Object** (`CartDurableObject.js`): Each cart is a separate Durable Object instance
   - Persistent state in Durable Object storage
   - Automatic expiration (TTL-based)
   - Stateful operations (add, update, remove items)
   - Cart summary calculation (subtotal, tax, shipping, discount, total)

**Key Features**:
- **Per-cart isolation**: Each cart ID gets its own Durable Object
- **State persistence**: Cart state persists across requests
- **Automatic expiration**: Carts expire after TTL (prevents storage bloat)
- **Real-time calculations**: Recalculates summary on every operation
- **Coupon support**: Integrates with DISCOUNT_KV for coupon validation
- **Shipping integration**: Calls fulfillment-worker for shipping options

**Cart Operations**:
- `POST /cart/init` - Initialize new cart
- `GET /cart/summary` - Get cart with calculated summary
- `POST /cart/add` - Add item to cart
- `POST /cart/update` - Update item quantity
- `POST /cart/remove` - Remove item
- `POST /cart/clear` - Clear all items
- `POST /cart/address` - Set shipping address
- `GET /cart/shipping-options` - Get available shipping methods
- `POST /cart/shipping` - Select shipping method
- `POST /cart/coupon/apply` - Apply discount coupon
- `POST /cart/coupon/remove` - Remove coupon

**Cart Summary Calculation**:
- Subtotal: Sum of all items (price × quantity)
- Tax: Calculated based on address (if available)
- Shipping: From selected shipping method
- Discount: From applied coupon
- Total: Subtotal + Tax + Shipping - Discount

### 4. **Product Worker** (`product-worker/`)
**Role**: Product Catalog Management

**Responsibilities**:
- Product CRUD operations
- Product listing with pagination
- Product search and filtering
- Image upload and management
- Product metadata management

**Storage**: D1 Database

**Key Endpoints**:
- `GET /products` - List products (with pagination)
- `GET /products/:id` - Get product details
- `POST /products` - Create product (admin)
- `PUT /products/:id` - Update product (admin)
- `DELETE /products/:id` - Delete product (admin)

### 5. **Inventory Worker** (`inventory-worker/`)
**Role**: Inventory Management

**Responsibilities**:
- Stock level tracking
- Inventory updates
- Stock availability checks
- Inventory reservations

**Storage**: D1 Database

### 6. **Order Worker** (`order-worker/`)
**Role**: Order Processing

**Responsibilities**:
- Order creation
- Order status management
- Order history
- Order details retrieval

**Storage**: D1 Database

**Key Endpoints**:
- `GET /orders/user/:userId` - Get user orders
- `GET /orders/:orderId` - Get order details
- `POST /orders` - Create order (internal)

### 7. **Payment Worker** (`payment-worker/`)
**Role**: Payment Processing

**Responsibilities**:
- PayPal integration
- Payment capture
- Payment status tracking
- Refund processing

**Storage**: D1 Database

**Key Endpoints**:
- `POST /payment/paypal/create` - Create PayPal order
- `POST /payment/paypal/capture` - Capture PayPal payment
- `GET /payment/:paymentId` - Get payment status

### 8. **Fulfillment Worker** (`fulfillment-worker/`)
**Role**: Shipping and Fulfillment

**Responsibilities**:
- Shipping rate calculation
- Shipping method options
- Address validation
- Shipping label generation

**Storage**: D1 Database

## Communication Patterns

### 1. **Service Bindings** (Preferred)
- Direct binding between Workers (no network overhead)
- Faster than HTTP calls
- Automatic service discovery
- Example: `env.AUTH_SERVICE.fetch(...)`

### 2. **HTTP URLs** (Fallback)
- Used when service bindings unavailable
- Standard HTTP requests
- Example: `fetch('https://auth-worker.workers.dev/auth/login')`

### 3. **Durable Objects** (Stateful Services)
- Used for cart management
- Each cart is a separate DO instance
- Direct communication via DO stubs
- Example: `env.CART_DO.get(id).fetch(...)`

### 4. **KV Storage** (Key-Value)
- Used for coupons/discounts
- Fast read/write operations
- TTL-based expiration
- Example: `env.DISCOUNT_KV.get('discount:SAVE10')`

### 5. **D1 Database** (SQLite)
- Used for persistent data (users, products, orders, inventory)
- SQL queries
- Transactions support
- Example: `env.DB.prepare('SELECT * FROM users')`

## Request Flow Example: Add to Cart

```
1. Client → POST /api/cart/:cartId/add
   ↓
2. Gateway Worker
   - Validates request
   - Extracts user context (if authenticated)
   - Routes to cart-worker
   ↓
3. Cart Worker (Top-level)
   - Gets cartId from URL
   - Creates/gets Durable Object stub for that cartId
   - Forwards request to Cart Durable Object
   ↓
4. Cart Durable Object
   - Loads cart state from storage
   - Validates product (calls product-worker if needed)
   - Adds item to cart
   - Recalculates cart summary
   - Persists updated cart
   - Returns cart with summary
   ↓
5. Response flows back through chain
   Gateway → Client
```

## Authentication & Authorization

### Authentication Flow:
1. User logs in via `/api/auth/login`
2. Auth-worker validates credentials
3. Returns JWT token
4. Client stores token in localStorage
5. Subsequent requests include `Authorization: Bearer <token>`

### Authorization:
- **Public Routes**: Products, Cart (guest), Health checks
- **Authenticated Routes**: User profile, Orders, Checkout
- **Admin Routes**: Product management, Order management, Coupon management
  - Uses HMAC signing for internal admin operations
  - Requires `x-admin-secret` header or admin role

### User Context Propagation:
- Gateway extracts user from JWT
- Passes user context to services via headers:
  - `x-user-id`: User ID
  - `x-user-role`: User role (user/admin)
  - `x-session-id`: Session ID

## Data Storage

### Durable Objects (Cart State)
- **Purpose**: Stateful cart data
- **Storage**: In-memory + persistent storage
- **TTL**: Configurable (default: 7 days)
- **Isolation**: One DO per cart ID

### D1 Database (Persistent Data)
- **Purpose**: Users, Products, Orders, Inventory
- **Type**: SQLite (Cloudflare D1)
- **Schema**: Managed via migrations
- **Transactions**: Supported

### KV Storage (Coupons)
- **Purpose**: Discount codes
- **Structure**: `discount:{code}` → `{type, value, expiresAt, minCart}`
- **TTL**: Automatic expiration based on `expiresAt`

## Error Handling

### Gateway Level:
- Timeout protection (prevents hanging requests)
- Service unavailable handling
- Error response standardization
- Distributed tracing error recording

### Service Level:
- Input validation
- Business logic validation
- Database error handling
- External service error handling

### Error Response Format:
```json
{
  "error": "error_code",
  "message": "Human-readable message",
  "details": { /* Additional context */ }
}
```

## Observability

### Distributed Tracing:
- OpenTelemetry integration
- Trace context propagation across services
- Span creation for each request
- Error and performance tracking

### Logging:
- Structured logging with service names
- Request/response logging
- Error logging with stack traces
- Performance metrics

## Deployment

### Environments:
- **Staging**: Deployed from `develop` branch
- **Production**: Deployed from `main` branch

### CI/CD Pipeline:
1. PR to `develop` → Lint, Tests, Coverage check
2. Merge to `develop` → Deploy to staging → Integration tests
3. Auto-merge to `main` → Deploy to production → Integration tests
4. Slack notifications for deployments

### Service Configuration:
- Each service has `wrangler.jsonc` with:
  - Service bindings
  - Environment variables
  - KV namespaces
  - Durable Object bindings
  - D1 database bindings

## Key Design Decisions

1. **Microservices**: Separation of concerns, independent scaling
2. **Durable Objects for Cart**: Stateful, isolated, persistent cart state
3. **Gateway Pattern**: Single entry point, centralized routing
4. **Service Bindings**: Fast internal communication
5. **JWT Authentication**: Stateless, scalable auth
6. **OpenTelemetry**: Distributed tracing for debugging
7. **TTL-based Expiration**: Automatic cleanup of old carts
8. **HMAC Signing**: Secure internal admin operations

## Performance Optimizations

1. **Service Bindings**: Zero network overhead for internal calls
2. **Durable Objects**: Fast in-memory access with persistence
3. **KV Storage**: Fast coupon lookups
4. **Timeout Protection**: Prevents resource exhaustion
5. **Connection Pooling**: D1 database connection reuse
6. **Response Caching**: Where applicable

## Security Features

1. **JWT Authentication**: Secure token-based auth
2. **HMAC Signing**: Internal service authentication
3. **CORS Headers**: Controlled cross-origin access
4. **Input Validation**: Schema-based validation
5. **SQL Injection Prevention**: Parameterized queries
6. **Rate Limiting**: (Can be added at gateway level)

## Scalability

- **Horizontal Scaling**: Each Worker can scale independently
- **Durable Objects**: Automatically distributed across Cloudflare edge
- **Stateless Services**: Most services are stateless (except cart DO)
- **Database Scaling**: D1 can handle high read/write loads
- **Edge Computing**: Workers run at Cloudflare edge locations

