const express= require("express")
const {connecttodb}=require("./connectdb")
const userCreate=require("./user")
const uploadPhoto=require("./photoUpload")
try{
    const env=require("dotenv").config()
    console.log("env files loaded")
}catch(e){
    console.log("error at loding env file",e)
}
connecttodb()
const port=process.env.PORT||"4000"
const app= express()
app.use(express.json())
app.use("/user",userCreate)
app.use("/PhotoUpload",uploadPhoto)
app.get("/",(req,res)=>{
    res.send("<h1> hello from car24 server</h1>")
})
app.listen(port,"0.0.0.0",()=>{
    console.log("server is running on ",port)
})