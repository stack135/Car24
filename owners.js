const express=require("express")
const router=express.Router()
const {createJwt,veriftJWT}=require("./jwt")
const {pool,redis}=require("./connectdb")
const sendEmail=require("./email")
const rateLimiter=require("./rateLimiter")
const bcrypt=require("bcrypt")




router.post("/CreateOwnerAccount",rateLimiter,async(req,res)=>{
    const {Name,Username,Email,DOB,NativePlace,Mobileno,pass,role}=req.body
    if(!Name||!Username||!Email||!DOB||!NativePlace||!Mobileno||!pass||!role){
        res.status(400).json({message:"data not recived"})
        return
    }
    const password=await bcrypt.hash(pass,10)
    const Role="owner"

    try{
        const isUser=await query(
            `SELECT * FROM ${process.env.table} WHERE email=$1`,[Email]
        )
        if(isUser.rows.length!=0){
            user=isUser.rows[0]
            const payload={
                email:Email,
                id:user.id
            }
            const token=await createJwt(payload)
            if(!token){
                res.status(500).json({message:"internal server error"})
                return
            }
            res.status(400).json({message:"user already exists"})
            return
        }
        const marriedDate=""
       const result=await pool.query(
            `INSERT INTO ${process.env.table}
            (name, username, email, dob, married_date, native_place, mobileno, encrypted_pass,Role)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *`,
            [Name,Username, Email, DOB, marriedDate, NativePlace, Mobileno,password,role]
        )
        const otp=Math.floor(100000 + Math.random() * 900000)
        await redis.set(`otp:${Email}`, otp, "EX", 300)
          await sendEmail(Email, "OTP Verification", `Your OTP is ${otp} expires in 5 minutes`);
        res.status(200).json({message:"OTP send",Email:Email})
    }catch(e){
        if(e. code=="23505"){
    res.status(400).json({message:"user name already exists"})
    return
}
        res.status(500).json({message:"internal server error",e})
    }
})

router.post("/LoginOwnerAccount",rateLimiter,async(req,res)=>{
    const {email,password}=req.body
if(!email&&!password){
        res.status(400).json({message:"email or password is missing"})
        return
    }
    try{
 const isUser=await pool.query(
        `SELECT * FROM ${process.env.table} WHERE email=$1`,
        [email]  
    )
    const owner=isUser.rows[0]
    if(!isUser){
        res.status(400).json({message:"user not found"})
        return
    }
    if(owner.role!=="owner"){
        res.status(401).json({message:"unauthoraized access"})
        return
    }
    const correctPass=await bcrypt.compare(password,user.encrypted_pass)
    if(!correctPass){
        res.status(400).json({message:"invalid password"})
        return
    }    
    if(!user.is_verified){
        const payload={
             email:user.email,
    id:user.id
        }
        const token=await createJwt(payload)
        if(!token){
    res.status(500).json({message:"token creation error"})
    return
}
        res.status(401).json({reVerificationToken:token})
        return
    }
const payload={
     id:user.id,
        name:user.name,
        role:user.role
}
const token=await createJwt(payload)
if(!token){
    res.status(500).json({message:"token creation error"})
    return
}
res.status(200).json({token:token})
    }catch(e){
        res.status(500).json({message:"internal server err at /ownerAccount",e})
    }
})

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

// ✅ FIXED calculatePrice — no changes needed, looks correct
// (already handles 24/12/6 hr breakdown properly)

// ✅ FIXED /getOwnerData — minor hardening only
router.get("/getOwnerData", rateLimiter, async (req, res) => {
  try {
    const header = req.headers.authorization;
    const token = header.split(" ")[1];
    const payload = await veriftJWT(token);

    if (!payload?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ownerRes = await pool.query(
      `SELECT id, name, email, mobileno, city, state 
       FROM ${process.env.table} 
       WHERE id = $1`,
      [payload.id]
    );

    if (ownerRes.rows.length === 0) {
      return res.status(404).json({ message: "Owner not found" });
    }

    const carsRes = await pool.query(
      `SELECT id, model, year, category, transmission, "fuelType", "seatingCapacity", status
       FROM ${process.env.cars_table}
       WHERE ownerid = $1`,
      [payload.id]
    );

    // 💥 UPDATED STATS QUERY
    const statsRes = await pool.query(
      `
      WITH OwnerBookings AS (
        SELECT 
          b.id,
          b.status,
          b.payment_completed,
          b."createdAt",
          b."pickupDate",
          b."dropoffDate",
          COALESCE(b.advance_paid, 0) AS advance_paid,
          
          -- 💥 THE NEW LOGIC: Calculate ACTUAL hours if they finished the ride, otherwise use scheduled hours
          CASE 
            WHEN b.ride_start_time IS NOT NULL AND b.ride_end_time IS NOT NULL THEN
              EXTRACT(EPOCH FROM (b.ride_end_time - b.ride_start_time)) / 3600
            ELSE 
              EXTRACT(EPOCH FROM (b."dropoffDate" - b."pickupDate")) / 3600
          END AS booking_hours,

          -- 💥 THE NEW LOGIC: Determine the TRUE money earned
          CASE 
            -- Scenario A: Ride is fully completed (both start and end times exist).
            -- In this scenario, we trust the final 'totalPrice' (which should include penalties/extra time).
            WHEN b.ride_start_time IS NOT NULL AND b.ride_end_time IS NOT NULL THEN
              COALESCE(b."totalPrice", 0)
              
            -- Scenario B: Ride is NOT finished yet (or was cancelled), AND they haven't fully paid.
            -- In this scenario, the owner has only actually received the advance payment.
            WHEN b.payment_completed = false THEN
              COALESCE(b.advance_paid, 0)
              
            -- Scenario C: Fallback. If payment is marked complete but times are missing, use totalPrice.
            ELSE 
              COALESCE(b."totalPrice", 0)
          END AS true_earnings

        FROM bookings b
        JOIN ${process.env.cars_table} c ON b."carId" = c.id
        WHERE c.ownerid = $1
      )
      SELECT
        COUNT(id) AS total_bookings,

        ROUND(COALESCE(SUM(booking_hours) / 12.0, 0), 1) AS total_trips,

        -- 💥 Now we just sum up the 'true_earnings' we calculated above!
        COALESCE(SUM(true_earnings) FILTER (WHERE status = 'confirmed' OR status = 'completed'), 0) AS total_earnings,

        COALESCE(SUM(true_earnings) FILTER (
          WHERE (status = 'confirmed' OR status = 'completed')
          AND DATE("createdAt" AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
        ), 0) AS today_earnings,

        COALESCE(SUM(true_earnings) FILTER (
          WHERE (status = 'confirmed' OR status = 'completed')
          AND "createdAt" >= NOW() - INTERVAL '7 days'
        ), 0) AS week_earnings,

        COALESCE(SUM(true_earnings) FILTER (
          WHERE (status = 'confirmed' OR status = 'completed')
          AND "createdAt" >= NOW() - INTERVAL '30 days'
        ), 0) AS month_earnings,

        COUNT(id) FILTER (
          WHERE NOW() BETWEEN "pickupDate" AND "dropoffDate"
          AND status = 'confirmed'
        ) AS active_rides,

        COUNT(id) FILTER (
          WHERE "pickupDate" > NOW()
          AND status IN ('confirmed', 'pending')
        ) AS upcoming_rides

      FROM OwnerBookings;
      `,
      [payload.id]
    );
    const chartRes = await pool.query(
      `
      WITH Last7Days AS (
        SELECT (CURRENT_DATE - i) AS dt
        FROM generate_series(6, 0, -1) i
      ),
      OwnerCars AS (
        SELECT id FROM ${process.env.cars_table} WHERE ownerid = $1
      )
      SELECT 
        SUBSTRING(TO_CHAR(d.dt, 'Dy') FROM 1 FOR 1) AS day, -- Gets 'M', 'T', 'W', etc.
        COALESCE(SUM(
          CASE 
            WHEN b.ride_start_time IS NOT NULL AND b.ride_end_time IS NOT NULL THEN COALESCE(b."totalPrice", 0)
            WHEN b.payment_completed = false THEN COALESCE(b.advance_paid, 0)
            ELSE COALESCE(b."totalPrice", 0)
          END
        ), 0) AS value,
        d.dt = CURRENT_DATE AS today
      FROM Last7Days d
      LEFT JOIN bookings b 
        ON DATE(b."createdAt" AT TIME ZONE 'Asia/Kolkata') = d.dt
        AND b.status IN ('confirmed', 'completed')
        AND b."carId" IN (SELECT id FROM OwnerCars)
      GROUP BY d.dt
      ORDER BY d.dt ASC;
      `,
      [payload.id]
    );

    return res.status(200).json({
      owner: ownerRes.rows[0],
      cars:  carsRes.rows,
      stats: statsRes.rows[0],
      chart: chartRes.rows,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ FULLY FIXED /getCarStats/:carId
router.get("/getCarStats/:carId", rateLimiter, async (req, res) => {
  try {
    const header = req.headers.authorization;
    const token = header.split(" ")[1];
    const payload = await veriftJWT(token);

    if (!payload?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { carId } = req.params;

    const carRes = await pool.query(
      `SELECT id, model, year, category, transmission, "fuelType", "seatingCapacity", status
       FROM ${process.env.cars_table}
       WHERE id = $1 AND ownerid = $2`,
      [carId, payload.id]
    );

    if (carRes.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    const statsRes = await pool.query(
      `
      SELECT
        COUNT(b.id)                                                            AS total_bookings,

        -- ✅ FIXED: uses pickupDate/dropoffDate diff, not missing "slot" column
        COALESCE(
          SUM(EXTRACT(EPOCH FROM (b."dropoffDate" - b."pickupDate")) / 3600) / 12.0,
          0
        )                                                                      AS total_trips,

        -- ✅ FIXED: uses status = 'confirmed', not missing payment_completed column
        COALESCE(SUM(b."totalPrice") FILTER (WHERE b.status = 'confirmed'), 0) AS total_earnings,

        COALESCE(SUM(b."totalPrice") FILTER (
          WHERE b.status = 'confirmed'
          AND DATE(b."createdAt" AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE
        ), 0) AS today_earnings,

        COALESCE(SUM(b."totalPrice") FILTER (
          WHERE b.status = 'confirmed'
          AND b."createdAt" >= NOW() - INTERVAL '7 days'
        ), 0) AS week_earnings,

        COALESCE(SUM(b."totalPrice") FILTER (
          WHERE b.status = 'confirmed'
          AND b."createdAt" >= NOW() - INTERVAL '30 days'
        ), 0) AS month_earnings,

        COUNT(b.id) FILTER (
          WHERE NOW() BETWEEN b."pickupDate" AND b."dropoffDate"
        ) AS active_rides,

        COUNT(b.id) FILTER (
          WHERE b."pickupDate" > NOW()
        ) AS upcoming_rides

      FROM bookings b
      WHERE b."carId" = $1
      `,
      [carId]
    );

    const activeRides = await pool.query(
      `SELECT * FROM bookings
       WHERE "carId" = $1
       AND NOW() BETWEEN "pickupDate" AND "dropoffDate"`,
      [carId]
    );

    const upcomingRides = await pool.query(
      `SELECT * FROM bookings
       WHERE "carId" = $1
       AND "pickupDate" > NOW()
       ORDER BY "pickupDate" ASC`,
      [carId]
    );

    return res.status(200).json({
      car:          carRes.rows[0],
      stats:        statsRes.rows[0],
      activeRides:  activeRides.rows,
      upcomingRides: upcomingRides.rows,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports=router