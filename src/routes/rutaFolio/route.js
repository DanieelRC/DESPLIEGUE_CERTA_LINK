const express = require("express");
const Caja = require("../../models/modelo.js");
var url = require("url");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, PDFName } = require("pdf-lib");

module.exports = function (passport) {
  const router = express.Router();

  router.get("/Folio/ConsultasEspecificas", isLoggedIn, async (req, res) => {
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
    res.render("Folio/ConsultasEspecificas", {
      nombre: req.user.nombre,
      datos: datosAplanados,
      acceso: req.user.nivel_acceso,
    });
  });

  router.get("/Folio/CrearFolio", isLoggedIn, async (req, res) => {
    if (req.isAuthenticated()) {
      var q = url.parse(req.originalUrl, true).query;
      var q1;
      Object.entries(q).forEach(([key, value]) => {
        q1 = value;
      });

      await Caja.Medico.sync();
      const med = await Caja.Medico.findAll({
        where: {
          estado: "habilitado"
        }
      });
      const seg = await Caja.Aseguradoras.findAll({
        where: {habilitado : "si"}
      });
      console.log("Aseguradoras cargadas: ", seg);
      console.log("Medicos cargados: ", med);
      try {
        res.render("Folio/CrearFolio", {
          TipoFolio: q1,
          Medicos: med,
          Seguros: seg,
        });
      } catch (err) {
        console.error(err);
        res.render("Error", { message: err.message });
      }
    } else {
      res.redirect("/IniciarSesion");
    }
  });

  router.post("/Folio/CrearFolio", isLoggedIn, async (req, res) => {
    if (req.isAuthenticated()) {
      try {
        const { TipoFolio, Habitacion, Paciente, Medico, Monto } = req.body;
        const { Aseguradora, Informe_medico } = req.body;

        // Crear el folio
        const addFolio = await Caja.Folio.create({
          habitacion: Habitacion,
          fecha: new Date(),
          paciente: Paciente,
          medico: Medico,
          tipo_folio: TipoFolio,
          monto_total: Monto,
          estado_folio: "en proceso",
        }, { user: req.user.correo, individualHooks: true });

        // Crear el registro de gestor asociado
        await gestor(addFolio.folio, req.user.correo);
        const ID = addFolio.folio;

        if (TipoFolio === "Seguros") {
          await Seguros(ID, Aseguradora, Informe_medico, req.user.correo);
        }

        // Leer la plantilla PDF
        const plantillaPath = path.join(__dirname, "../../recursos/Plantilla.pdf");
        const plantillaBytes = fs.readFileSync(plantillaPath);

        // Generar el PDF con la información del folio
        const data = await generar(ID, plantillaBytes);
        const buffer = Buffer.from(data);

        // Definir la ruta del directorio donde se guardará el PDF
        const pdfDir = path.join(__dirname, "../../public/temp");
        // Crear el directorio si no existe
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        // Guardar el PDF en el directorio público
        const pdfFilename = ID + ".pdf";
        const pdfPath = path.join(pdfDir, pdfFilename);
        fs.writeFileSync(pdfPath, buffer);

        // Guardar la URL del PDF en la sesión para usarla en la próxima ruta
        req.session.pdfUrl = "/temp/" + pdfFilename;

        // Redirigir a la ruta que se encargará de la descarga y cierre de la ventana
        res.redirect("/Folio/DescargarPdf");
      } catch (err) {
        console.error(err);
        res.render("Error", { message: err.message });
      }
    } else {
      res.redirect("/IniciarSesion");
    }
  });

  router.get("/Folio/DescargarPdf", isLoggedIn, (req, res) => {
    const pdfUrl = req.session.pdfUrl;
    // Usar pdfUrl como tempFilePath
    const tempFilePath = pdfUrl;
    // Limpiar la variable de sesión
    delete req.session.pdfUrl;
    res.render("Folio/DescargarPdf", { pdfUrl, tempFilePath });
  });
  router.post("/Folio/pdf/delete", isLoggedIn, (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        throw new Error("No se proporcionó la ruta del archivo");
      }
      // Construir la ruta absoluta del archivo temporal.
      // Se asume que filePath tiene el formato "/temp/archivo.pdf"
      const absolutePath = path.join(__dirname, "../../public", filePath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        return res.status(200).json({ success: true });
      } else {
        return res.status(404).json({ success: false, message: "Archivo no encontrado" });
      }
    } catch (err) {
      console.error("Error al eliminar el archivo temporal:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });
  return router;
};
async function generar(id, plantillaBytes) {
  const datos = await Caja.Folio.findOne({
    where: { folio: id },
  });
  const medico = await Caja.Medico.findOne({
    where: { correo: datos.medico },
  });

  const fecha = datos.fecha;
  const paciente = datos.paciente;
  const identificador = datos.folio;
  const habitacion = datos.habitacion;
  const me = medico.nombre + " " + medico.apellido_p + " " + medico.apellido_m;
  const monto = datos.monto_total;

  const pdfDoc = await PDFDocument.load(plantillaBytes);

  // Obtener la primera página
  const paginas = pdfDoc.getPages();
  const primeraPagina = paginas[0];

  const { width, height } = primeraPagina.getSize();

  primeraPagina.drawText(fecha, {
    x: 154, // Posición X
    y: height - 137, // Posición Y (desde la parte superior)
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(paciente, {
    x: 150, // Posición X
    y: height - 150, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(identificador, {
    x: 475, // Posición X
    y: height - 137, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(habitacion, {
    x: 500, // Posición X
    y: height - 152, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(me, {
    x: 125, // Posición X
    y: height - 215, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });
  if (monto) {
    primeraPagina.drawText(monto.toString(), {
      x: 475, // Posición X
      y: height - 215, // Posición Y ajustada
      size: 10, // Tamaño del texto
      color: rgb(0, 0, 0), // Color negro
    });
  }
  //----------------------------------------
  primeraPagina.drawText(fecha, {
    x: 154, // Posición X
    y: height - 494, // Posición Y (desde la parte superior)
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(paciente, {
    x: 150, // Posición X
    y: height - 507, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(identificador, {
    x: 475, // Posición X
    y: height - 494, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(habitacion, {
    x: 500, // Posición X
    y: height - 507, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });

  primeraPagina.drawText(me, {
    x: 125, // Posición X
    y: height - 572, // Posición Y ajustada
    size: 10, // Tamaño del texto
    color: rgb(0, 0, 0), // Color negro
  });
  if (monto) {
    primeraPagina.drawText(monto.toString(), {
      x: 475, // Posición X
      y: height - 572, // Posición Y ajustada
      size: 10, // Tamaño del texto
      color: rgb(0, 0, 0), // Color negro
    });
  }
  const pdfBytes = await pdfDoc.save();

  return pdfBytes;
}

async function Seguros(
  Id,
  Aseguradora,
  Informe_medico,
  usuario
) {
  try {

    await Caja.Seguros.sync();
    const addTS = await Caja.Seguros.create({
      id_datos: Id,
      aseguradora: Aseguradora,
      informe_medico: Informe_medico,
      estado_folio: "en proceso"
    }, { user: usuario, individualHooks: true });
  } catch (err) {
    console.log(err);
  }
}
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}

async function gestor(folio_obj, user_) {
  const newGestor = await Caja.Gestor.create({
    folio: folio_obj,
    estado_pago_medico_caja: "No pagado",
    estado_pago_caja_medico: "No pagado",
    estado_pago_paciente_caja: "No pagado",
    abono_total_mc: 0,
    abono_total_cm: 0,
    abono_total_pc: 0,
    cobro_comision_paciente: 0
  }, { user: user_, individualHooks: true });
}