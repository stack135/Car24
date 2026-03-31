const {Worker}=require("bullmq")
const {pool,redis}=require("../connectdb")
const{ rideReminderJob,
  ridePenaltyJob,
  rideAutoExtendJob}=require("../jobs/rideJobs")
  const {dailySettlementJob}=require("../jobs/finacial")
  console.log("🚀 Worker started...");
  const worker = new Worker(
  "bookingqueue",
  async (job) => {
    console.log("Running job:", job.name);

    const { bookingId } = job.data;

    switch (job.name) {
      case "ride-reminder":
        return rideReminderJob(bookingId);

      case "ride-penalty":
        return ridePenaltyJob(bookingId);

      case "ride-auto-extend":
        return rideAutoExtendJob(bookingId);

      case "daily-settlement":
        return dailySettlementJob();

      default:
        console.log("Unknown job");
    }
  },
  { connection:redis }
);
