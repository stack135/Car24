const express=require("express")
const router=express.Router()
const {pool}=require("./connectdb")
const rateLimiter = require("./rateLimiter")
const multer = require("multer")
const {veriftJWT}=require("./jwt")
require("dotenv").config()
const minioClient = require("./minioConnect")
async function uploadToMinio(bucket, fileName, buffer, mimeType) {
    await ensureBucket(bucket);
  await minioClient.putObject(
    bucket,
    fileName,
    buffer,
    {
      "Content-Type": mimeType
    }
  );

  const url = await minioClient.presignedGetObject(
    bucket,
    fileName,
    24 * 60 * 60 
  );

  return url;
}
async function ensureBucket(bucket) {

  const exists = await minioClient.bucketExists(bucket);

  if (!exists) {
    console.log("⚠️ Creating bucket:", bucket);
    await minioClient.makeBucket(bucket);
  }
}
const upload = multer({ storage: multer.memoryStorage() });
function generateFileName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
}
router.post("/addCar/:branchId", rateLimiter, upload.fields([
    { name: "mainImage", maxCount: 1 },
    { name: "images", maxCount: 5 }
]), async (req, res) => {
  // NOTE: Uncomment your JWT verification here in production!
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ message: "missing authorization headers" });
  }

  const token = header.split(" ")[1];
  const payload = await veriftJWT(token); // Make sure your JWT verify function is imported!
  
  if (!payload || !payload.id) {
    return res.status(401).json({ message: "invalid or expired token" });
  }
  const branchId = req.params.branchId;
  const files = req.files;

  if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: "missing images" });
  }
  
  const mainImageFile = req.files?.mainImage?.[0];
  const otherImages = req.files?.images || [];

  try {
    const branchRes = await pool.query(`SELECT * FROM ${process.env.branch_table} WHERE id=$1`, [branchId]);
    if (branchRes.rows.length === 0) {
      return res.status(400).json({ message: "branch not found" });
    }

    let imageNames = [];
    const { 
      model, year, category, transmission, fuelType, 
      seatingCapacity, features, licensePlate, mileage, colour 
    } = req.body;

    if (!model || !year || !category || !transmission || !fuelType || !seatingCapacity || !colour || !licensePlate) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const plate = licensePlate.toUpperCase().trim();
    
    // 💥 Safely parse features (React Native sends it as a comma-separated string)
    const parsedFeatures = features ? features.split(',').map(f => f.trim()) : [];
    const parsedMileage = parseInt(mileage) || 0;
    const parsedYear = parseInt(year) || new Date().getFullYear();

    const existing = await pool.query(`SELECT id FROM ${process.env.cars_table} WHERE "licensePlate"=$1`, [plate]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "License plate already exists" });
    }

    if (!mainImageFile && otherImages.length === 0) {
      return res.status(400).json({ message: "At least one image required" });
    }

    // Upload Main Image
    if (mainImageFile) {
      const fileName = generateFileName("main");
      await uploadToMinio("carimages", fileName, mainImageFile.buffer, mainImageFile.mimetype);
      imageNames.push(fileName); 
    }

    // Upload Other Images
    for (let file of otherImages) {
      const fileName = generateFileName("car");
      await uploadToMinio("carimages", fileName, file.buffer, file.mimetype);
      imageNames.push(fileName);
    }

    // Save to Database
    const result = await pool.query(
      `INSERT INTO ${process.env.cars_table} (
        "branchId", "ownerid", "model", "year", "category", 
        "transmission", "fuelType", "seatingCapacity", "licensePlate", 
        "mileage", "images", "features", "main_image", 
        "approvalstatus", "status", "isAvailable", "colour", 
        "createdAt", "updatedAt"
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())
      RETURNING *`,
      [
        branchId, userId, model, parsedYear, category, 
        transmission, fuelType, seatingCapacity, plate, 
        parsedMileage, imageNames, parsedFeatures, 0, 
        "pending", "available", false, colour
      ]
    );

    res.status(201).json({ message: "Car created and sent for approval", data: result.rows[0] });

  } catch(e) {
    console.error("Add Car Error:", e);
    res.status(500).json({ message: "internal server error", error: e.message });
  }
});
router.get("/get_pending_cars", rateLimiter, async (req, res) => {
  // const header=req.headers.authorization
  // if(!header){ return res.status(401).json({message:"missing headers"}) }
  // const token = header.split(" ")[1]
  // const payload=await veriftJWT(token)
  // if(!payload){ return res.status(401).json({message:"invalid token"}) }

  try {
    const result = await pool.query(
      `SELECT * FROM ${process.env.cars_table} WHERE approvalstatus=$1`, 
      ["pending"]
    );

    // 💥 THE MAGIC: Convert filenames to real MinIO URLs before sending to frontend!
    const carsWithImageUrls = await Promise.all(result.rows.map(async (car) => {
      
      let signedUrls = [];
      
      // Check if the car has an images array
      if (car.images && car.images.length > 0) {
        signedUrls = await Promise.all(car.images.map(async (fileName) => {
          try {
            // Generate a secure URL valid for 24 hours
            return await minioClient.presignedGetObject("carimages", fileName, 24 * 60 * 60);
          } catch (err) {
            console.error("Failed to generate URL for:", fileName);
            return null; // Fallback if an image gets deleted from MinIO
          }
        }));
      }

      // Return the car object, but swap the filename array for the real URL array
      return {
        ...car,
        images: signedUrls.filter(url => url !== null) // Remove any failed URLs
      };
    }));

    res.status(200).json({
      message: "Pending cars fetched successfully",
      count: carsWithImageUrls.length,
      data: carsWithImageUrls
    });

  } catch (e) {
    console.error("Fetch Pending Cars Error:", e);
    res.status(500).json({ message: "internal server error", error: e.message });
  }
});
router.put("/approve_pending_cars/:carId",rateLimiter,async(req,res)=>{
       const  {carId } = req.params;
     const { status, six, twelve, twentyFour, pricePerDay } = req.body;

           if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be approved or rejected"
      });
    }
//       const header=req.headers.authorization
// if(!header){
//   return res.status(401).json({message:"missing headers"})
// }

// const token = header.split(" ")[1]
// const payload=await veriftJWT(token)
// if(!payload){
//   return res.status(401).json({message:"invalid token"})
// }
try{
     const car = await pool.query(
      `SELECT * FROM cars WHERE id=$1`,
      [carId]
    );

    if (car.rows.length === 0) {
      return res.status(404).json({
        message: "Car not found"
      });
    }

    
    if (car.rows[0].approvalstatus !== "pending") {
      return res.status(400).json({
        message: `Car already ${car.rows[0].approvalstatus}`
      });
    }


   const updated = await pool.query(
  `
  UPDATE ${process.env.cars_table}
  SET 
    approvalstatus = $1,
    "isAvailable" = $2,
    "six_hr_price" = COALESCE($3, "six_hr_price"),
    "twelve_hr_price" = COALESCE($4, "twelve_hr_price"),
    "twentyfour_hr_price" = COALESCE($5, "twentyfour_hr_price"),
    "pricePerDay" = COALESCE($6, "pricePerDay"),
    "updatedAt" = NOW()
  WHERE id = $7
  RETURNING *
  `,
  [
    status,
    status === "approved", 
    six || null,
    twelve || null,
    twentyFour || null,
    pricePerDay || null, // 💥 ADDED THIS!
    carId
  ]
);
    res.status(200).json({
      message: `Car ${status} successfully`,
      data: updated.rows[0]
    });


}catch(e){
    res.status(500).json({message:"internal server error",error:e.message})
}
}) 
router.get("/get_cars", rateLimiter, async (req, res) => {
  try {
    const {
      limit,
      pageno,
      category,
      fuelType,
      seater,
      model,
      colour,
      transmission,
      branch,
      pickupDate, 
      dropoffDate
    } = req.query;

    const limitVal = parseInt(limit) || 10;
    const pageVal = parseInt(pageno) || 0;
    const offset = pageVal * limitVal;

    let query = `
      SELECT c.*, b.name as branch_name
      FROM cars c
      JOIN branches b ON c."branchId" = b.id
      WHERE c.approvalstatus = 'approved'
      
    `;
    // AND c."isAvailable" = true

    let values = [];
    let count = 1;

 

    // data query
if (category) {
  query += ` AND LOWER(c.category::text) = LOWER($${count++})`;
  values.push(category);
}

if (fuelType) {
  query += ` AND LOWER(c."fuelType") = LOWER($${count++})`;
  values.push(fuelType);
}

if (transmission) {
  query += ` AND LOWER(c.transmission::text) = LOWER($${count++})`;
  values.push(transmission);
}

if (seater) {
  query += ` AND c."seatingCapacity" = $${count++}`;
  values.push(parseInt(seater));
}

if (model) {
  query += ` AND c.model ILIKE $${count++}`;
  values.push(`%${model}%`);
}

if (colour) {
  query += ` AND LOWER(c.colour) LIKE LOWER($${count++})`;
  values.push(`%${colour}%`);
}

if (branch) {
  query += ` AND c."branchId" = $${count++}`;
  values.push(parseInt(branch));
}

   

    if (pickupDate && dropoffDate) {
      query += `
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b."carId" = c.id
          AND b.status IN ('confirmed')
          AND (
            b."pickupDate" < $${count}
            AND b."dropoffDate" > $${count + 1}
          )
        )
      `;
      values.push(dropoffDate, pickupDate);
      count += 2;
    }
    // AND b.status IN ('confirmed', 'ongoing')


    query += ` LIMIT $${count++} OFFSET $${count++}`;
    values.push(limitVal, offset);

    const dataResult = await pool.query(query, values);

    // 💥 NEW: Convert filenames to URLs, but skip existing Unsplash URLs!
    const carsWithImageUrls = await Promise.all(dataResult.rows.map(async (car) => {
      let finalUrls = [];
      
      if (car.images && car.images.length > 0) {
        finalUrls = await Promise.all(car.images.map(async (imgString) => {
          try {
            // Check if it's already a full URL (like your old Unsplash images)
            if (imgString.startsWith("http://") || imgString.startsWith("https://")) {
              return imgString; // Leave it exactly as it is
            }
            
            // Otherwise, it's a MinIO filename! Generate the secure URL.
            return await minioClient.presignedGetObject("carimages", imgString, 24 * 60 * 60);
            
          } catch (err) {
            console.error("Failed to generate URL for:", imgString);
            return null; // Fallback so the app doesn't crash if one image fails
          }
        }));
      }

      return {
        ...car,
        images: finalUrls.filter(url => url !== null) // Strip out any dead links
      };
    }));


    let countQuery = `
      SELECT COUNT(*) 
      FROM cars c
      JOIN branches b ON c."branchId" = b.id
      WHERE c.approvalstatus = 'approved'
      
    `;
    // AND c."isAvailable" = true

    let countValues = [];
    let countIndex = 1;



    if (category) {
  countQuery += ` AND LOWER(c.category::text) = LOWER($${countIndex++})`;
  countValues.push(category);
}

if (fuelType) {
  countQuery += ` AND LOWER(c."fuelType") = LOWER($${countIndex++})`;
  countValues.push(fuelType);
}

if (transmission) {
  countQuery += ` AND LOWER(c.transmission::text) = LOWER($${countIndex++})`;
  countValues.push(transmission);
}

if (seater) {
  countQuery += ` AND c."seatingCapacity" = $${countIndex++}`;
  countValues.push(parseInt(seater));
}

if (model) {
  countQuery += ` AND c.model ILIKE $${countIndex++}`;
  countValues.push(`%${model}%`);
}

if (colour) {
  countQuery += ` AND LOWER(c.colour) LIKE LOWER($${countIndex++})`;
  countValues.push(`%${colour}%`);
}

if (branch) {
  countQuery += ` AND c."branchId" = $${countIndex++}`;
  countValues.push(parseInt(branch));
}



    if (pickupDate && dropoffDate) {
      countQuery += `
        AND NOT EXISTS (
          SELECT 1 FROM bookings b
          WHERE b."carId" = c.id
          AND b.status IN ('confirmed', 'ongoing')
          AND (
            b."pickupDate" < $${countIndex}
            AND b."dropoffDate" > $${countIndex + 1}
          )
        )
      `;
      countValues.push(dropoffDate, pickupDate);
      countIndex += 2;
    }

    const countResult = await pool.query(countQuery, countValues);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limitVal);

  

    res.json({
      page: pageVal,
      limit: limitVal,
      totalCars: total,
      totalPages,
      data: carsWithImageUrls
    });

  } catch (e) {
    res.status(500).json({
      message: "internal server error",
      error: e.message
    });
  }
});
// GET single car by ID
router.get("/get_car/:id", rateLimiter,async (req, res) => {
  try {
    const { id } = req.params;
    console.log("came id=",id)
    const result = await pool.query(`
      SELECT c.*, b.name as branch_name, b.city as branch_city, b.address as branch_address
      FROM  cars c
      JOIN branches b ON c."branchId" = b.id
      WHERE c.id = $1 
      AND c.approvalstatus = 'approved'
    `, [id]);

    if (result.rows.length === 0) {
console.log("result",result)
      return res.status(404).json({data:result.rows[0], message: 'Car not found' });
    }

    let car = result.rows[0];

    // 💥 THE MAGIC: Convert filenames to URLs for this specific car!
    if (car.images && car.images.length > 0) {
      const finalUrls = await Promise.all(car.images.map(async (imgString) => {
        try {
          // Keep old Unsplash URLs exactly as they are
          if (imgString.startsWith("http://") || imgString.startsWith("https://")) {
            return imgString; 
          }
          
          // Generate secure MinIO URLs for new uploads
          return await minioClient.presignedGetObject("carimages", imgString, 24 * 60 * 60);
          
        } catch (err) {
          console.error("Failed to generate URL for:", imgString);
          return null; // Fallback so the app doesn't crash if an image is missing
        }
      }));
      
      // Update the car object with the live URLs (filtering out any dead links)
      car.images = finalUrls.filter(url => url !== null);
    }

    // Send the updated car object to the frontend!
    res.json(car);

  } catch (e) {
    console.error("Get Single Car Error:", e);
    res.status(500).json({ message: 'Internal server error', error: e.message });
  }
});
router.get("/branch_cars/:id",rateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { isavailable, approvalstatus,status } = req.query;

    let query = `SELECT * FROM cars WHERE "branchid" = $1`;
    let values = [id];
    let index = 2;

    
    if (isavailable !== undefined) {
      query += ` AND "isAvailable" = $${index++}`;
      values.push(isavailable === "true");
    }

    if (approvalstatus !== undefined) {
      query += ` AND approvalstatus = $${index++}`;
      values.push(approvalstatus);
    }
if(status!==undefined){
  query += `AND status=$${index++}`
  values.push(status)
}
    const result = await pool.query(query, values);

    res.json({
      count: result.rows.length,
      data: result.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
});
// branches router
router.get("/get_branches",rateLimiter, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, city FROM branches ORDER BY city
    `);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ message: 'Internal server error', error: e.message });
  }
});

router.put("/updateCar/:id",rateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      "branchId",
      "approvalstatus",
      "six_hr_price",
      "twelve_hr_price",
      "twentyfour_hr_price",
      "status"
    ];

    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) =>
        allowedFields.includes(key)
      )
    );

    const keys = Object.keys(updates);

    if (keys.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    // Build dynamic query
    const setClause = keys
      .map((key, i) => `"${key}" = $${i + 1}`)
      .join(", ");

    const values = Object.values(updates);

    const query = `
      UPDATE cars
      SET ${setClause}
      WHERE id = $${keys.length + 1}
      RETURNING *
    `;

    const result = await pool.query(query, [...values, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Car not found" });
    }

    res.status(200).json({
      message: "Car updated successfully",
      data: result.rows[0]
    });

  } catch (err) {
    console.error("Update Car Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// In your cars router
router.get("/owner_cars", rateLimiter, async (req, res) => {
  try {
    const { ownerId } = req.query;
    
    if (!ownerId) {
      return res.status(400).json({ message: "Owner ID required" });
    }

    const result = await pool.query(`
      SELECT 
        c.*,
        b.name as branch_name,
        
        b.city as branch_city,
        -- Count total trips for each car
        (SELECT COUNT(*) FROM bookings bk WHERE bk."carId" = c.id) as total_trips
      FROM ${process.env.cars_table} c
      JOIN branches b ON c."branchid" = b.id
      WHERE c.ownerid = $1
      ORDER BY c."createdAt" DESC
    `, [ownerId]);

    // 💥 THE MAGIC: Convert filenames to Live URLs so the Owner can actually see them!
    const carsWithImageUrls = await Promise.all(result.rows.map(async (car) => {
      if (car.images && car.images.length > 0) {
        const finalUrls = await Promise.all(car.images.map(async (imgString) => {
          try {
            // Keep old Unsplash URLs exactly as they are
            if (imgString.startsWith("http://") || imgString.startsWith("https://")) {
              return imgString; 
            }
            
            // Generate secure MinIO URLs for new uploads
            return await minioClient.presignedGetObject("carimages", imgString, 24 * 60 * 60);
          } catch (err) {
            console.error("Failed to generate URL for:", imgString, "👉 ACTUAL ERROR:", err.message ? err.message : err);
            return null; // Fallback so the app doesn't crash if an image is missing
          }
        }));
        
        // Update the car object with the live URLs
        car.images = finalUrls.filter(url => url !== null);
      }
      return car;
    }));

    // Send the updated cars array to the frontend
    res.json(carsWithImageUrls);

  } catch (e) {
    console.error('owner_cars error:', e.message);
    res.status(500).json({ message: "Internal server error", error: e.message });
  }
});

module.exports=router