const express=require("express")
const router=express.Router()
const {pool,redis}=require("./connectdb")
const {veriftJWT,createJwt}=require("./jwt")
const minioClient = require("./minioConnect")
const rateLimiter = require("./rateLimiter")
const razorpay = require("./connectRazorPay") 
const crypto = require("crypto");
const sendNotification=require("./expoNotification")
const bookingQueue=require("./queues/bookingQueue")
require("dotenv").config()
function calculatePrice(slots, pricing) {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error("Slots are required");
  }

  const { six_hr_price, twelve_hr_price, twentyfour_hr_price } = pricing;

  if (!six_hr_price || !twelve_hr_price || !twentyfour_hr_price) {
    throw new Error("Incomplete pricing configuration");
  }

  // ── Total hours from slots array ──
  const totalHours = slots.reduce((sum, s) => sum + s, 0);

  // ── Smart breakdown ──
  let remaining  = totalHours;
  let totalPrice = 0;

  const days     = Math.floor(remaining / 24);
  totalPrice    += days * twentyfour_hr_price;
  remaining     -= days * 24;

  const halfDays = Math.floor(remaining / 12);
  totalPrice    += halfDays * twelve_hr_price; 
  remaining     -= halfDays * 12;

  const sixHrs   = Math.floor(remaining / 6);
  totalPrice    += sixHrs * six_hr_price;

  console.log(`Smart pricing:
    Total hours : ${totalHours}
    24hr slots  : ${days}     × ₹${twentyfour_hr_price} = ₹${days * twentyfour_hr_price}
    12hr slots  : ${halfDays} × ₹${twelve_hr_price}     = ₹${halfDays * twelve_hr_price}
    6hr slots   : ${sixHrs}   × ₹${six_hr_price}        = ₹${sixHrs * six_hr_price}
    Subtotal    : ₹${totalPrice}
  `);

  const platformFee = Math.ceil(totalPrice * 0.0236);
  const finalAmount = totalPrice + platformFee;

  return finalAmount;
}
async function paymentfunction(amount, bookingId) {
  const order=await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
    receipt: `booking_${bookingId}`
  })  
  return order
}
function calculateAdvanceAmount(totalHours) {
  let remaining = totalHours;
  console.log("totalHours=",totalHours)
  let advance = 0;

  const days = Math.floor(remaining / 24);
  advance += days * 500;
  remaining -= days * 24;

  const halfDays = Math.floor(remaining / 12);
  advance += halfDays * 500;
  remaining -= halfDays * 12;

  const sixHrs = Math.floor(remaining / 6);
  advance += sixHrs * 400;

  console.log(`Smart Advance Calculation:
    Total hours : ${totalHours}
    24hr blocks : ${days}     × ₹500 = ₹${days * 500}
    12hr blocks : ${halfDays} × ₹500 = ₹${halfDays * 500}
    6hr blocks  : ${sixHrs}   × ₹500 = ₹${sixHrs * 400}
    Total Advance : ₹${advance}
  `);

  return advance;
}
router.post("/bookCar", rateLimiter, async (req, res) => {
  const client  = await pool.connect();
  const { carId, branchId, slots, startTime, endTime, useCredits } = req.body;
  
  const lockKey = `lock:car:${carId}`;

  console.log('=== BookCar Request ===');
  console.log('Body:', { carId, branchId, slots, startTime, endTime, useCredits });

  try {
    // ── 1. Extract and Verify JWT Token ──
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "Missing authorization headers" });
    }
    
    const token = header.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token not found" });
    }

    const payload = await veriftJWT(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userId = payload.id; 
    // ── 1. Redis lock ──
    const lock = await redis.set(lockKey, userId, "NX", "EX", 15);
    console.log('Lock acquired:', lock);

    if (!lock) {
      return res.status(409).json({ message: "Another user is booking this car" });
    }

    await client.query("BEGIN");

    // ── 2. Validate max 30 days (FIX 2) ──
    const pickupDate  = new Date(startTime);
    const dropoffDate = new Date(endTime);
    const diffDays    = (dropoffDate - pickupDate) / (1000 * 60 * 60 * 24);
    
    if (diffDays > 30) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Maximum booking duration is 30 days" });
    }

    // ── 3. Clean up old pending bookings (FIX 1 - You did this perfectly) ──
    await client.query(`
      DELETE FROM bookings 
      WHERE status = 'pending' 
      AND "createdAt" < NOW() - INTERVAL '15 minutes'
      AND "carId" = $1
    `, [carId]);

    // ── 4. Get user credits ──
    let creditsData = { rows: [] };
    if (useCredits) {
      creditsData = await client.query(
        `SELECT id, remaining_amount, expiry_date
         FROM user_credit
         WHERE user_id = $1
           AND remaining_amount > 0
           AND expiry_date > NOW()
         ORDER BY expiry_date ASC
         FOR UPDATE`,
        [userId]
      );
      console.log('Available credits:', creditsData.rows);
    }

    // ── 5. Get car pricing ──
    const carPrice = await client.query(
      `SELECT six_hr_price, twelve_hr_price, twentyfour_hr_price 
       FROM cars WHERE id=$1`,
      [carId]
    ); 
    console.log('Car pricing:', carPrice.rows[0]);

    if (carPrice.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Car not found" });
    }

    const pricing = carPrice.rows[0];

    if (!pricing.six_hr_price || !pricing.twelve_hr_price || !pricing.twentyfour_hr_price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Pricing not configured for this car" });
    }

    // ── 6. Calculate price ──
    console.log('Slots:', slots);
    const price         = calculatePrice(slots, pricing);
    const totalHours = slots.reduce((sum, s) => sum + s, 0);
    const advanceAmount = calculateAdvanceAmount(totalHours);
    console.log('Base price:', price);
    console.log('Advance amount:', advanceAmount);

    // ── 7. Apply credits to ADVANCE ONLY ──
    let usedCredits  = 0;
    let advancePayable = advanceAmount; 

    if (useCredits && creditsData.rows.length > 0) {
      for (let credit of creditsData.rows) {
        if (advancePayable <= 0) break;
        const available = parseFloat(credit.remaining_amount);
        if (available <= advancePayable) {
          advancePayable -= available;
          usedCredits    += available;
        } else {
          usedCredits    += advancePayable;
          advancePayable  = 0;
        }
      }
    }

    console.log('Credits used:', usedCredits);
    console.log('Advance payable after credits:', advancePayable);

    // ── 8. Create booking ──
    const bookingResult = await client.query(
      `INSERT INTO bookings (
        "userId", "carId", "branchId",
        "pickupDate", "dropoffDate",
        "totalPrice", "status", "payment_status",
        "advance_paid", "remaining_amount", "credits_used",
        "createdAt", "updatedAt"
      )
      VALUES ($1,$2,$3,$4,$5,$6,'pending','pending', 0, $6, $7, NOW(),NOW())
      RETURNING id`,
      [
        userId,       // $1
        carId,        // $2
        branchId,     // $3
        startTime,    // $4
        endTime,      // $5
        price,        // $6
        usedCredits,  // $7 
      ]
    );

    const bookingId = bookingResult.rows[0].id;
    console.log('Booking created:', bookingId);

    // ── 9. Credits cover full advance — no Razorpay needed (FIX 3) ──
    if (advancePayable === 0) {
      const otp = Math.floor(100000 + Math.random() * 900000);

      // Deduct credits immediately
      let remainingToDeduct = usedCredits;
      for (let credit of creditsData.rows) {
        if (remainingToDeduct <= 0) break;
        const available = parseFloat(credit.remaining_amount);
        if (available <= remainingToDeduct) {
          remainingToDeduct -= available;
          await client.query(
            `UPDATE user_credit SET remaining_amount = 0 WHERE id = $1`,
            [credit.id]
          );
        } else {
          await client.query(
            `UPDATE user_credit SET remaining_amount = remaining_amount - $1 WHERE id = $2`,
            [remainingToDeduct, credit.id]
          );
          remainingToDeduct = 0;
        }
      }

      // 💥 FIXED SQL QUERY: No trailing comma, correct variables mapped!
      await client.query(
        `UPDATE bookings 
         SET status = 'confirmed', 
             payment_status = 'partial_paid', 
             "confirmationNumber" = $1,  
             advance_paid = $2,
             remaining_amount = $3
         WHERE id = $4`,
        [otp, advanceAmount, price - advanceAmount, bookingId] // 💥 Array perfectly matches $1, $2, $3, $4
      );

      await client.query("COMMIT");
      console.log('=== Advance covered by Credits ===');

      return res.status(200).json({
        message:       "Advance covered by credits!",
        bookingId,
        price,
        advanceAmount,
        usedCredits,
        advancePayable: 0,
        order:          null,  // no Razorpay
      });
    }

    // ── 10. Create Razorpay order for remaining advance ──
    console.log('Creating Razorpay order for amount:', advancePayable);
    const order = await paymentfunction(advancePayable, bookingId);
    console.log('Razorpay order:', order?.id);

    // Save order id
    await client.query(
      `UPDATE bookings SET "paymentId" = $1 WHERE id = $2`,
      [order.id, bookingId]
    );

    await client.query("COMMIT");
    console.log('=== BookCar Success ===');

    return res.status(200).json({
      message:       "Booking created",
      bookingId,
      price,
      advanceAmount,
      usedCredits,
      advancePayable,  
      order,
    });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error('=== BookCar Error ===');
    console.error('Message:', e?.message);

    return res.status(500).json({
      message: "internal server error",
      error:   e?.message ?? String(e),
    });

  } finally {
    await redis.del(lockKey);
    client.release();
  }
});
router.post("/verify-payment", async (req, res) => {
  const client = await pool.connect();

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing payment details" });
    }

    // ── Verify signature ──
    const generated_signature = crypto
      .createHmac("sha256", process.env.RazorpayKeySecret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ message: "Invalid payment signature" });
    }

    await client.query("BEGIN");

    // ── Get booking with EXPLICIT columns — no casing issues ──
    const bookingRes = await client.query(
      `SELECT 
        id,
        "userId",
        "totalPrice",
        "paymentId",
        payment_status,
        advance_paid,
        remaining_amount,
        credits_used,
        "pickupDate",   -- 💥 Added to calculate total hours
        "dropoffDate"   -- 💥 Added to calculate total hours
       FROM bookings 
       WHERE "paymentId" = $1`,
      [razorpay_order_id]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = bookingRes.rows[0];
    console.log('Booking fetched:', booking);

    // ── Idempotency check ──
    if (booking.payment_status === "partial_paid") {
      return res.json({ message: "Payment already processed" });
    }

    // ── Calculate amounts — now totalPrice is correct casing ──
    const totalPrice = Number(booking.totalPrice);
    const pickupDate = new Date(booking.pickupDate);
    const dropoffDate = new Date(booking.dropoffDate);
    const totalHours = Math.ceil((dropoffDate - pickupDate) / (1000 * 60 * 60));

    // 💥 Get the exact same advance amount using our new function!
    const advance    = calculateAdvanceAmount(totalHours);
    const remaining  = totalPrice - advance;
    const otp        = Math.floor(100000 + Math.random() * 900000);

    console.log('totalPrice:', totalPrice);
    console.log('advance:', advance);
    console.log('remaining:', remaining);

    // ── Deduct credits if used ──
    const creditsToDeduct = Number(booking.credits_used || 0);
    console.log('Credits to deduct:', creditsToDeduct);

    if (creditsToDeduct > 0) {
      let remainingToDeduct = creditsToDeduct;

      const creditsData = await client.query(
        `SELECT id, remaining_amount
         FROM user_credit
         WHERE user_id = $1
           AND remaining_amount > 0
           AND expiry_date > NOW()
         ORDER BY expiry_date ASC
         FOR UPDATE`,
        [booking.userId]  // ← now correct because explicit SELECT
      );

      console.log('Credits rows:', creditsData.rows);

      for (let credit of creditsData.rows) {
        if (remainingToDeduct <= 0) break;
        const available = parseFloat(credit.remaining_amount);
        if (available <= remainingToDeduct) {
          remainingToDeduct -= available;
          await client.query(
            `UPDATE user_credit SET remaining_amount = 0 WHERE id = $1`,
            [credit.id]
          );
        } else {
          await client.query(
            `UPDATE user_credit SET remaining_amount = remaining_amount - $1 WHERE id = $2`,
            [remainingToDeduct, credit.id]
          );
          remainingToDeduct = 0;
        }
      }
      console.log('Credits deducted successfully');
    }

    // ── Update booking ──
    await client.query(
      `UPDATE bookings
       SET
         status                = 'confirmed',
         payment_status        = 'partial_paid',
         advance_paid          = $1,
         remaining_amount      = $2,
         "razorpay_payment_id" = $3,
         "updatedAt"           = NOW(),
         "confirmationNumber"  = $4
       WHERE "paymentId" = $5`,
      [advance, remaining, razorpay_payment_id, otp, razorpay_order_id]
    );

    await client.query("COMMIT");
        console.log(`✅ Booking ${booking.id} confirmed`);

    const userRes=await client.query(
      `SELECT * FROM  users WHERE id=$1`,[bookingRes.rows[0].userId]
          )
        if(userRes.rows.length===0){

        return res.status(400).json({message:"user not found"})
          }
          userData=userRes.rows[0]
      const expoToken=userData.expo_token

    

    res.json({
      message:   "Payment verified successfully",
      bookingId: booking.id,
      otp,
    });


          if (expoToken) {
        try {
          const data = {
            url: `/(customer)/booking/${booking.id}`, // ✅ important
            bookingId: booking.id
          };

          const expoSend = await sendNotification(
            expoToken,
            "Booking Confirmation",
            `Your booking confirmation number is ${otp}`,
            data
          );

          if (expoSend) {
            console.log("✅ Notification sent");
          } else {
            console.log("❌ Notification failed");
          }

        } catch (error) {
          console.error("🚨 Notification error:", error);
        }
      }

  } catch (err) {
    console.error('=== verify-payment ERROR ===');
    console.error('Message:', err.message);
    await client.query("ROLLBACK");
    res.status(500).json({ message: "Verification failed", error: err.message });
  } finally {
    client.release();
  }
});
router.post("/cancelBooking/:id", rateLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Get booking with explicit columns ──
    const bookingRes = await client.query(
      `SELECT 
        id,
        "userId",
        "totalPrice",
        status,
        payment_status,
        advance_paid,
        credits_used
       FROM bookings 
       WHERE id = $1`,
      [req.params.id]
    );

    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const booking = bookingRes.rows[0];
    console.log('Cancel booking:', booking);

    // ── Can't cancel if credits were used ──
    if (Number(booking.credits_used) > 0) {
      return res.status(400).json({
        message: "Bookings paid with credits cannot be cancelled"
      });
    }

    // ── Can't cancel if already completed/cancelled ──
    if (['completed', 'cancelled'].includes(booking.status)) {
      return res.status(400).json({
        message: `Booking already ${booking.status}`
      });
    }

    // ── Refund advance to credits if payment was done ──
    const advancePaid = Number(booking.advance_paid);

    if (booking.payment_status === 'partial_paid' && advancePaid > 0) {
      await client.query(
        `INSERT INTO user_credit (user_id, amount, remaining_amount, expiry_date, created_at)
         VALUES ($1, $2, $2, NOW() + INTERVAL '6 months', NOW())`,
        [booking.userId, advancePaid]  // ← correct casing now
      );
      console.log(`Refund ₹${advancePaid} added to credits for user ${booking.userId}`);
    }

    // ── Update booking status ──
    await client.query(
      `UPDATE bookings 
       SET status = 'cancelled', "updatedAt" = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    await client.query("COMMIT");

    res.json({
      message:           "Booking cancelled successfully",
      refundedToCredits: advancePaid > 0,
      refundAmount:      advancePaid,
    });

  } catch (e) {
    await client.query("ROLLBACK");
    console.error('cancelBooking error:', e.message);
    res.status(500).json({ message: "Internal server error", error: e.message });
  } finally {
    client.release();
  }
});
router.get("/getBooking/:id", rateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('=== getBooking ===', id);

    const result = await pool.query(`
      SELECT 
        b.*,
        c.model, 
        c.images, 
        c."fuelType",          
        c.transmission, 
        c."seatingCapacity",   
        c.colour,
        br.name as branch_name, 
        br.city as branch_city
      FROM bookings b
      JOIN ${process.env.cars_table} c ON b."carId" = c.id
      JOIN branches br ON b."branchId" = br.id
      WHERE b.id = $1
    `, [id]);

    console.log('Rows found:', result.rows.length);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    let booking = result.rows[0];

    // 💥 THE MAGIC: Convert filenames to Live URLs for this booking!
    if (booking.images && booking.images.length > 0) {
      const finalUrls = await Promise.all(booking.images.map(async (imgString) => {
        try {
          // Keep old Unsplash URLs exactly as they are
          if (imgString.startsWith("http://") || imgString.startsWith("https://")) {
            return imgString; 
          }
          
          // Generate secure MinIO URLs for new uploads
          return await minioClient.presignedGetObject("carimages", imgString, 24 * 60 * 60);
          
        } catch (err) {
          // 💥 NOW WE PRINT THE ACTUAL ERROR!
          console.error("Failed to generate URL for:", imgString, "👉 ACTUAL ERROR:", err.message ? err.message : err);
          return null; 
        }
      }));
      
      // Update the booking object with the live URLs
      booking.images = finalUrls.filter(url => url !== null);
    }

    // Send the updated booking object to the frontend
    res.json(booking);
    
  } catch (e) {
    console.error('getBooking error:', e.message);
    res.status(500).json({ message: "Internal server error", error: e.message });
  }
});
router.get("/myBookings", rateLimiter, async (req, res) => {
  try {
    // ── 1. Extract and Verify JWT Token ──
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "Missing authorization headers" });
    }
    
    const token = header.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token not found" });
    }

    const payload = await veriftJWT(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userId = payload.id; 

    // ── 2. Fetch Bookings for this Specific User ──
    const result = await pool.query(`
      SELECT 
        b.id, b."userId", b."carId", b."branchId", b."pickupDate",
        b."dropoffDate", b."totalPrice", b.status, b.payment_status,
        b.advance_paid, b.remaining_amount, b."paymentId",
        b."confirmationNumber", b."createdAt", b."updatedAt",
        b.razorpay_payment_id,
        c.model, c.images, c."fuelType", c.transmission, c."seatingCapacity",c."licensePlate",
        br.name as branch_name, br.city as branch_city
      FROM bookings b
      JOIN ${process.env.cars_table} c ON b."carId" = c.id
      JOIN branches br ON b."branchId" = br.id
      WHERE b."userId" = $1 AND b.status != 'pending'
      ORDER BY b."createdAt" DESC
    `, [userId]);

    // ── 3. Calculate display_status in JS ──
    const now = new Date();

    const mappedBookings = result.rows.map(b => {
      const pickup   = new Date(b.pickupDate);
      const dropoff  = new Date(b.dropoffDate);
      let display_status;

      if (b.status === 'cancelled') {
        display_status = 'cancelled';
      } else if (b.status === 'pending') {
        display_status = 'pending';
      } else if (dropoff < now) {
        display_status = 'completed';
      } else if (pickup <= now && dropoff >= now) {
        display_status = 'ongoing';
      } else if (pickup > now) {
        display_status = 'upcoming';
      } else {
        display_status = b.status;
      }

      return { ...b, display_status };
    });

    // 💥 4. THE MAGIC: Convert all filenames to Live URLs for the whole list!
    const finalBookings = await Promise.all(mappedBookings.map(async (booking) => {
      if (booking.images && booking.images.length > 0) {
        const liveUrls = await Promise.all(booking.images.map(async (imgString) => {
          try {
            // Keep old Unsplash URLs exactly as they are
            if (imgString.startsWith("http://") || imgString.startsWith("https://")) {
              return imgString; 
            }
            
            // Generate secure MinIO URLs for new uploads
            return await minioClient.presignedGetObject("carimages", imgString, 24 * 60 * 60);
          } catch (err) {
            console.error("Failed to generate URL for:", imgString);
            return null; // Fallback
          }
        }));
        
        booking.images = liveUrls.filter(url => url !== null);
      }
      return booking;
    }));

    console.log(`Bookings found for User ${userId}:`, finalBookings.length);
    res.json(finalBookings);

  } catch (e) {
    console.error('myBookings error:', e.message);
    res.status(500).json({ message: "Internal server error", error: e.message });
  }
});
router.get("/ownerBookings", rateLimiter, async (req, res) => {
  try {
    // ── 1. Extract and Verify JWT Token ──
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "Missing authorization headers" });
    }
    
    const token = header.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token not found" });
    }

    const payload = await veriftJWT(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // 💥 Boom! This is now the Owner's ID from their login token!
    const ownerId = payload.id; 

    // ── 2. Fetch Bookings for this Specific OWNER ──
    const result = await pool.query(`
      SELECT 
        b.id,
        b."userId",
        b."carId",
        b."branchId",
        b."pickupDate",
        b."dropoffDate",
        b."totalPrice",
        b.status,
        b.payment_status,
        b.advance_paid,
        b.remaining_amount,
        b."paymentId",
        b."confirmationNumber",
        b."createdAt",
        b."updatedAt",
        b.razorpay_payment_id,
        c.model,
        c.images,
        c."fuelType",
        c.transmission,
        c."seatingCapacity",
        c."licensePlate",
        br.name as branch_name,
        br.city as branch_city
      FROM bookings b
      JOIN ${process.env.cars_table} c ON b."carId" = c.id
      JOIN branches br ON b."branchId" = br.id
      WHERE c.ownerid = $1    -- 💥 THE FIX: Filter by the car's owner!
      ORDER BY b."createdAt" DESC
    `, [ownerId]);

    // ── Calculate display_status in JS — no enum conflict ──
    const now = new Date();

    const bookings = result.rows.map(b => {
      const pickup   = new Date(b.pickupDate);
      const dropoff  = new Date(b.dropoffDate);

      let display_status;

      if (b.status === 'cancelled') {
        display_status = 'cancelled';
      } else if (b.status === 'pending') {
        display_status = 'pending';
      } else if (dropoff < now) {
        display_status = 'completed';
      } else if (pickup <= now && dropoff >= now) {
        display_status = 'ongoing';
      } else if (pickup > now) {
        display_status = 'upcoming';
      } else {
        display_status = b.status;
      }

      return { ...b, display_status };
    });

    console.log(`Bookings found for Owner ${ownerId}:`, bookings.length);
    res.json(bookings);

  } catch (e) {
    console.error('ownerBookings error:', e.message);
    res.status(500).json({ message: "Internal server error", error: e.message });
  }
});
router.get("/myCredits", rateLimiter, async (req, res) => {
  try {
     const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "Missing authorization headers" });
    }
    
    const token = header.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Token not found" });
    }

    const payload = await veriftJWT(token);
    if (!payload) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    const userId = payload.id; // ← replace with JWT later

    const result = await pool.query(
      `SELECT 
        id,
        amount,
        remaining_amount,
        expiry_date,
        created_at,
        -- Is this expiring soon (within 30 days)?
        CASE WHEN expiry_date < NOW() + INTERVAL '30 days' 
             THEN true ELSE false 
        END as expiring_soon
       FROM user_credit
       WHERE user_id = $1
         AND remaining_amount > 0
         AND expiry_date > NOW()
       ORDER BY expiry_date ASC`,
      [userId]
    );

    // ── Total available ──
    const totalCredits = result.rows.reduce(
      (sum, row) => sum + Number(row.remaining_amount), 0
    );

    res.json({
      totalCredits,
      credits: result.rows,
    });

  } catch (e) {
    res.status(500).json({ message: "Internal server error", error: e.message });
  }
});
router.get("/checkAvailability", rateLimiter, async (req, res) => {
  try {
    const { carId, pickupDate, dropoffDate } = req.query;

    console.log('=== checkAvailability ===');
    console.log('carId:', carId);
    console.log('pickupDate:', pickupDate);
    console.log('dropoffDate:', dropoffDate);

    const result = await pool.query(`
      SELECT COUNT(*), array_agg(id) as booking_ids
      FROM bookings
      WHERE "carId" = $1
      AND status IN ('confirmed')
      AND "pickupDate" < $2
      AND "dropoffDate" > $3
    `, [carId, dropoffDate, pickupDate]);

    console.log('Conflicting count:', result.rows[0].count);
    console.log('Conflicting IDs:', result.rows[0].booking_ids);

    const isBooked = parseInt(result.rows[0].count) > 0;
    res.json({ available: !isBooked });

  } catch (e) {
    console.error('checkAvailability error:', e.message);
    res.status(500).json({ message: "Internal server error", error: e.message });
  }
});
router.get("/getStaffTasks", rateLimiter, async (req, res) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "missing headers" });

  const token = header.split(" ")[1];
  const payload = await veriftJWT(token);
  if (!payload) return res.status(401).json({ message: "invalid token" });
  
  if (payload.role !== "staff" && payload.role !== "subadmin" && payload.role !== "superadmin") {
    return res.status(403).json({ message: "unauthorized" });
  }

  try {
    // 💥 Just grab the raw data. No backend formatting required!
    const tasks = await pool.query(
      `
      SELECT 
        b.id AS booking_id,
        b."userId",
        b."pickupDate",
        b."dropoffDate",
        b.ride_start_time,
        b.ride_end_time,
        u.name AS customer_name,
        c.model AS car_model,
        c."licenseplate" AS car_plate
      FROM bookings b
      JOIN users u ON b."userId" = u.id
      JOIN cars c ON b."carId" = c.id
      WHERE (b.ride_start_time IS NULL AND b.status = 'confirmed') -- Pickups
         OR (b.ride_start_time IS NOT NULL AND b.ride_end_time IS NULL AND b.status = 'confirmed') -- Returns
      `
    );

    // Send the raw rows straight to the frontend!
    res.status(200).json(tasks.rows);

  } catch (err) {
    console.error("Staff Tasks Error:", err);
    res.status(500).json({ message: "internal server error" });
  }
});
router.get("/carKeyVerify", rateLimiter, async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "missing headers" });
    }
    
    const token = header.split(" ")[1];
    const payload = await veriftJWT(token);
    if (!payload) {
      return res.status(401).json({ message: "invalid token" });
    }

    // 💥 Safely check roles
    const allowedRoles = ["staff", "subadmin", "admin", "superadmin"];
    if (!allowedRoles.includes(payload.role)) {
      return res.status(403).json({ message: "unauthorized" });
    }

    const { bookingId, key, id } = req.query;

    // 1. Verify the Key
    const bookingQuery = await pool.query(
      `SELECT "confirmationNumber" FROM bookings WHERE id=$1`,
      [bookingId]
    );

    if (bookingQuery.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // 💥 FIXED BUG 1: Extract the actual string from the object!
    // Postgres sometimes lowercases columns depending on how they were created, so we check both.
    const dbKey = bookingQuery.rows[0].confirmationNumber || bookingQuery.rows[0].confirmationnumber;

    if (dbKey !== key) {
      return res.status(401).json({ message: "Invalid confirmation key" });
    }

    // 2. Get User Data
    if (id) {
      const userQuery = await pool.query(
        `SELECT * FROM ${process.env.table} WHERE id=$1`,
        [id]
      );
      
      if (userQuery.rows.length === 0) {
        return res.status(400).json({ message: "User data not found" });
      }

      const userData = userQuery.rows[0];

      const safeUserData = {
        name: userData.name,
        username: userData.username,
        email: userData.email,
        dob: userData.dob,
        mobileno: userData.mobileno,
        role: userData.role,
        is_verified: userData.is_verified,
        is_profile_completed: userData.is_profile_completed
      };

      // 3. Create the temporary action token for the staff member
      // 💥 FIXED BUG 2: Removed the non-existent 'slot' column!
      const actionPayload = {
        userId: id,
        staffId: payload.id,
        bookingId: bookingId
      };
      
      const actionToken = await createJwt(actionPayload);

      return res.status(200).json({ 
        userdata: safeUserData, 
        bookingToken: actionToken 
      });
    }

  } catch (err) {
    console.error("Key Verify Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});
router.put("/startRide", rateLimiter, async (req, res) => {
  try {
    // 1. Verify the Staff Member is logged in (using your default header token)
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: "missing headers" });
    
    const staffToken = header.split(" ")[1];
    const staffPayload = await veriftJWT(staffToken); 
    if (!staffPayload) return res.status(401).json({ message: "invalid staff token" });

    // 2. Grab the data from the frontend body!
    const { odometer, fuelLevel, bookingToken } = req.body;

    // 3. Verify the special Action Token (This proves they entered the correct OTP)
    if (!bookingToken) return res.status(401).json({ message: "missing booking token" });
    
    const actionPayload = await veriftJWT(bookingToken);
    
    // 💥 This is where it crashed before! Now it will find the bookingId perfectly.
    if (!actionPayload || !actionPayload.bookingId) {
      return res.status(401).json({ message: "invalid token" }); 
    }

    const startTime = new Date();

    // 4. Update the database
    const updated = await pool.query(
      `
      UPDATE bookings
      SET 
        ride_start_time = $1,
        extras = COALESCE(extras, '[]'::jsonb) || $2::jsonb
      WHERE id = $3
      RETURNING *
      `,
      [
        startTime, 
        JSON.stringify([{ type: 'handover_out', odometer, fuelLevel, time: startTime }]), 
        actionPayload.bookingId
      ]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.status(200).json({
      message: "Ride started successfully",
      data: updated.rows[0]
    });

  } catch (e) {
    console.error("Start Ride Error:", e);
    return res.status(500).json({ message: "internal server error" });
  }
});
router.put("/endRide/:bookingId", rateLimiter, async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "missing headers" });
    }
    
    const token = header.split(" ")[1];
    const payload = await veriftJWT(token);
    if (!payload) {
      return res.status(401).json({ message: "invalid token" });
    }

    // 💥 FIX 1: Safely check roles!
    const allowedRoles = ["staff", "subadmin", "superadmin", "admin"];
    if (!allowedRoles.includes(payload.role)) {
      return res.status(403).json({ message: "unauthorized" });
    }

    const { bookingId } = req.params;
    // 💥 FIX 4: Grab the checklist data from the frontend
    // 💥 THE FIX: Add the "|| {}" fallback!
    const { odometer, fuelLevel } = req.body || {}; 

    // Optional: Provide default fallback values if the frontend sends empty data
    const finalOdometer = odometer || "Not provided";
    const finalFuel = fuelLevel || "Not provided";

    // 💥 FIX 3: Get the scheduled dropoffDate, not ride_end_time!
    const booking = await pool.query(
      `SELECT "dropoffDate", "totalPrice" FROM bookings WHERE id=$1`,
      [bookingId]
    );

    if (booking.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const data = booking.rows[0];
    const expectedEnd = new Date(data.dropoffDate); 
    const actualEnd = new Date();
    
    // Ensure you actually have a calculatePenalty function defined in this file!
    const penalty = typeof calculatePenalty === 'function' 
      ? calculatePenalty(expectedEnd, actualEnd) 
      : 0; 
      
    // Note: Postgres returns columns lowercase unless wrapped in quotes. 
    // Usually it comes back as totalprice.
    const finalRemaining = Number(data.totalprice || data.totalPrice) + penalty;

    // 💥 FIX 2: Update ride_end_time and inject the extras!
    const updated = await pool.query(
      `
      UPDATE bookings
      SET 
        ride_end_time = $1,
        penalty_amount = $2,
        remaining_amount = $3
        -- Also saving the final Odometer & Fuel!
        ,extras = COALESCE(extras, '[]'::jsonb) || $4::jsonb
      WHERE id = $5
      RETURNING *
      `,
      [
        actualEnd, 
        penalty, 
        finalRemaining, 
        JSON.stringify([{ type: 'handover_in', odometer, fuelLevel, time: actualEnd }]),
        bookingId
      ]
    );

    return res.status(200).json({
      message: penalty > 0 ? `Ride ended with penalty ₹${penalty}` : "Ride ended successfully",
      data: updated.rows[0]
    });

  } catch (err) {
    // This will print the exact SQL error to your terminal if it fails!
    console.error("End Ride Error:", err); 
    return res.status(500).json({ message: "internal server error" });
  }
});
router.get("/test-razorpay", async (req, res) => {
  try {
    console.log("Attempting Razorpay Test with Key:", process.env.RazorpayAPIKey?.substring(0, 8) + "...");
    
    // Attempt to create a 1 INR (100 paise) dummy order
    const order = await razorpay.orders.create({
      amount: 100, 
      currency: "INR",
      receipt: "test_receipt_999"
    });

    console.log("✅ Razorpay Test SUCCESS!");
    res.json({ 
      message: "Keys are working perfectly!", 
      orderId: order.id 
    });

  } catch (error) {
    console.error("❌ Razorpay Test FAILED:", error);
    res.status(500).json({ 
      message: "Razorpay authentication failed", 
      error: error 
    });
  }
}); 
module.exports=router 