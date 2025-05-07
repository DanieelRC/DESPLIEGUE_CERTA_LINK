const Caja = require("../../models/modelo.js");
const express = require("express");
const { Op } = require("sequelize");
const { v4: uuidv4 } = require('uuid');

module.exports = function (passport) {
  const router = express.Router();

  router.get("/AdministrarFolios/Principal", isLoggedIn, async (req, res) => {
    res.render("AdministrarFolios/Principal");
  });
  
  router.get("/AdministrarFolios/Seguros", isLoggedIn, async (req, res) => {
    const folios = await Caja.Folio.findAll({
      attributes: [
        "folio",
        "habitacion",
        "fecha",
        "paciente",
        "tipo_folio",
        "estado_folio",
        "monto_total",
      ],
      where: {
        tipo_folio: "Seguros",
      },
      include: [
        {
          model: Caja.Medico, // Incluye el modelo Medico
          attributes: ["nombre", "apellido_p", "apellido_m"],
        },
      ],
      raw: true, // Devuelve el resultado en un formato plano
    });

    const datosAplanados = folios.map((record) => ({
      Folio: record.folio,
      Habitacion: record.habitacion,
      Fecha: record.fecha,
      Paciente: record.paciente,
      Tipo_Folio: record.tipo_folio,
      Estado_Folio: record.estado_folio,
      Monto: record.monto_total,
      Medico_Nombre: record["Medico.nombre"], // Datos de Medico
      Medico_Apellido_P: record["Medico.apellido_p"],
      Medico_Apellido_M: record["Medico.apellido_m"],
    }));

    console.log(datosAplanados);
    res.render("AdministrarFolios/Seguros", {
      nombre: req.user.nombre,
      datos: datosAplanados,
      acceso: req.user.nivel_acceso,
    });
  });

  
  router.get("/AdministrarFolios/Particulares", isLoggedIn, async (req, res) => {
    const folios = await Caja.Folio.findAll({
      attributes: [
        "folio",
        "habitacion",
        "fecha",
        "paciente",
        "tipo_folio",
        "estado_folio",
        "monto_total",
      ],
      where: {
        tipo_folio: "Particulares",
      },
      include: [
        {
          model: Caja.Medico, // Incluye el modelo Medico
          attributes: ["nombre", "apellido_p", "apellido_m"],
        },
      ],
      raw: true, // Devuelve el resultado en un formato plano
    });

    const datosAplanados = folios.map((record) => ({
      Folio: record.folio,
      Habitacion: record.habitacion,
      Fecha: record.fecha,
      Paciente: record.paciente,
      Tipo_Folio: record.tipo_folio,
      Estado_Folio: record.estado_folio,
      Monto: record.monto_total,
      Medico_Nombre: record["Medico.nombre"], // Datos de Medico
      Medico_Apellido_P: record["Medico.apellido_p"],
      Medico_Apellido_M: record["Medico.apellido_m"],
    }));

    console.log(datosAplanados);
    res.render("AdministrarFolios/Particulares", {
      nombre: req.user.nombre,
      datos: datosAplanados,
      acceso: req.user.nivel_acceso,
    });
  });



  router.get("/AdministrarFolios/EditarFolio/:id", isLoggedIn, async (req, res) => {
    try {

      const Folio = await Caja.Folio.findOne({
        where: { folio: req.params.id }
      })

      await Caja.Medico.sync();
        const med = await Caja.Medico.findAll({
          where: {
            estado: "habilitado"
          }
        });

      res.render("AdministrarFolios/EditarFolio", {
        datos: Folio,
        nombre: req.user.nombre,
        acceso: req.user.nivel_acceso,
        Medicos: med,
      });

    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.post("/AdministrarFolios/EditarFolio/:id", isLoggedIn, async (req, res) => {
    const t = await Caja.sequelize.transaction(); // Inicia transacción

    try {
      const { Paciente, Medico, Habitacion, Monto } = req.body;
      const Folio = req.params.id;

      console.log(Paciente, Medico, Habitacion, Monto);

      await Caja.Folio.update(
        { paciente: Paciente, medico: Medico, habitacion: Habitacion, monto: Monto },
        { where: { folio: Folio }, transaction: t, user: req.user.correo, individualHooks: true, saveHistory: true }
      );

      await t.commit();
      res.redirect("/AdministrarFolios/Principal");

    } catch (err) {
      await t.rollback(); // Revertir cambios si hay error
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });


  return router;
};

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}