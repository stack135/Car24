const {pool}=require("../connectdb")
const dailySettlementJob = async () => {
  console.log("Running daily settlement job...");
};

module.exports = { dailySettlementJob };