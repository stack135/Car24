const minio=require("minio")
const minioClient=new minio.Client({
endPoint:"localhost",
port: 9000,
  useSSL: false,
  accessKey: "minioadmin",
  secretKey: "minioadmin123"
})
module.exports = minioClient;