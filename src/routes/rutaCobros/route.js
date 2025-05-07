const Caja = require("../../models/modelo.js");
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require('uuid');
const { Op } = require("sequelize");

module.exports = function (passport) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype === "application/pdf") {
        cb(null, true);
      } else {
        cb(new Error("Solo se permiten archivos PDF"));
      }
    },
  });
  router.get("/Cobros/Principal", isLoggedIn, async (req, res) => {
    res.render("Cobros/Principal");
  });

  router.get("/Cobros/Paciente", isLoggedIn, async (req, res) => {
    res.render("Cobros/Paciente");
  });

  router.get("/Cobros/Ingresa/:id", isLoggedIn, async (req, res) => {
    const q1 = req.params.id;

    res.render("Cobros/Ingresa", {
      id: q1,
    });
  });

  router.get("/Cobros/Visualiza/:id", isLoggedIn, async (req, res) => {
    const q1 = req.params.id;

    try {
      const folios = await Caja.Archivos.findAll({
        where: { folio: q1 },
      });

      res.render("Cobros/Visualiza", { id: q1, datos: folios });
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.get("/Cobros/Eleccion", isLoggedIn, async (req, res) => {
    res.render("Cobros/Eleccion");
  })
  router.post(
    "/Cobros/Ingresa/:id",
    upload.single("fileInput"),
    isLoggedIn,
    async (req, res) => {
      try {
        const nameFile = req.file?.originalname;
        const fileInput = req.file?.buffer;
        const q1 = req.params.id;
        if (!fileInput) {
          throw new Error("No se ha subido ningún archivo");
        }

        // Crear registro en la base de datos
        const addFile = await Caja.Archivos.create({
          folio: q1,
          nombre: nameFile,
          archivo: fileInput, // Guarda el archivo en formato BLOB
        }, { user: req.user.correo, individualHooks: true });

        // Redirigir al usuario después de una subida exitosa
        res.redirect("/Cobros/Principal");
      } catch (err) {
        console.error(err);
        res.render("Error", { message: err.message });
      }
    }
  );

  router.get("/Cobros/Descarga/:id", isLoggedIn, async (req, res) => {
    const identificador = req.params.id;
    try {
      const file = await Caja.Archivos.findOne({
        where: { id: identificador },
      });

      if (!file) {
        throw new Error("Archivo no encontrado");
      }

      // Si existe el query parameter "preview", mostramos en línea
      const disposition = req.query.preview === 'true' ? "inline" : "attachment";

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${file.nombre}"`
      });

      res.send(file.archivo);
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });
  router.get("/Cobros/Detalles/:id/:tipo", isLoggedIn, async (req, res) => {
    try {
      const { id, tipo } = req.params;
      let Pagos = [];
      let DG = null;
      let Comisiones = [];
      let tb = 0;
      const mapeoMetodosPago = {};

      if (tipo === "paciente") {
        // Consultar los pagos realizados por el paciente a la caja
        Pagos = await Caja.Pagos.findAll({
          where: { folio: id, x_paga: "paciente", y_recibe: "caja" },
          raw: true,
        });

        // Obtener información general del folio
        DG = await Caja.Folio.findOne({
          where: { folio: id },
          raw: true,
        });
      } else {

        Pagos = await Caja.Pagos.findAll({
          where: { folio: id, x_paga: "medico", y_recibe: "caja" },
          raw: true,
        });
        // Consultar las comisiones asociadas al folio
        const Pagos2 = await Caja.Pagos.findAll({
          where: {
            folio: id,
            x_paga: "paciente",
            y_recibe: "caja",
          },
          include: [
            {
              model: Caja.Comisiones,
              attributes: ["concepto", "pagado_fijo", "pagado_real", "ganancia"],
            },
          ],
          // Sin raw ni nest para asegurar que las asociaciones funcionen correctamente
        });

        // Inicializamos tb para la suma de los valores de "Caja"
        // Objeto para mapear los métodos de pago con sus respectivas comisiones

        for (const p of Pagos2) {
          const metodo = p.id_tipo_pago; // Identificar el método de pago
          if (!mapeoMetodosPago[metodo]) {
            mapeoMetodosPago[metodo] = {
              Nombre: metodo,
              MetodoPago: 0,
              IVA_MetodoPago: 0,
            };
          }

          // Validar que `p.Comisiones` sea un array antes de iterar
          if (Array.isArray(p.Comisiones)) {
            for (const com of p.Comisiones) {
              switch (com.concepto) {
                case "MetodoPago":
                  mapeoMetodosPago[metodo].MetodoPago += com.pagado_fijo || 0;
                  break;
                case "IVA_MetodoPago":
                  mapeoMetodosPago[metodo].IVA_MetodoPago += com.pagado_fijo || 0;
                  break;
                case "Caja":
                  tb += com.pagado_fijo || 0; // Sumar los valores de "pagado_real" para "Caja"
                  break;
              }
            }
          } else {
            console.warn(`Comisiones no es un array para el pago con id_pago: ${p.id_pago}`);
          }
        }

      }

      // Calcular el total bruto y el IVA
      const totalBruto = tb;
      const iva = tb * .16;

      res.render("Cobros/Detalles", {
        nombre: req.user.nombre,
        datos: Pagos,
        acceso: req.user.nivel_acceso,
        total_bruto: totalBruto.toFixed(2),
        iva_desc: iva.toFixed(2),
        tipo: tipo,
        comisiones: mapeoMetodosPago, // Incluir comisiones en la vista
      });
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });


  router.get("/Cobros/Abono", isLoggedIn, async (req, res) => {
    try {
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
            model: Caja.Medico,
            attributes: ["nombre", "apellido_p", "apellido_m"],
          },
          {
            model: Caja.Gestor,
            attributes: ["abono_total_pc"],
            required: true,
            where: {
              estado_pago_paciente_caja: "No pagado",
            },
          },
        ],
        raw: true,
        nest: true,
      });

      const datosAplanados = folios.map((record) => ({
        Folio: record.folio,
        Habitacion: record.habitacion,
        Fecha: record.fecha,
        Paciente: record.paciente,
        Tipo_Folio: record.tipo_folio,
        Estado_Folio: record.estado_folio,
        Total: record.monto_total,
        Medico_Nombre: record.Medico.nombre,
        Medico_Apellido_P: record.Medico.apellido_p,
        Medico_Apellido_M: record.Medico.apellido_m,
        Falta: record.monto_total - record.Gestor.abono_total_pc,
      }));

      console.log(datosAplanados);
      res.render("Cobros/Abono", {
        nombre: req.user.nombre,
        datos: datosAplanados,
        acceso: req.user.nivel_acceso,
      });
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });


  router.get("/Cobros/Comision", isLoggedIn, async (req, res) => {
    try {
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
        include: [
          {
            model: Caja.Medico,
            attributes: ["nombre", "apellido_p", "apellido_m"],
          },
          {
            model: Caja.Gestor,
            attributes: ["estado_pago_medico_caja", "abono_total_mc", "cobro_comision_paciente"],
            required: false,
          },
          {
            model: Caja.Pagos,
            required: false,
            where: {
              x_paga: "paciente",
              y_recibe: "caja",
            },
            include: [
              {
                model: Caja.Comisiones,
                attributes: ["pagado_fijo", "pagado_real", "ganancia", "concepto"],
              },
            ],
          },
        ],
        raw: false,
        nest: true,
      });

      // Filtrar registros donde estado_pago_medico_caja no sea "PAGADO"
      const datosFiltrados = folios.filter(
        (record) => record.Gestor?.estado_pago_medico_caja !== "PAGADO"
      );

      // Procesar los datos
      const datosAplanados = datosFiltrados.map((record) => {
        // Sumar todas las comisiones asociadas al folio
        const pagos = Array.isArray(record.Pagos) ? record.Pagos : [];

        // Sumar valores de pagado_fijo
        const totalComisiones = pagos.reduce((acc, pago) => {
          const comisionesPago = Array.isArray(pago.Comisiones) ? pago.Comisiones : [];
          return acc + comisionesPago.reduce((sum, com) => sum + parseFloat(com.pagado_fijo || 0), 0);
        }, 0);

        // Sumar valores de pagado_real solo para conceptos IVA_Caja y Caja
        const totalPagadoReal = pagos.reduce((acc, pago) => {
          const comisionesPago = Array.isArray(pago.Comisiones) ? pago.Comisiones : [];
          return (
            acc +
            comisionesPago.reduce((sum, com) => {
              if (com.concepto === "IVA_Caja" || com.concepto === "Caja") {
                return sum + parseFloat(com.pagado_real || 0);
              }
              return sum;
            }, 0)
          );
        }, 0);

        // Calcular el total final sumando totalComisiones y totalPagadoReal
        const totalFinal = totalComisiones + totalPagadoReal;

        return {
          Folio: record.folio,
          Habitacion: record.habitacion,
          Fecha: record.fecha,
          Paciente: record.paciente,
          Tipo_Folio: record.tipo_folio,
          Estado_Folio: record.estado_folio,
          Medico_Nombre: record.Medico?.nombre || "N/A",
          Medico_Apellido_P: record.Medico?.apellido_p || "N/A",
          Medico_Apellido_M: record.Medico?.apellido_m || "N/A",
          Estatus: record.Gestor?.estado_pago_medico_caja || "Pendiente",
          comi_pa: record.Gestor?.cobro_comision_paciente ? "1" : "0",
          Total_Comisiones: totalComisiones.toFixed(2), // Solo las comisiones sumadas
          Total_Pagado_Real: totalPagadoReal.toFixed(2), // Total de pagado_real para IVA_Caja y Caja
          Total: totalFinal.toFixed(2), // Suma de totalComisiones y totalPagadoReal
          debe_todavia:
            totalFinal - (record.Gestor ? parseFloat(record.Gestor.abono_total_mc || 0) : 0),
        };
      });



      res.render("Cobros/Comision", {
        nombre: req.user.nombre,
        datos: datosAplanados,
        acceso: req.user.nivel_acceso,
      });
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });


  //AQUI ESTA LO DE COBRAR COMISIONES A DOCTORES (ALRATO LO CAMBIO)
  router.get("/Cobros/ComisionCobro/:id/:total", isLoggedIn, async (req, res) => {
    try {
      const Metodos = await Caja.MetodosPago.findAll({
        where: {habilitado : "si"}
      });
      const Folio = await Caja.Folio.findOne({
        where: { folio: req.params.id },
      });
      const Debe = await Caja.Gestor.findOne({
        where: { folio: req.params.id }
      });

      let monto_total = parseFloat(req.params.total);
      let pag = Debe.abono_total_mc;
      let debe = parseFloat((monto_total - pag).toFixed(2));

      console.log("debe:", debe);
      console.log("pag:", pag);
      console.log("tot:", monto_total);


      res.render("Cobros/ComisionCobro", {
        nombre: req.user.nombre,
        pago: Metodos,
        folio: Folio,
        acceso: req.user.nivel_acceso,
        debe_todavia: debe,
        total: req.params.total
      });
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.post("/Cobros/ComisionCobro/:id/:total", isLoggedIn, async (req, res) => {
    try {
      const { Abono } = req.body;
      const folioId = req.params.id;
      const monto_total = parseFloat(req.params.total);

      console.log("Folio:" + folioId);
      console.log("Abono" + Abono);

      if (!Abono) {
        throw new Error("Faltan datos obligatorios (Abono)");
      }

      const abono = parseFloat(Abono); // Convierte abono a número
      if (isNaN(abono) || abono <= 0) {
        throw new Error("El abono debe ser un número válido y mayor a cero, incluyendo decimales");
      }

      const debePac = await Caja.Folio.findOne({ where: { folio: folioId } });
      if (!debePac) {
        throw new Error(`Folio no encontrado: ${folioId}`);
      }

      const GestorAs = await Caja.Gestor.findOne({ where: { folio: folioId } });
      if (!GestorAs) {
        throw new Error(`Gestor no encontrado para folio: ${folioId}`);
      }

      const PagosAsociados = await Caja.Pagos.findAll({ where: { folio: folioId, x_paga: 'paciente', y_recibe: 'caja' } });
      if (!PagosAsociados || PagosAsociados.length === 0) {
        throw new Error(`No se encontraron pagos asociados para el folio: ${folioId}`);
      }
      //console.log("Pagos:", PagosAsociados);

      var comisiones = [];
      for (const p of PagosAsociados) {
        const comisionesPago = await Caja.Comisiones.findAll({ where: { id_pago: p.id_pago, cobrada: 'no' } });
        comisiones = comisiones.concat(comisionesPago);
      }
      //console.log('las comisiones asociadas a los pagos son:', comisiones);

      // AQUI SE COBRAN LAS COMISIONES UNA POR UNA
      var aux = abono;
      for (const c of comisiones) {
        if (aux > 0) {
          if (c.pagado_fijo > 0) {
            const diferencia = c.pagado_fijo - c.abonado;
            if (diferencia >= 0) {
              if (aux >= diferencia) {
                aux -= diferencia;
                await Caja.Comisiones.update({ abonado: c.pagado_fijo, cobrada: 'si' }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
              } else {
                await Caja.Comisiones.update({ abonado: c.abonado + aux }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
                aux = 0;
              }
            }
          }
        } else {
          break;
        }
      }

      // Verificar que se actualizaron correctamente
      const comisionesActualizadas = await Caja.Comisiones.findAll({ where: { id_pago: PagosAsociados.map(p => p.id_pago), cobrada: 'no' } });
      for (const c of comisionesActualizadas) {
        if (c.abonado === c.pagado_fijo && c.cobrada !== 'si') {
          await Caja.Comisiones.update({ cobrada: 'si' }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
        }
      }
      const currentAbono = parseFloat(GestorAs.abono_total_mc || 0);
      const calculo = Number((currentAbono + abono).toFixed(2));

      if (calculo > monto_total) {
        throw new Error(
          `El abono excede el monto total. Total acumulado: ${calculo}, Monto total: ${monto_total}`
        );
      }

      const hoy = new Date();

      // Crea el registro de cobro
      const cobro = await Caja.Pagos.create({
        id_pago: uuidv4(),
        folio: folioId,
        fecha: hoy.toISOString().split("T")[0],
        abono: abono,
        x_paga: "medico",
        y_recibe: "caja",
        id_tipo_pago: 'TRANSFERENCIA',
      }, { user: req.user.correo, individualHooks: true });

      // Crea el registro de entrada/salida
      await Caja.EntradaSalida.create({
        id: uuidv4(),
        id_gestor: GestorAs.id_gestor,
        id_pago: cobro.id_pago,
        tipo: "entrada",
      }, { user: req.user.correo, individualHooks: true });

      // Actualiza el estado de pago del gestor
      const estadoPago = calculo === parseFloat(monto_total.toFixed(2)) ? "PAGADO" : GestorAs.estado_pago_medico_caja;
      await Caja.Gestor.update(
        {
          abono_total_mc: calculo,
          estado_pago_medico_caja: estadoPago,
        },
        {
          where: { id_gestor: GestorAs.id_gestor }, user: req.user.correo, individualHooks: true
        }
      );

      // Verificar si todos los pagos están en estado PAGADO para actualizar el folio como FINALIZADO
      const consulta_Gestor = await Caja.Gestor.findOne({ where: { folio: folioId } });
      if (
        consulta_Gestor.estado_pago_medico_caja === 'PAGADO' &&
        consulta_Gestor.estado_pago_caja_medico === 'PAGADO' &&
        consulta_Gestor.estado_pago_paciente_caja === 'PAGADO'
      ) {
        await Caja.Folio.update(
          { estado_folio: 'FINALIZADO' },
          { where: { folio: folioId }, user: req.user.correo, individualHooks: true }
        );
      }

      res.redirect("/Cobros/Comision");
    } catch (error) {
      console.error(error);
      res.render("Error", { message: "Error en el proceso de cobro de comisión:" + error.message });
    }
  });

  router.get("/Cobros/Cobro/:id", isLoggedIn, async (req, res) => {
    try {
      const Metodos = await Caja.MetodosPago.findAll({
        where: {
          id_metodo: {
            [Op.notIn]: ['MIXTO', 'ASEGURADORA']
          }
        }, 
          where: {habilitado : "si"}
        
      });
      const Folio = await Caja.Folio.findOne({
        where: { folio: req.params.id },
      });
      const Debe = await Caja.Gestor.findOne({
        where: { folio: req.params.id }
      })

      let pag = Debe.abono_total_pc;
      let debe = (Folio.monto_total - pag).toFixed(2);
      console.log("debe", debe);
      console.log("pag", pag);
      res.render("Cobros/Cobro", {
        nombre: req.user.nombre,
        pago: Metodos,
        folio: Folio,
        acceso: req.user.nivel_acceso,
        debe_todavia: debe,
        Gestor: Debe
      });

    } catch (err) {
      console.error(err);
      res.render("Error", { message: "Error al obtener los datos:" + err.message });
    }
  });

  router.post("/Cobros/Cobro/:id", isLoggedIn, async (req, res) => {
    try {
      const { CobrarComision, Abono, Id_Pago } = req.body;
      const folioId = req.params.id;

      // Validación inicial
      if (!Abono || !Id_Pago) {
        throw new Error("Faltan datos obligatorios (abono o id_metodo)");
      }

      const abono = parseFloat(Abono);

      // Buscar el folio
      const debePac = await Caja.Folio.findOne({
        where: { folio: folioId },
      });
      if (!debePac) {
        throw new Error(`Folio no encontrado: ${folioId}`);
      }

      // Buscar el gestor
      const GestorAs = await Caja.Gestor.findOne({
        where: { folio: folioId },
      });
      if (!GestorAs) {
        throw new Error(`Gestor no encontrado para folio: ${folioId}`);
      }

      let tot_cob;
      // Verificar si se aplica la comisión
      if (CobrarComision === "1" && !GestorAs.cobro_comision_paciente) {
        tot_cob = parseFloat((debePac.monto_total * 1.07).toFixed(2)); // Incremento del 7%
        await Caja.Folio.update(
          { monto_total: tot_cob },
          { where: { folio: folioId }, user: req.user.correo, individualHooks: true }
        );

        await Caja.Gestor.update(
          { cobro_comision_paciente: true },
          { where: { folio: folioId }, user: req.user.correo, individualHooks: true }
        );
      } else {
        tot_cob = parseFloat(debePac.monto_total); // Monto original sin comisión
      }

      // Depuración de valores
      console.log(`Folio ID: ${folioId}`);
      console.log(`Monto total (con comisión si aplica): ${tot_cob}`);
      console.log(`Abono recibido: ${abono}`);
      console.log(`Abono previo del paciente: ${GestorAs.abono_total_pc}`);

      const currentAbono = parseFloat(GestorAs.abono_total_pc) || 0;
      const calculo = Number((currentAbono + abono).toFixed(2));

      // Crear el registro de cobro
      const cobro = await Caja.Pagos.create({
        id_pago: uuidv4(),
        folio: folioId,
        fecha: new Date().toISOString().split("T")[0],
        abono,
        x_paga: "paciente",
        y_recibe: "caja",
        id_tipo_pago: Id_Pago,
      }, { user: req.user.correo, individualHooks: true });

      // Crear el registro de entrada/salida
      await Caja.EntradaSalida.create({
        id: uuidv4(),
        id_gestor: GestorAs.id_gestor,
        id_pago: cobro.id_pago,
        tipo: "entrada",
      }, { user: req.user.correo, individualHooks: true });

      // Actualizar el estado de pago del gestor
      if (calculo >= tot_cob) {
        console.log(`Estado: PAGADO (calculo=${calculo}, tot_cob=${tot_cob})`);
        await Caja.Gestor.update(
          {
            abono_total_pc: calculo,
            estado_pago_paciente_caja: "PAGADO",
          },
          {
            where: { id_gestor: GestorAs.id_gestor }, user: req.user.correo, individualHooks: true
          }
        );
      } else {
        console.log(`Estado: PARCIAL (calculo=${calculo}, tot_cob=${tot_cob})`);
        await Caja.Gestor.update(
          {
            abono_total_pc: calculo,
          },
          {
            where: { id_gestor: GestorAs.id_gestor }, user: req.user.correo, individualHooks: true
          }
        );
      }

      // Calcular las comisiones
      const Metodo = await Caja.MetodosPago.findOne({
        where: { id_metodo: Id_Pago },
      });
      if (!Metodo) {
        throw new Error(`Método de pago no encontrado: ${Id_Pago}`);
      }

      if (CobrarComision != "1") {
        const todas_comi = await calcularComisiones(folioId, abono, Id_Pago);
        console.log("Comisiones calculadas:", todas_comi); // Depuración

        const comisionesArray = [
          {
            id_pago: cobro.id_pago,
            pagado_fijo: todas_comi.comision_metodo_fijo || 0,
            pagado_real: todas_comi.comision_metodo_real || 0,
            ganancia:
              (todas_comi.comision_metodo_fijo || 0) -
              (todas_comi.comision_metodo_real || 0),
            concepto: "MetodoPago",
          },
          {
            id_pago: cobro.id_pago,
            pagado_fijo: todas_comi.iva_comision_metodo_fijo || 0,
            pagado_real: todas_comi.iva_comision_metodo_real || 0,
            ganancia:
              (todas_comi.iva_comision_metodo_fijo || 0) -
              (todas_comi.iva_comision_metodo_real || 0),
            concepto: "IVA_MetodoPago",
          },
          {
            id_pago: cobro.id_pago,
            pagado_fijo: todas_comi.comision_caja || 0,
            pagado_real: 0,
            ganancia: todas_comi.comision_caja || 0,
            concepto: "Caja",
          },
          {
            id_pago: cobro.id_pago,
            pagado_fijo: todas_comi.iva_comision_caja || 0,
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



      // Redirigir
      res.redirect("/Cobros/Abono");
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.get("/Cobros/Almacenamiento", isLoggedIn, async (req, res) => {
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
    res.render("Cobros/Almacenamiento", {
      nombre: req.user.nombre,
      datos: datosAplanados,
      acceso: req.user.nivel_acceso,
    });
  });



  router.get("/Cobros/Desborde", isLoggedIn, async (req, res) => {
    try {
      const medicos = await Caja.Medico.findAll();
      res.render("Cobros/Desborde", {
        medicos: medicos
      });
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.post("/Cobros/Desborde", isLoggedIn, async (req, res) => {
    try {
      const { medico, monto } = req.body;
      // Conseguimos los folios sin finalizar más antiguos
      const folios = await Caja.Folio.findAll({
        where: {
          medico: medico,
          estado_folio: {
            [Op.ne]: 'FINALIZADO', // Distinto de 'FINALIZADO'
          },
        },
        include: [
          {
            model: Caja.Gestor,
            required: true,
            where: {
              estado_pago_medico_caja: {
                [Op.ne]: 'PAGADO', // Distinto de 'PAGADO'
              },
            },
          },
        ],
        order: [['fecha', 'ASC']], // Ordenar por fecha de forma ascendente (más antiguo a más nuevo)
      });

      var aux = parseFloat(monto);

      for (const folio of folios) {
        if (aux <= 0) break; // Salir del bucle si no hay más monto para abonar

        const folioId = folio.folio;
        const PagosAsociados = await Caja.Pagos.findAll({ where: { folio: folioId, x_paga: 'paciente', y_recibe: 'caja' } });
        if (!PagosAsociados || PagosAsociados.length === 0) {
          throw new Error(`No se encontraron pagos asociados para el folio: ${folioId}`);
        }
        console.log("Pagos:", PagosAsociados);

        var comisiones = [];
        for (const p of PagosAsociados) {
          const comisionesPago = await Caja.Comisiones.findAll({ where: { id_pago: p.id_pago, cobrada: 'no' } });
          comisiones = comisiones.concat(comisionesPago);
        }

        var totalAbonado = 0;
        for (const c of comisiones) {
          if (aux > 0) {
            if (c.pagado_fijo > 0) {
              const diferencia = c.pagado_fijo - c.abonado;
              if (diferencia > 0) {
                if (aux >= diferencia) {
                  aux -= diferencia;
                  totalAbonado += diferencia;
                  await Caja.Comisiones.update({ abonado: c.pagado_fijo, cobrada: 'si' }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
                } else {
                  totalAbonado += aux;
                  await Caja.Comisiones.update({ abonado: c.abonado + aux }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
                  aux = 0;
                }
              }
            }
          } else {
            break;
          }
        }

        const comisionesActualizadas = await Caja.Comisiones.findAll({ where: { id_pago: PagosAsociados.map(p => p.id_pago), cobrada: 'no' } });
        for (const c of comisionesActualizadas) {
          if (c.abonado === c.pagado_fijo && c.cobrada !== 'si') {
            await Caja.Comisiones.update({ cobrada: 'si' }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
          }
        }

        // Verificar si todas las comisiones han sido pagadas
        const comisionesPendientes = await Caja.Comisiones.findAll({ where: { id_pago: PagosAsociados.map(p => p.id_pago), cobrada: 'no' } });
        const estadoPagoMedicoCaja = comisionesPendientes.length === 0 ? 'PAGADO' : folio.Gestor.estado_pago_medico_caja;

        // Actualizar el gestor con el total abonado y el estado de pago
        await Caja.Gestor.update(
          {
            abono_total_mc: folio.Gestor.abono_total_mc + totalAbonado,
            estado_pago_medico_caja: estadoPagoMedicoCaja
          },
          { where: { id_gestor: folio.Gestor.id_gestor }, user: req.user.correo, individualHooks: true }
        );

        // Verificar si todos los pagos están en estado PAGADO para actualizar el folio como FINALIZADO
        const consulta_Gestor = await Caja.Gestor.findOne({ where: { folio: folioId } });
        if (
          consulta_Gestor.estado_pago_medico_caja === 'PAGADO' &&
          consulta_Gestor.estado_pago_caja_medico === 'PAGADO' &&
          consulta_Gestor.estado_pago_paciente_caja === 'PAGADO'
        ) {
          await Caja.Folio.update(
            { estado_folio: 'FINALIZADO' },
            { where: { folio: folioId }, user: req.user.correo, individualHooks: true }
          );
        }

        // Crear el registro de pago en la base de datos
        const hoy = new Date();
        await Caja.Pagos.create({
          id_pago: uuidv4(),
          folio: folioId,
          fecha: hoy.toISOString().split("T")[0],
          abono: totalAbonado,
          x_paga: "medico",
          y_recibe: "caja",
          id_tipo_pago: 'TRANSFERENCIA',
        }, { user: req.user.correo, individualHooks: true });
      }

      var msg = `La operación se realizo con éxito.`;
      if (aux > 0) {
        msg = `Sobró dinero después de pagar todas las comisiones.  Monto a devolver: ${aux}`;
      }
      res.render('Cobros/DetallesDesborde', { msg: msg, excedente: aux, monto: monto });
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

async function calcularComisiones(folio, monto_total, metodo) {
  if (isNaN(monto_total)) {
    throw new Error('Monto total no es un número válido');
  }

  const metodo_pago = await Caja.MetodosPago.findOne({ where: { id_metodo: metodo } });
  if (!metodo_pago) {
    throw new Error('Método de pago no encontrado');
  }
  if (!folio || isNaN(monto_total)) {
    throw new Error('Folio o monto total no son válidos');
  }

  const porcentaje_real = parseFloat(metodo_pago.porcentaje_real);
  const porcentaje_fijo = parseFloat(metodo_pago.porcentaje_fijo);

  if (isNaN(porcentaje_real) || isNaN(porcentaje_fijo)) {
    throw new Error('Porcentaje no es un número válido');
  }

  // Realizar cálculos en formato numérico
  const comision_caja = monto_total * 0.026;
  const iva_comision_caja = comision_caja * 0.16;

  const comision_metodo_real = monto_total * porcentaje_real;
  const iva_comision_metodo_real = comision_metodo_real * 0.16;

  const comision_metodo_fijo = monto_total * porcentaje_fijo;
  const iva_comision_metodo_fijo = comision_metodo_fijo * 0.16;

  // Total de retención
  const retencion = comision_caja + iva_comision_caja + comision_metodo_fijo + iva_comision_metodo_fijo;

  console.log('-------------------------------------------------------');
  console.log('Monto:' + monto_total + ' Metodo de pago:' + metodo);
  console.log('-------------------------------------------------------');
  console.log('Comisión de la caja:' + comision_caja);
  console.log('IVA Comisión de la caja:' + iva_comision_caja);
  console.log('Comisión método de pago real:' + comision_metodo_real);
  console.log('IVA Comisión método de pago real:' + iva_comision_metodo_real);
  console.log('Comisión método de pago fijo:' + comision_metodo_fijo);
  console.log('IVA Comisión método de pago fijo:' + iva_comision_metodo_fijo);
  console.log('Total reteción:' + retencion);
  console.log('-------------------------------------------------------');

  // Redondear los valores a 2 decimales y convertir a número
  return {
    comision_caja: Number(comision_caja.toFixed(2)),
    iva_comision_caja: Number(iva_comision_caja.toFixed(2)),
    comision_metodo_real: Number(comision_metodo_real.toFixed(2)),
    iva_comision_metodo_real: Number(iva_comision_metodo_real.toFixed(2)),
    comision_metodo_fijo: Number(comision_metodo_fijo.toFixed(2)),
    iva_comision_metodo_fijo: Number(iva_comision_metodo_fijo.toFixed(2)),
    retencion: Number(retencion.toFixed(2))
  };
}