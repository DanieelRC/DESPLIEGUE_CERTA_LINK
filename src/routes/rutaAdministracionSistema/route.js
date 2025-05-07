const Caja = require("../../models/modelo.js");
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require('uuid');
const { Op } = require("sequelize");
const { normalize } = require("path");

// Middleware to check if user is an administrator
function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.nivel_acceso === 'Administrador') {
    return next();
  }
  res.redirect('/AdministracionFolios');
}

module.exports = function (passport) {
  const router = express.Router();

  router.get(
    "/AdministracionSistema/Principal",
    isLoggedIn,
    isAdmin,
    async (req, res) => {
      res.render("AdministracionSistema/Principal");
    }
  );

  router.get("/AdministracionSistema/CrearMetodo", isLoggedIn, isAdmin, async (req, res) => {
    const metodos = await Caja.MetodosPago.findAll({
      attributes: ["id_metodo"], // Si id_metodo es el nombre del método, está bien así
      raw: true
    });

    console.log("Métodos existentes:", metodos); // Verifica qué datos se están enviando al frontend

    res.render("AdministracionSistema/CrearMetodo", {
      datos: metodos, // Enviamos los métodos al frontend
      nombre: req.user.nombre,
      acceso: req.user.nivel_acceso
    });
  });

  router.get("/AdministracionSistema/EditarMetodo/:id", isLoggedIn, isAdmin, async (req, res) => {

    const id = req.params.id;

    const met = await Caja.MetodosPago.findOne({
      attributes: ["id_metodo", "porcentaje_real", "porcentaje_fijo"],
      where: { id_metodo: id },
      raw: true
    });

    const datosAplanados = met
      ? {
        Metodo: met.id_metodo,
        Porcentaje_Real: parseFloat((met.porcentaje_real * 100).toFixed(2)),
        Porcentaje_Fijo: parseFloat((met.porcentaje_fijo * 100).toFixed(2)),
      }
      : null; // Manejo si no encuentra nada

    console.log(datosAplanados);

    res.render("AdministracionSistema/EditarMetodo", {
      metodo: datosAplanados,
      nombre: req.user.nombre,
      acceso: req.user.nivel_acceso
    })

  });

  router.post("/AdministracionSistema/EditarMetodo/:id", isLoggedIn, isAdmin, async (req, res) => {

    const { Porcentaje_Real, Porcentaje_Fijo } = req.body;
    const id = req.params.id;

    const p_f = Porcentaje_Fijo / 100;
    const p_r = Porcentaje_Real / 100;
    await Caja.MetodosPago.update(
      { porcentaje_fijo: p_f, porcentaje_real: p_r },
      { where: { id_metodo: id }, user: req.user.correo, individualHooks: true, saveHistory: true }
    );
    res.redirect("/AdministracionSistema/Comisiones");
  });


  router.post("/AdministracionSistema/CrearMetodo", isLoggedIn, isAdmin, async (req, res) => {
    const { Metodo, Porcentaje_Real, Porcentaje_Fijo } = req.body;
    const p_r = Porcentaje_Real / 100;
    const p_f = Porcentaje_Fijo / 100;

    try {
      const AddMet = await Caja.MetodosPago.create({
        id_metodo: Metodo,
        porcentaje_real: p_r,
        porcentaje_fijo: p_f,
      },
        {
          user: req.user.correo, individualHooks: true
        });

      res.redirect("/AdministracionSistema/Comisiones");
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }

  });

  router.get("/AdministracionSistema/cambiarEdo/:id", isLoggedIn, isAdmin, async (req, res) => {
    try {
      const med = req.params.id;

      const ob = await Caja.Medico.findOne({ where: { correo: med } });

      if (!ob) {
        return res.redirect("/AdministracionSistema/Medicos"); // Evita errores si el usuario no existe
      }

      // Alternar estado
      await Caja.Medico.update(
        { estado: ob.estado === "inhabilitado" ? "habilitado" : "inhabilitado" },
        { where: { correo: med }, user: req.user.correo, individualHooks: true, saveHistory: true }
      );

      res.redirect("/AdministracionSistema/Medicos"); // Redirige en lugar de renderizar
    } catch (error) {
      console.error("Error al cambiar el estado:", error);
      res.redirect("/AdministracionSistema/Medicos"); // En caso de error, redirigir a la misma página
    }
  });


  router.get("/AdministracionSistema/cambiarEdoAse/:id", isLoggedIn, isAdmin, async (req, res) => {
    try {
      const ase = req.params.id;

      const ob = await Caja.Aseguradoras.findOne({ where: { id_seguro: ase } });

      if (!ob) {
        return res.redirect("/AdministracionSistema/Aseguradoras"); // Evita errores si el usuario no existe
      }

      // Alternar estado
      await Caja.Aseguradoras.update(
        { habilitado: ob.habilitado === "no" ? "si" : "no" },
        { where: { id_seguro: ase }, user: req.user.correo, individualHooks: true, saveHistory: true }
      );

      res.redirect("/AdministracionSistema/Aseguradoras"); // Redirige en lugar de renderizar
    } catch (error) {
      console.error("Error al cambiar el estado:", error);
      res.redirect("/AdministracionSistema/Aseguradoras"); // En caso de error, redirigir a la misma página
    }
  });

  router.get("/AdministracionSistema/cambiarEdoMetodo/:id", isLoggedIn, isAdmin, async (req, res) => {
    try {
      const met = req.params.id;

      const ob = await Caja.MetodosPago.findOne({ where: { id_metodo: met } });

      if (!ob) {
        return res.redirect("/AdministracionSistema/Comisiones"); // Evita errores si el usuario no existe
      }

      // Alternar estado
      await Caja.MetodosPago.update(
        { habilitado: ob.habilitado === "no" ? "si" : "no" },
        { where: { id_metodo: met }, user: req.user.correo, individualHooks: true, saveHistory: true }
      );

      res.redirect("/AdministracionSistema/Comisiones"); // Redirige en lugar de renderizar
    } catch (error) {
      console.error("Error al cambiar el estado:", error);
      res.redirect("/AdministracionSistema/Comisiones"); // En caso de error, redirigir a la misma página
    }
  });

  router.get("/AdministracionSistema/Medicos", isLoggedIn, isAdmin, async (req, res) => {

    try {

      const medicos = await Caja.Medico.findAll({
        attributes: [
          "correo",
          "nombre",
          "apellido_p",
          "apellido_m",
          "estado"
        ],
        required: true,
        raw: true,
        nest: true,
      });

      res.render("AdministracionSistema/Medicos", {
        datos: medicos,
        nombre: req.user.nombre,
        acceso: req.user.nivel_acceso
      })

    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.get("/AdministracionSistema/Comisiones", isLoggedIn, isAdmin, async (req, res) => {
    const comisiones = await Caja.MetodosPago.findAll({
      attributes: [
        "id_metodo",
        "porcentaje_real",
        "porcentaje_fijo",
        "habilitado"
      ],
      raw: true,
      nest: true,
    });
    const datosAplanados = comisiones.map((record) => ({
      Metodo: record.id_metodo,
      Porcentaje_Real: parseFloat((record.porcentaje_real * 100).toFixed(2)),
      Porcentaje_Fijo: parseFloat((record.porcentaje_fijo * 100).toFixed(2)),
      Habilitado: record.habilitado
    }));


    res.render("AdministracionSistema/Comisiones", {
      datos: datosAplanados,
      nombre: req.user.nombre,
      acceso: req.user.nivel_acceso
    });
  })

  router.get("/AdministracionSistema/CrearMedico", isLoggedIn, isAdmin, async (req, res) => {

    try {

      const registrados = await Caja.Medico.findAll({
        attributes: [
          "correo"
        ],
        required: true,
        raw: true,
        nest: true,
      })

      res.render("AdministracionSistema/CrearMedico", {
        medicos: registrados,
        nombre: req.user.nombre,
        acceso: req.user.nivel_acceso,
      });

    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.post("/AdministracionSistema/CrearMedico", isLoggedIn, isAdmin, async (req, res) => {

    try {
      const { Correo, Nombre, Apellido_P, Apellido_M } = req.body;
      console.log(Correo);
      console.log(Nombre);
      console.log(Apellido_P);
      console.log(Apellido_M);

      const AddMed = await Caja.Medico.create({
        correo: Correo,
        nombre: Nombre,
        apellido_p: Apellido_P,
        apellido_m: Apellido_M,
        estado: "habilitado",
      }, { user: req.user.correo, individualHooks: true });

      res.redirect("/AdministracionSistema/Medicos");
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.get("/AdministracionSistema/EditarMedico/:id", isLoggedIn, isAdmin, async (req, res) => {
    try {

      const Medico = await Caja.Medico.findOne({
        where: { correo: req.params.id }
      })

      res.render("AdministracionSistema/EditarMedico", {
        med: Medico,
        nombre: req.user.nombre,
        acceso: req.user.nivel_acceso,
      });

    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.post("/AdministracionSistema/EditarMedico/:id", isLoggedIn, isAdmin, async (req, res) => {
    const t = await Caja.sequelize.transaction(); // Inicia transacción

    try {
      const { Correo, Nombre, Apellido_P, Apellido_M } = req.body;
      const crro = req.params.id;

      console.log(Correo, Nombre, Apellido_P, Apellido_M);

      await Caja.Medico.update(
        { correo: Correo, nombre: Nombre, apellido_p: Apellido_P, apellido_m: Apellido_M },
        { where: { correo: crro }, transaction: t, user: req.user.correo, individualHooks: true, saveHistory: true }
      );

      await Caja.Folio.update(
        { medico: Correo },
        { where: { medico: crro }, transaction: t, user: req.user.correo, individualHooks: true }
      );

      await t.commit();
      res.redirect("/AdministracionSistema/Medicos");

    } catch (err) {
      await t.rollback(); // Revertir cambios si hay error
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.get("/AdministracionSistema/Aseguradoras", isLoggedIn, isAdmin, async (req, res) => {
    const aseguradoras = await Caja.Aseguradoras.findAll({
      attributes: [
        "id_seguro",
        "dias_plazo",
        "habilitado"
      ],
      raw: true,
      nest: true,
    });

    res.render("AdministracionSistema/Aseguradoras", {
      datos: aseguradoras,
      nombre: req.user.nombre,
      acceso: req.user.nivel_acceso
    });
  })

  router.get("/AdministracionSistema/CrearAseguradora", isLoggedIn, isAdmin, async (req, res) => {

    const seguro = await Caja.Aseguradoras.findAll({
      attributes: ["id_seguro"], // Si id_metodo es el nombre del método, está bien así
      raw: true
    });

    console.log("Métodos existentes:", seguro); // Verifica qué datos se están enviando al frontend

    res.render("AdministracionSistema/CrearAseguradora", {
      datos: seguro, // Enviamos los métodos al frontend
      nombre: req.user.nombre,
      acceso: req.user.nivel_acceso
    });

    router.post("/AdministracionSistema/CrearAseguradora", isLoggedIn, isAdmin, async (req, res) => {

      const { Seguro, Plazo } = req.body;
      try {
        const addSeguro = await Caja.Aseguradoras.create({
          id_seguro: Seguro,
          dias_plazo: Plazo
        },
          {
            user: req.user.correo, individualHooks: true
          });

        res.redirect("/AdministracionSistema/Aseguradoras");
      } catch (err) {
        console.error(err);
        res.render("Error", { message: err.message });
      }
    });
  });

  router.get("/AdministracionSistema/EditarAseguradoras/:id", isLoggedIn, isAdmin, async (req, res) => {

    try {

      const Seguro = await Caja.Aseguradoras.findOne({
        where: { id_seguro: req.params.id }
      })

      res.render("AdministracionSistema/EditarAseguradoras", {
        seg: Seguro,
        nombre: req.user.nombre,
        acceso: req.user.nivel_acceso,
      });

    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  });

  router.post("/AdministracionSistema/EditarAseguradoras/:id", isLoggedIn, isAdmin, async (req, res) => {

    const { Seguro, Plazo } = req.body;
    const id = req.params.id;
    try {
      await Caja.Aseguradoras.update(
        { id_seguro: Seguro, dias_plazo: Plazo },
        { where: { id_seguro: id }, user: req.user.correo, individualHooks: true, saveHistory: true }
      );
      res.redirect("/AdministracionSistema/Aseguradoras");
    } catch (err) {
      console.error(err);
      res.render("Error", { message: err.message });
    }
  })


  router.get("/AdministracionSistema/Historial", isLoggedIn, isAdmin, async (req, res) => {
    try {
      // Se reciben los filtros mediante la query ?tipo=...&modificado=...
      const filtro = req.query.tipo;
      const modificado = req.query.modificado;
      const tabla = req.query.tabla;
      const fecha = req.query.fecha;
      const whereClause = {};

      // Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = 10; // Records per page
      const offset = (page - 1) * limit;

      if (filtro && ["CREATE", "UPDATE", "DELETE"].includes(filtro)) {
        whereClause.tipo_modificacion = filtro;
      }

      if (modificado) {
        whereClause.modificado_por = { [Op.like]: `%${modificado}%` };
      }

      if (tabla) {
        whereClause.tabla_afectada = tabla;
      }

      if (fecha) {
        const start = new Date(fecha);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        whereClause.fecha_modificacion = { [Op.gte]: start, [Op.lt]: end };
      }

      // Get total count for pagination
      const totalCount = await Caja.Historial.count({ where: whereClause });
      const totalPages = Math.ceil(totalCount / limit);

      // Get paginated records - Ensure all fields are explicitly requested
      const historial = await Caja.Historial.findAll({
        attributes: [
          'tipo_modificacion',
          'tabla_afectada',
          'id_registro',
          'campo_modificado',
          'valor_anterior',
          'valor_nuevo',
          'fecha_modificacion',
          'modificado_por'
        ],
        include: [{
          model: Caja.Usuarios,
          attributes: ['nombre', 'apellido_p', 'apellido_m'],
          required: false
        }],
        where: whereClause,
        order: [['fecha_modificacion', 'DESC']],
        limit: limit,
        offset: offset,
        raw: false,
        nest: true,
      });

      // Mapa de nombres de tabla para el usuario
      const tableDisplayMap = {
        usuarios: 'Usuarios',
        metodos_pago: 'Métodos de Pago',
        medico: 'Médicos',
        aseguradoras: 'Aseguradoras',
        nivel_acceso: 'Niveles de Acceso',
        folio: 'Folios',
        pagos: 'Pagos',
        comisiones: 'Comisiones',
        seguros: 'Seguros',
        archivos: 'Archivos',
        gestor: 'Gestor',
        entrada_salida: 'Entrada/Salida',
        historial: 'Historial'
      };

      // Mapa de nombres de atributos para el usuario
      const attributeDisplayMap = {
        correo: 'Correo',
        nombre: 'Nombre',
        apellido_p: 'Apellido Paterno',
        apellido_m: 'Apellido Materno',
        nivel_acceso: 'Nivel de Acceso',
        porcentaje_real: 'Porcentaje Real',
        porcentaje_fijo: 'Porcentaje Fijo',
        habilitado: 'Habilitado',
        dias_plazo: 'Días de Plazo',
        estado: 'Estado',
        tipo_folio: 'Tipo de Folio',
        paciente: 'Paciente',
        medico: 'Médico',
        habitacion: 'Habitación',
        fecha: 'Fecha',
        monto_total: 'Monto Total',
        estado_folio: 'Estado del Folio',
        abono: 'Abono',
        x_paga: 'Paga',
        y_recibe: 'Recibe',
        id_tipo_pago: 'Tipo de Pago',
        pagado_fijo: 'Pagado Fijo',
        pagado_real: 'Pagado Real',
        ganancia: 'Ganancia',
        concepto: 'Concepto',
        abonado: 'Abonado',
        cobrada: 'Cobrada',
        aseguradora: 'Aseguradora',
        informe_medico: 'Informe Médico',
        solicitud_carta: 'Solicitud de Carta',
        recepcion_carta: 'Recepción de Carta',
        tabulacion: 'Tabulación',
        solicitud_factura: 'Solicitud de Factura',
        cfdi: 'CFDI',
        ingreso_factura: 'Ingreso de Factura',
        fecha_prob_pago: 'Fecha Probable de Pago',
        fecha_pago: 'Fecha de Pago',
        cfdi_complemento: 'CFDI Complemento',
        seguimiento: 'Seguimiento',
        total_comision_cobrada: 'Total Comisión Cobrada',
        folio_de_ingreso: 'Folio de Ingreso',
        estado_pago_medico_caja: 'Estado Pago Médico → Caja',
        estado_pago_caja_medico: 'Estado Pago Caja → Médico',
        estado_pago_paciente_caja: 'Estado Pago Paciente → Caja'
      };

      // Añadir nombres amigables al historial y asegurar que todos los campos existen
      const historialWithDisplay = historial.map(item => {
        // Convert to plain object if it's a Sequelize instance
        const plainItem = item.get ? item.get({ plain: true }) : item;

        return {
          ...plainItem,
          tabla_afectada_display: tableDisplayMap[plainItem.tabla_afectada] || plainItem.tabla_afectada,
          campo_modificado_display: attributeDisplayMap[plainItem.campo_modificado] || plainItem.campo_modificado,
          // Ensure these fields have default values if missing
          id_registro: plainItem.id_registro || 'N/A',
          valor_anterior: plainItem.valor_anterior || 'N/A',
          valor_nuevo: plainItem.valor_nuevo || 'N/A',
          fecha_modificacion: plainItem.fecha_modificacion || new Date(),
          modificado_por: plainItem.modificado_por || 'Sistema'
        };
      });

      // agrupar por día usando el nuevo arreglo
      const groupedDatos = historialWithDisplay.reduce((acc, item) => {
        // Check if fecha_modificacion exists before calling toISOString()
        const day = item.fecha_modificacion ?
          new Date(item.fecha_modificacion).toISOString().split('T')[0] :
          'Fecha desconocida';

        acc[day] = acc[day] || [];
        acc[day].push(item);
        return acc;
      }, {});

      // Add a helper to format dates in the template
      res.locals.helpers = {
        formatDate: function (date) {
          if (!date) return 'N/A';
          try {
            return new Date(date).toLocaleString('es-MX', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
          } catch (err) {
            console.error('Error formatting date:', err);
            return date.toString();
          }
        }
      };

      // Debug mode to check data structure (optional)
      if (req.query.debug === 'true') {
        return res.json({
          groupedDatos,
          pagination: {
            currentPage: page,
            totalPages: totalPages,
            hasPrev: page > 1,
            hasNext: page < totalPages
          }
        });
      }

      res.render("AdministracionSistema/Historial", {
        groupedDatos,
        filtro,
        modificado,
        tabla,
        fecha,
        nombre: req.user.nombre,
        acceso: req.user.nivel_acceso,
        currentPage: page,
        totalPages: totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
        pages: Array.from({ length: totalPages }, (_, i) => ({
          number: i + 1,
          active: i + 1 === page
        })),
        startPage: Math.max(1, page - 2),
        endPage: Math.min(totalPages, page + 2)
      });
    } catch (error) {
      console.error(error);
      res.render("Error", { message: "Error al obtener el historial:" + error.message });
    }
  });

  // Add a debug route to check template issues
  router.get("/AdministracionSistema/CheckTemplate", isLoggedIn, isAdmin, async (req, res) => {
    const fs = require('fs');
    const path = require('path');

    try {
      // Adjust this path to match where your templates are stored
      const templatePath = path.join(__dirname, '../../../views/AdministracionSistema/Historial.handlebars');

      // Check if file exists
      if (fs.existsSync(templatePath)) {
        const template = fs.readFileSync(templatePath, 'utf8');

        // Send template content for review
        res.send(`<pre>${template.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`);
      } else {
        res.send(`Template file not found at ${templatePath}`);
      }
    } catch (error) {
      res.send(`Error reading template: ${error.message}`);
    }
  });

  return router;
};

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}