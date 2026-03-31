const minio=require("minio")
const minioClient=new minio.Client({
endPoint:"100.117.158.50",
port: 9000,
  useSSL: false,
  accessKey: "minioadmin",
  secretKey: "minioadmin123"
})
module.exports = minioClient;