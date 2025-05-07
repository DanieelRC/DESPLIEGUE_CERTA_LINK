const Caja = require("../../models/modelo.js");
const express = require("express");
const { Op } = require("sequelize");
const { v4: uuidv4 } = require('uuid');

module.exports = function (passport) {
  const router = express.Router();

  router.get("/Seguros/Principal", isLoggedIn, async (req, res) => {
    try {
      const seguros = await Caja.Seguros.findAll({
        attributes: [
          "id_datos",
          "solicitud_carta",
          "recepcion_carta",
          "tabulacion",
          "solicitud_factura",
          "cfdi",
          "ingreso_factura",
          "fecha_prob_pago",
          "fecha_pago",
          "cfdi_complemento",
          "total_comision_cobrada"
        ],
        where: {
          estado_folio: "en proceso"
        },
        include: [
          {
            model: Caja.Folio,
            attributes: [
              "folio",
              "habitacion",
              "fecha",
              "paciente",
              "tipo_folio",
              "estado_folio",
            ],
            required: true,
            where: {
              estado_folio: "en proceso"
            },
            include: [
              {
                model: Caja.Medico,
                attributes: ["nombre", "apellido_p", "apellido_m"],
              },
            ],
          }
        ],
        raw: false,
        nest: true,
      });

      const datosAplanados = seguros.map((record) => ({
        Folio: record.Folio?.folio || "N/A",
        Habitacion: record.Folio?.habitacion || "N/A",
        Fecha: record.Folio?.fecha || "N/A",
        Paciente: record.Folio?.paciente || "N/A",
        Tipo_Folio: record.Folio?.tipo_folio || "N/A",
        Estado_Folio: record.Folio?.estado_folio || "N/A",
        Medico_Nombre: record.Folio?.Medico?.nombre || "N/A",
        Medico_Apellido_P: record.Folio?.Medico?.apellido_p || "N/A",
        Medico_Apellido_M: record.Folio?.Medico?.apellido_m || "N/A",
        Seguros: {
          solicitud_carta: record.solicitud_carta || null,
          recepcion_carta: record.recepcion_carta || null,
          tabulacion: record.tabulacion || null,
          solicitud_factura: record.solicitud_factura || null,
          cfdi: record.cfdi || null,
          ingreso_factura: record.ingreso_factura || null,
          fecha_prob_pago: record.fecha_prob_pago || null,
          fecha_pago: record.fecha_pago || null,
          cfdi_complemento: record.cfdi_complemento || null,
          total_comision_cobrada: record.total_comision_cobrada || null,
        }
      }));

      res.render("Seguros/Principal", {
        nombre: req.user.nombre,
        datos: datosAplanados,
        acceso: req.user.nivel_acceso,
      });
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.post("/Seguros/Actualizar/:folio", async (req, res) => {
    try {
      const { folio } = req.params;
      const datos = req.body;

      console.log(" Datos recibidos en el backend:", datos);

      // Si se ingresa "folio_de_ingreso", automáticamente guardar "ingreso_factura" y calcular "fecha_prob_pago"
      if (datos.folio_de_ingreso) {
        datos.ingreso_factura = new Date().toISOString().split("T")[0];

        const seguro = await Caja.Seguros.findOne({ where: { id_datos: folio } });
        const aseguradora = await Caja.Aseguradoras.findOne({ where: { id_seguro: seguro.aseguradora } });
        if (seguro && aseguradora) {
          let fechaPago = new Date();
          fechaPago.setDate(fechaPago.getDate() + aseguradora.dias_plazo);
          datos.fecha_prob_pago = fechaPago.toISOString().split("T")[0];
        }
      }

      // Si se actualiza cfdi_complemento, calcular comisión
      if (datos.cfdi_complemento) {
        const seguro = await Caja.Seguros.findOne({ where: { id_datos: folio } });
        if (seguro && seguro.tabulacion) {
          await Caja.Seguros.update(
            {
              total_comision_cobrada: seguro.tabulacion * 0.03,
              estado_folio: "finalizado"
            },
            { where: { id_datos: folio }, user: req.user.correo, individualHooks: true }
          );
        }
      }

      if (datos.fecha_pago) {

        const seguro = await Caja.Seguros.findOne({ where: { id_datos: folio } });

        const cobro = await Caja.Pagos.create({
          id_pago: uuidv4(),
          folio: folio,
          fecha: new Date().toISOString().split("T")[0],
          abono: seguro.tabulacion,
          x_paga: "paciente",
          y_recibe: "caja",
          id_tipo_pago: "ASEGURADORA",
        }, { user: req.user.correo, individualHooks: true });

        const GestorAs = await Caja.Gestor.findOne({
          where: { folio: folio },
        });

        await Caja.EntradaSalida.create({
          id: uuidv4(),
          id_gestor: GestorAs.id_gestor,
          id_pago: cobro.id_pago,
          tipo: "entrada",
        }, { user: req.user.correo, individualHooks: true });

        await Caja.Gestor.update(
          { estado_pago_caja_medico: "PAGADO", estado_pago_paciente_caja: "PAGADO" },
          { where: { folio: folio }, user: req.user.correo, individualHooks: true }
        );



        const comisionesArray = [
          {
            id_pago: cobro.id_pago,
            pagado_fijo: 0,
            pagado_real: 0,
            ganancia: 0,
            concepto: "MetodoPago",
          },
          {
            id_pago: cobro.id_pago,
            pagado_fijo: 0,
            pagado_real: 0,
            ganancia: 0,
            concepto: "IVA_MetodoPago",
          },
          {
            id_pago: cobro.id_pago,
            pagado_fijo: seguro.tabulacion * 0.03,
            pagado_real: 0,
            ganancia: 0,
            concepto: "Caja",
          },
          {
            id_pago: cobro.id_pago,
            pagado_fijo: (seguro.tabulacion * 0.03) * 0.16,
            pagado_real: 0,
            ganancia: 0,
            concepto: "IVA_Caja",
          },
        ];

        for (const c of comisionesArray) {
          console.log("Validando comisión:", c); // Depuración antes de insertar
          await Caja.Comisiones.create({
            id_comision: uuidv4(),
            id_pago: c.id_pago,
            pagado_fijo: c.pagado_fijo,
            pagado_real: c.pagado_real,
            ganancia: c.ganancia,
            concepto: c.concepto,
            cobrada: "no",
            abonado: 0,
          }, { user: req.user.correo, individualHooks: true });
        }

      }


      // Si se recibe "calcular_comision", realizar el cálculo sin CFDI Complemento
      if (datos.calcular_comision) {
        const seguro = await Caja.Seguros.findOne({ where: { id_datos: folio } });
        if (seguro && seguro.tabulacion) {
          await Caja.Seguros.update(
            {
              total_comision_cobrada: seguro.tabulacion * 0.03,
              estado_folio: "finalizado"
            },
            { where: { id_datos: folio }, user: req.user.correo, individualHooks: true }
          );
          await Caja.Folio.update(
            { monto_total: seguro.tabulacion },
            { where: { folio: folio }, user: req.user.correo, individualHooks: true }
          )
        }
        return res.json({ success: true });
      }


      await Caja.Seguros.update(datos, { where: { id_datos: folio }, user: req.user.correo, individualHooks: true });
      res.json({ success: true });
    } catch (err) {
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