const { Sequelize} = require("sequelize")
const {NivelAcceso} = require("../src/models/modelo.js")

require('dotenv').config(); 

const sequelize = new Sequelize(process.env.DB_NAME,process.env.DB_USER,process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  dialect: process.env.DB_DIALECT,
});
async function testAssociations() {
  const datos = await NivelAcceso.findAll();
  console.log(datos);
}
testAssociations();
async function Test() {
  try {
    await sequelize.authenticate();
    console.log("OK");

  } catch (err) {
    console.log("Algo salio mal");
  }
}
Test();