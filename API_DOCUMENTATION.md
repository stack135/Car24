# Car24 Rental Platform API Documentation

## Overview
Complete secure QR-based advance payment system for car rental platform with Node.js, Express.js, and PostgreSQL.

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected routes require JWT token in Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## API Endpoints

### 1. Authentication

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "9876543210",
  "role": "user"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 2. Owner Management

#### Register as Owner
```http
POST /owners/register
Authorization: Bearer <token>
Content-Type: application/json

{
  "businessName": "ABC Car Rentals",
  "businessLicense": "BL123456789",
  "panNumber": "ABCDE1234F",
  "gstNumber": "12ABCDE3456F1Z5",
  "bankAccountNumber": "1234567890123456",
  "ifscCode": "SBIN0001234",
  "upiId": "owner@paytm"
}
```

#### Approve Owner (Admin)
```http
PATCH /owners/1/approval
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "approvalStatus": "approved"
}
```

### 3. Car Management

#### Add Car (Owner)
```http
POST /cars
Authorization: Bearer <owner_token>
Content-Type: application/json

{
  "ownerId": 1,
  "branchId": 1,
  "make": "Toyota",
  "model": "Innova",
  "year": 2023,
  "category": "suv",
  "transmission": "manual",
  "fuelType": "Diesel",
  "seatingCapacity": 7,
  "licensePlate": "MH01AB1234",
  "features": ["AC", "GPS", "Bluetooth"]
}
```

#### Set Car Pricing (Admin)
```http
POST /car-pricing
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "carId": 1,
  "duration": 6,
  "price": 500
}
```

### 4. Booking System

#### Create Booking with QR Payment
```http
POST /bookings
Authorization: Bearer <token>
Content-Type: application/json

{
  "carId": 1,
  "branchId": 1,
  "pickupDate": "2024-03-15",
  "pickupTime": "10:00:00",
  "dropoffDate": "2024-03-15",
  "dropoffTime": "16:00:00",
  "duration": 6,
  "pickupLocation": "Main Branch",
  "dropoffLocation": "Main Branch"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "awaiting_payment",
    "totalPrice": "500.00",
    "advanceAmount": "100.00",
    "remainingAmount": "400.00",
    "confirmationNumber": "CAR24-1234567890ABC"
  },
  "payment": {
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "upiLink": "upi://pay?pa=car24@paytm&pn=Car24%20Travels&am=100.00&cu=INR&tn=Car24%20Booking%20%231",
    "amount": "100.00",
    "expiresAt": "2024-03-15T10:10:00.000Z"
  }
}
```

### 5. Payment Verification

#### Verify Advance Payment
```http
POST /payments/verify
Authorization: Bearer <token>
Content-Type: multipart/form-data

bookingId: 1
transactionId: TXN123456789
paymentMethod: UPI
paymentScreenshot: [file]
```

### 6. Ride Management

#### Start Ride
```http
PATCH /rides/start/1
Authorization: Bearer <token>
```

#### End Ride
```http
PATCH /rides/end/1
Authorization: Bearer <token>
```

### 7. Cancellation & Refunds

#### Cancel Booking
```http
DELETE /bookings/1/cancel
Authorization: Bearer <token>
```

**Refund Rules:**
- >24 hours before pickup: 100% refund
- 12-24 hours before pickup: 50% refund
- <12 hours before pickup: No refund

### 8. Admin Controls

#### Get All Bookings
```http
GET /bookings
Authorization: Bearer <admin_token>
```

#### Get Payment History
```http
GET /payments
Authorization: Bearer <admin_token>
```

#### Process Refund
```http
PATCH /refunds/1/process
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "refundStatus": "processed",
  "refundTransactionId": "REF123456789"
}
```

## Security Features

1. **Rate Limiting**: 
   - Global: 1000 requests per 15 minutes
   - Booking: 5 requests per 15 minutes
   - Payment: 10 requests per 15 minutes

2. **Input Validation**: All inputs validated using express-validator

3. **Duplicate Prevention**:
   - No duplicate bookings for same car/time
   - No duplicate transaction IDs

4. **Auto-Expiry**: Bookings expire after 10 minutes if payment not completed

5. **File Upload Security**: Payment screenshots with size/type validation

## Database Schema

### Tables Created:
- `users` - User accounts
- `owners` - Car owner profiles
- `branches` - Rental branches
- `cars` - Car inventory
- `car_pricing` - Pricing for different durations
- `bookings` - Rental bookings
- `payments` - Payment records
- `refunds` - Refund records
- `rides` - Active ride tracking

## Error Handling

All API responses follow this format:
```json
{
  "success": boolean,
  "message": "string",
  "data": object,
  "errors": array
}
```

## Environment Variables

```env
PORT=5000
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=car24
PGUSER=postgres
PGPASSWORD=your_password
JWT_SECRET=your_jwt_secret
COMPANY_UPI_ID=car24@paytm
COMPANY_NAME=Car24 Travels
```

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start PostgreSQL database:
```bash
docker-compose up -d
```

3. Start server:
```bash
npm run server
```

4. API will be available at `http://localhost:5000`

## Testing Flow

1. Register admin user with role "admin"
2. Register owner and approve via admin
3. Add cars and set pricing
4. Register regular user
5. Create booking (gets QR code)
6. Verify payment
7. Start and end ride
8. Test cancellation and refunds