const {pool}=require("../connectdb")
const rideReminderJob = async (bookingId) => {
  console.log("Reminder job for booking:", bookingId);
};


const ridePenaltyJob = async (bookingId) => {
    
  console.log("Penalty job for booking:", bookingId);
};


const rideAutoExtendJob = async (bookingId) => {
  console.log("Auto extend job for booking:", bookingId);
};

module.exports = {
  rideReminderJob,
  ridePenaltyJob,
  rideAutoExtendJob,
};