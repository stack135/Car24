const express= require("express")
const {connecttodb}=require("./connectdb")
const userCreate=require("./user")
const uploadPhoto=require("./photoUpload")
const cars=require("./cars")
const owners = require("./owners")
const branch=require("./branch")
const booking=require("./booking")
const roleauth=require("./roleauth")
try{
    const env=require("dotenv").config()
    console.log("env files loaded")
}catch(e){
    console.log("error at loding env file",e)
}
connecttodb()
const port=process.env.PORT
const app= express()
app.use(express.json())
app.use("/user",userCreate)
app.use("/roleauth",roleauth)
app.use("/PhotoUpload",uploadPhoto)
app.use("/cars",cars)
app.use("/owners",owners)
app.use("/branch",branch)
app.use("/bookingApi",booking)
// app.use('/api/cars', require('./routes/cars'));
// app.use('/api/bookings', require('./routes/bookings'));
// app.use('/api/branches', require('./routes/branches'));
// app.use('/api/users', require('./routes/users'));
// app.use('/api/rides', require('./routes/rides'));
// app.use('/api/payments', require('./routes/payments'));
// app.use('/api/owners', require('./routes/owners'));
// app.use('/api/car-pricing', require('./routes/carPricing'));
// app.use('/api/refunds', require('./routes/refunds'));
app.get("/",(req,res)=>{
    res.send("<h1> hello from car24 server</h1>")
})
app.listen(port,"0.0.0.0",()=>{
    console.log("server is running on ",port)
})