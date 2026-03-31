
const express=require("express")
const router=express.Router()
const {pool,redis}=require("./connectdb")
const sendEmail=require("./email")
const rateLimiter=require("./rateLimiter")
const bcrypt=require("bcrypt")
const minioClient = require("./minioConnect");
const {createJwt,veriftJWT}=require("./jwt")


async function CreateSendOTP(email) {
    const otp=Math.floor(100000 + Math.random() * 900000)
        await redis.set(`otp:${email}`, otp, "EX", 300)
          await sendEmail(email, "OTP Verification", `Your OTP is ${otp} expires in 5 minutes`);
          return true
}



router.post("/createMangement", rateLimiter, async (req, res) => {
    if (!req.headers.authorization) {
  return res.status(401).json({ message: "missing headers" });
}
    const header=req.headers.authorization
    const token=header.split(" ")[1]
    const payload=await veriftJWT(token)
   if (payload.role !== "admin" && payload.role !== "superadmin") {
    return res.status(403).json({message: "unauthorized"}) // Also, 403 is better for unauthorized!
    }
  try {
    const { role, branch } = req.body;
    if (role === "staff" || role === "sub_admin") {
      if (!branch) {
        return res.status(400).json({ message: "please mention branch" });
      }
    }

    const {
      name, 
      mobile_no,
      email,
      password,
      dob,
      marrieddate,
      address,
      permissions
    } = req.body;
    const clientCheck = await pool.query(
      `SELECT * FROM ${process.env.table} WHERE email=$1`,
      [email]
    );

    if (clientCheck.rows.length > 0) {
      return res.status(400).json({
        message: "email already registered as client"
      });
    }


    const manageCheck = await pool.query(
      `SELECT * FROM ${process.env.Management} WHERE email=$1`,
      [email]
    );

    if (manageCheck.rows.length > 0) {
      return res.status(400).json({
        message: "account already exists"
      });
    }
    const encrypted_pass = await bcrypt.hash(password, 10);
    const isUser = await pool.query(
      `SELECT * FROM ${process.env.Management} WHERE email=$1`,
      [email]
    );

    if (isUser.rows.length !== 0) {
      return res.status(400).json({ message: "account already exists" });
    }
    const result = await pool.query(
      `INSERT INTO ${process.env.Management}
      (name, mobile_no, email, encrypted_pass, dob, married_date, address, role, permissions, branch)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        name,
        mobile_no,
        email,
        encrypted_pass,
        dob,
        marrieddate,
        address,
        role,
        JSON.stringify(permissions), 
        branch
      ]
    );
const sendMail=await CreateSendOTP(email)
if(!sendMail){
    return res.status(500).json({message:"otp sending fail"})
}
    return res.status(201).json({
      message: "User created successfully",
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "internal server error" });
  }
});
router.put("/verifyManagementRegister",rateLimiter,async(req,res)=>{
    const {otp,email}=req.body
    const header=req.headers.authorization
    const token=header.split(" ")[1]
    const payload=await veriftJWT(token)
    if (payload.role !== "admin" && payload.role !== "superadmin") {
    return res.status(403).json({message: "unauthorized"}) // Also, 403 is better for unauthorized!
    }
    const storedotp=await redis.get(`otp:${email}`)

    // console.log(storedotp)
    if(!storedotp){
        // console.log("otp expired")
        res.status(400).json({message:"otp expired"})
        return
    }
if(storedotp!=otp){
        // console.log("otp invalid")
        res.status(400).json({message:"otp invalid"})
        return
    }
        await pool.query(
      `UPDATE ${process.env.Management}
       SET is_verified = true
       WHERE email = $1`,
      [email]
    );

    await redis.del(`otp:${email}`);
    res.status(200).json({message:"user verified successfully"})
})
router.get("/getManagementData/:id/:branch/:role/:number/:offset",
  rateLimiter,
  async (req, res) => {

    
    try {
      const { id, branch, role, number, offset } = req.params;

      const header = req.headers.authorization;
      if (!header) {
        return res.status(401).json({ message: "No token provided" });
      }

      const token = header.split(" ")[1];
      const payload = await veriftJWT(token);

      if (["user", "owner", "staff"].includes(payload.role)) {
        return res.status(403).json({ message: "unauthorized person" });
      }

      const formatUser = (user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        dob: user.dob,
        marriedDate: user.married_date,
        mobileNo: user.mobile_no,
        role: user.role,
        branch: user.branch,
        is_verified: Boolean(user.profile_verified),
        permissions: Array.isArray(user.permissions)
          ? user.permissions
          : JSON.parse(user.permissions || "[]"),
        address: user.address || "not added address",
        created_at: user.created_at
      });

      if (id && id !== "null") {
        const data = await pool.query(
          `SELECT * FROM ${process.env.Management} WHERE id=$1`,
          [id]
        );

        if (data.rows.length === 0) {
          return res.status(404).json({ message: "user not found" });
        }

        return res.status(200).json({
          data: formatUser(data.rows[0])
        });
      }

      let query = `SELECT * FROM ${process.env.Management}`;
      let values = [];
      let conditions = [];
      if (payload.role === "subadmin") {
        conditions.push(`branch=$${values.length + 1}`);
        values.push(payload.branch);
      } else if (branch && branch !== "null") {
        conditions.push(`branch=$${values.length + 1}`);
        values.push(branch);
      }
      if (role && role !== "null") {
        conditions.push(`role=$${values.length + 1}`);
        values.push(role);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      const limit = parseInt(number) || 10;
      const off = parseInt(offset) || 0;

      query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(limit, off);

      const data = await pool.query(query, values);

      if (data.rows.length === 0) {
        return res.status(404).json({ message: "no users found" });
      }

      const users = data.rows.map(formatUser);

      return res.status(200).json({
        count: users.length,
        data: users
      });

    } catch (e) {
      console.error(e);
      return res.status(500).json({ message: "internal server error" });
    }
  }
);

router.get('/getManagementProfile', async (req, res) => {
  try {
    // 🔐 JWT extract
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: "Missing authorization" });
    }

    const token = header.split(" ")[1];
    const payload = await veriftJWT(token);

    if (!payload) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const userId = payload.id;

    // 🔥 MAIN QUERY
    const result = await pool.query(
      `
      SELECT 
        m.id,
        m.name,
        m.email,
        m.mobile_no,
        m.role,
        m.permissions,
        m.address,
        m.is_verified,
        m.created_at,

        b.id          AS branch_id,
        b.name        AS branch_name,
        b.city        AS branch_city,
        b.state       AS branch_state,
        b."zipCode"   AS branch_zipcode,
        b.phone       AS branch_phone,
        b.email       AS branch_email

      FROM management m
      LEFT JOIN branches b 
        ON m.branch::integer = b.id

      WHERE m.id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});



module.exports=router 