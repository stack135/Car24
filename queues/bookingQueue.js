const {redis,pool}=require("../connectdb")
const {Queue}=require("bullmq")
const bookingqueue=new Queue("bookingqueue",{redis})
module.exports=bookingqueue