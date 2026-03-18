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
module.exports=router