const express=require("express")
const router=express.Router()
const {pool,redis}=require("./connectdb")
const sendEmail=require("./email")
const rateLimiter=require("./rateLimiter")
const bcrypt=require("bcrypt")
const {createJwt,veriftJWT}=require("./jwt")
async function CreateSendOTP(email) {
    const otp=Math.floor(100000 + Math.random() * 900000)
        await redis.set(`otp:${email}`, otp, "EX", 300)
          await sendEmail(email, "OTP Verification", `Your OTP is ${otp} expires in 5 minutes`);
          return true
}
// async function rateLimiter(req,res,next) {
//         const key=`rate:${req.ip}`
//         const request=await redis.get(key)
//         console.log("requests=",request)
//         if (request && request >= 50) {
//     return res.status(429).json({
//       message: "Too many requests. Try again later."
//     });
//   }
// const newRequests = await redis.incr(key)

//     if (newRequests === 1) {
//         await redis.expire(key,60)
//     }
// next()
// }
router.post("/createUser",rateLimiter,async(req,res)=>{
    const {name,username,email,DOB,marriedDate,NativePlace,mobileno,password} = req.body
    // console.log("came to user" )
    const encrypted_pass=await bcrypt.hash(password,10)
    const Role="user"
    try{
        const isUser=await pool.query(
            `SELECT * FROM ${process.env.table} WHERE email=$1`
            ,[email]
        )
        if(isUser.rows.length!=0){
            //  user=isUser.rows[0]
            // const payload={
            //     email:email,
            //     id:user.id
            // }
            // const token=await createJwt(payload)
            // if(!token){
            //     res.status(500).json({message:"internal server error"})
            //     return
            // }
            res.status(400).json({message:"user already exists"})
            return
        }
        const result=await pool.query(
            `INSERT INTO ${process.env.table}
            (name, username, email, dob, married_date, native_place, mobileno, encrypted_pass,Role)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *`,
            [name,username, email, DOB, marriedDate, NativePlace, mobileno,encrypted_pass,Role]
        )
        const mailSend=await CreateSendOTP(email)
        if(!mailSend){
            res.status(500).json({message:"internal server error"})
        }
        res.status(200).json({message:"OTP send",Email:email})
    }catch(e){


if(e. code=="23505"){
    res.status(400).json({message:"user name already exists"})
    return
}
res.status(500).json({message:`  error at server ${e}`})
    }

})
router.put("/verifyuserRegister",rateLimiter,async(req,res)=>{
    const {otp,email}=req.body
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
      `UPDATE ${process.env.table}
       SET is_verified = true
       WHERE email = $1`,
      [email]
    );

    await redis.del(`otp:${email}`);
    res.status(200).json({message:"user verified successfully"})
})
router.post("/userLogin",rateLimiter,async (req,res)=>{
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
     const user=isUser.rows[0]
    if(isUser.rows.length === 0){
            res.status(400).json({message:"user not registered"})
            return
    }
    // console.log(user.encrypted_pass)
    if(user.encrypted_pass){
       const correctPassword= await bcrypt.compare(password,user.encrypted_pass)
       if(!correctPassword){
        res.status(401).json({message:"invalid password"})
        return
       }
       
    }
    if(!user. is_verified ){
const tokenPayload={
    email:user.email,
    id:user.id
}
const token =await createJwt(tokenPayload)
if(!token){
        res.status(500).json({message:"jwt key error"})
        return
    }
     res.status(401).json({Verification_token:token})
     return
    }
    const tokenPayload={
        id:user.id,
        name:user.name,
        role:user.role,
        email:user.email
    }
    const token= await createJwt(tokenPayload)
    if(!token){
        res.status(500).json({message:"jwt key error"})
        return
    }
    res.status(200).json({Logintoken:token})

    }catch(e){
        console.log("err at /userLogin ",e)
        res.status(500).json({message:`err at server ${e}`})
        
    }
})
router.get("/SendVerifyOTP",rateLimiter,async(req,res)=>{
const header = req.headers.authorization
const token=header.split(" ")[1]
// console.log(token)
if(!token){
    res.status(401).json({message:"token not recived"})
    return
}
const payload=await veriftJWT(token)
if(!payload){
    res.status(500).json({message:"internal server error"})
    return
}
try{
const mailSend=await CreateSendOTP(payload.email)
if(!mailSend){
    res.status(500).json({message:"internal server error"})
}
        res.status(200).json({message:"reverification OTP send"})
}catch(e){
    res.status(500).json({message:"error at server",e})
}

})
router.post("/forgotPassOTP",rateLimiter,async(req,res)=>{
    const {email}=req.body
if(!email){
    res.status(400).json({message:"email not recived"})
    return
}
try{
    // console.log(email)
    // console.log(process.env.table)
const data=await pool.query(
    `SELECT * FROM ${process.env.table} WHERE email=$1` ,
    [email]
)
const userData=data.rows[0]
// console.log(userData)
if(userData.length===0){
    res.status(401).json({message:"user not found"})
    return
}
const mailSend=await CreateSendOTP(userData.email)
if(!mailSend){
    res.status(500).json({message:"internal server error"})
}
res.status(200).json({message:"forgot password otp send"})
}catch(e){
    res.status(500).json({message:"internal server error",e})
}
})
router.post("/forgotPassOTPVerify",rateLimiter,async(req,res)=>{
    const {otp,email}=req.body
    
   
    // console.log("user otp=",otp)
 const storedotp=await redis.get(`otp:${email}`)
    // console.log(storedotp)
    if(!storedotp){
        // console.log("otp expired")
        res.status(400).json({message:"otp expired"})
        return
    }
    // console.log(storedotp)
if (String(storedotp) !== String(otp)) {
    return res.status(400).json({ message: "OTP invalid" });
}
    const Passpayload={
        email:email,
        change:true
    }
    const changeToken=await createJwt(Passpayload)

    res.status(200).json({changePasswordToken:changeToken})
})
router.put("/changePass",rateLimiter,async(req,res)=>{
    const header=req.headers.authorization
const {pass}=req.body
    const token=header.split(" ")[1]
    if(!token){
        res.status(401).json({message:"token not found"})
        return
    }
    const payload=await veriftJWT(token)
    if(!payload){
        res.status(500).json({message:"jwt error"})
        return
    }
    if(!payload.change){
        res.status(401).json({message:"invalid token"})
        return
    }
const newPass=await bcrypt.hash(pass,10)
    try{
        const result=await pool.query(
            `UPDATE ${process.env.table} SET encrypted_pass=$1 WHERE email=$2`,
            [newPass,payload.email]
        )
        if(!result){
            res.status(500).json({message:"internal server error ",e})
            return
        }
        res.status(200).json({message:"password successfully changed"})
    }catch(e){
        res.status(500).json({message:`internal server error ${e}`})
    }
})
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
            // user=isUser.rows[0]
            // const payload={
            //     email:Email,
            //     id:user.id
            // }
            // const token=await createJwt(payload)
            // if(!token){
            //     res.status(500).json({message:"internal server error"})
            //     return
            // }
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
router.put("/addExpoToken",rateLimiter,async(req,res)=>{
    const{token,email}=req.body
    const header=req.headers.authorization
    if(!header){
        res.status(401).json({message:"authorization token not found"})
         return
    }
    const verificationToken=header.split(" ")[1]
    try{
         payload=await veriftJWT(verificationToken)
         if(!payload){
            res.status(401).json({message:"jwt expired"})
            return
         } 
const result=await pool.query(
    `UPDATE ${process.env.table} SET expo_token=$1 WHERE id=$2`,
    [token,payload.id]
)
if(!result){
    res.status(500).json({message:"internal server error"})
    return
}
res.status(200).json({message:"updated expo token"})
    }catch(e){
        res.status(500).json({message:"internal server error",e})
    }
})
router.put("/addFirebaseToken",rateLimiter,async(req,res)=>{
    const{token,email}=req.body
    const header=req.headers.authorization
    if(!header){
        res.status(401).json({message:"authorization token not found"})
         return
    }
    const verificationToken=header.split(" ")[1]
    try{
         payload=await veriftJWT(verificationToken)
         if(!payload){
            res.status(401).json({message:"jwt expired"})
            return
         } 
const result=await pool.query(
    `UPDATE ${process.env.table} SET firebase_token=$1 WHERE email=$2`,
    [token,email]
)
if(!result){
    res.status(500).json({message:"internal server error"})
    return
}
res.status(200).json({message:"updated firebase token"})
    }catch(e){
        res.status(500).json({message:"internal server error",e})
    }
})
router.put("/UpdateProfile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const header=req.headers.authorization
 const token=header.split(" ")[1]
    if(!token){
        res.status(401).json({message:"token not found"})
        return
    }
    const payload=await veriftJWT(token)
    if(!payload){
        res.status(500).json({message:"jwt error"})
        return
    }
    
    const allowedFields = [
      "name",
      "dob",
      "married_date",
      "native_place",
      "mobileno",
      "expo_token",
      "firebase_token"
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

    const setClause = keys
      .map((key, i) => `${key} = $${i + 1}`)
      .join(", ");

    const values = Object.values(updates);

    const query = `
      UPDATE client
      SET ${setClause}
      WHERE id = $${keys.length + 1}
      RETURNING *
    `;
if(!query){
    res.status(400).json({message:"user not found"})
}
    const result = await pool.query(query, [...values, id]);

    res.status(200).json({message:"updated the fields"});

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});
router.get("/getData",rateLimiter,async(req,res)=>{
    const header=req.headers.authorization
    if(!header){
        res.status(401).json({message:"token not found"})
    }
    const token=header.split(" ")[1]
    const payload=await veriftJWT(token)
    if(!payload){
        res.status(401).json({message:"token invalid"})
    }
    const data=await pool.query(
        `SELECT * FROM ${process.env.table} WHERE email=$1`,[payload.email]
    )
    if(!data){
        res.status(400).json({message:"user data not found"})
    }
    const userData=data.rows[0]
    const userdata={
        name:userData.name,
        username:userData.username,
        email:userData.email,
        dob:userData.dob,
        marriedDate:userData.marriedDate,
        native_place:userData.native_place,
        mobileno :userData.mobileno ,
        role  :userData.role  ,
        is_verified :userData.is_verified ,
        aadhar_url:userData.aadhar_url||"not added aadhar",
        pan_url:userData.pan_url||"not added pan",
        is_profile_completed:userData.is_profile_completed,
        address:userData.address||"not added address"
    }
    res.status(200).json({userData:userdata})
})
router.get("/getData/:id/:role/:number/:offset",rateLimiter,async(req,res)=>{
    const {id}=req.params
    const {role}=req.params
    const {number}=req.params
    const {offset}=req.params
    const header=req.headers.authorization
    const token=header.split(" ")[1]
    const payload=await veriftJWT(token)
    if(payload.role==="user"){
        res.status(401).json({message:"unauthoratized person"})
        return
    }
    if(payload.role==="owner"){
        res.status(401).json({message:"unauthoratized person"})
        return
    }
    try{
        if(id){
            const data=await pool.query(
        `SELECT * FROM ${process.env.table} WHERE id=$1`,[id]
    )
    if(!data){
        res.status(400).json({message:"user data not found"})
        return
    }
      const userData=data.rows[0]
       if(payload.role==="admin"){
     const userdata={
        name:userData.name,
        username:userData.username,
        email:userData.email,
        dob:userData.dob,
        marriedDate:userData.marriedDate,
        native_place:userData.native_place,
        mobileno :userData.mobileno ,
        role  :userData.role  ,
        is_verified :userData.is_verified ,
        aadhar_url:userData.masked_aadhar_url||"not added aadhar",
        pan_url:userData.masked_pan||"not added pan",
        is_profile_completed:userData.is_profile_completed,
        address:userData.address||"not added address"
    }
    res.status(200).json({data:userdata})
    return
       }else if(payload.role==="superAdmin"){
             const userdata={
        name:userData.name,
        username:userData.username,
        email:userData.email,
        dob:userData.dob,
        marriedDate:userData.marriedDate,
        native_place:userData.native_place,
        mobileno :userData.mobileno ,
        role  :userData.role  ,
        is_verified :userData.is_verified ,
        aadhar_url:userData.aadhar_url||"not added aadhar",
        pan_url:userData.pan_url||"not added pan",
        is_profile_completed:userData.is_profile_completed,
        address:userData.address||"not added address"
    }
    res.status(200).json({data:userdata})
    return
       }
        }
       if (role) {
  const data = await pool.query(
    `SELECT * FROM ${process.env.table} WHERE role=$1 LIMIT $2 OFFSET $3`,
    [role,number,offset]
  );

  if (data.rows.length === 0) {
    return res.status(400).json({ message: "user data not found" });
  }

  const users = data.rows.map((user) => {
    
    if (payload.role === "admin") {
      return {
        name: user.name,
        username: user.username,
        email: user.email,
        dob: user.dob,
        marriedDate: user.marrieddate,
        native_place: user.native_place,
        mobileno: user.mobileno,
        role: user.role,
        is_verified: user.is_verified,
        aadhar_url: user.masked_aadhar_url || "not added aadhar",
        pan_url: user.masked_pan || "not added pan",
        is_profile_completed: user.is_profile_completed,
        address: user.address || "not added address"
      };
    }

    if (payload.role === "superAdmin") {
      return {
        name: user.name,
        username: user.username,
        email: user.email,
        dob: user.dob,
        marriedDate: user.marrieddate,
        native_place: user.native_place,
        mobileno: user.mobileno,
        role: user.role,
        is_verified: user.is_verified,
        aadhar_url: user.aadhar_url || "not added aadhar",
        pan_url: user.pan_url || "not added pan",
        is_profile_completed: user.is_profile_completed,
        address: user.address || "not added address"
      };
    }

  });

  res.status(200).json({ data: users });
  return
}
 const data = await pool.query(
    `SELECT * FROM ${process.env.table}  LIMIT $1 OFFSET $2`,
    [number,offset]
  );

  if (data.rows.length === 0) {
    return res.status(400).json({ message: "user data not found" });
  }

  const users = data.rows.map((user) => {
    
    if (payload.role === "admin") {
      return {
        name: user.name,
        username: user.username,
        email: user.email,
        dob: user.dob,
        marriedDate: user.marrieddate,
        native_place: user.native_place,
        mobileno: user.mobileno,
        role: user.role,
        is_verified: user.is_verified,
        aadhar_url: user.masked_aadhar_url || "not added aadhar",
        pan_url: user.masked_pan || "not added pan",
        is_profile_completed: user.is_profile_completed,
        address: user.address || "not added address"
      };
    }

    if (payload.role === "superAdmin") {
      return {
        name: user.name,
        username: user.username,
        email: user.email,
        dob: user.dob,
        marriedDate: user.marrieddate,
        native_place: user.native_place,
        mobileno: user.mobileno,
        role: user.role,
        is_verified: user.is_verified,
        aadhar_url: user.aadhar_url || "not added aadhar",
        pan_url: user.pan_url || "not added pan",
        is_profile_completed: user.is_profile_completed,
        address: user.address || "not added address"
      };
    }

  });

  res.status(200).json({ data: users });

    }catch(e){
        res.status(500).json({message:"internal server error"})
    }
})
module.exports=router