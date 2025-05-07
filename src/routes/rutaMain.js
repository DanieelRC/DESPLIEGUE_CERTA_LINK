const express = require("express");
const Caja = require("../models/modelo.js");
const bcrypt = require("bcryptjs");

module.exports = function (passport) {
  const router = express.Router();

  router.post("/crearUsuario", async (req, res) => {
    try {
      // Verificar si los usuarios ya existen
      let adminUser = await Caja.Usuarios.findOne({ where: { correo: "admin@gmail.com" } });
      let operadorUser = await Caja.Usuarios.findOne({ where: { correo: "operador@gmail.com" } });

      let adminCreated = false, operadorCreated = false;
      let adminPasswordReset = false, operadorPasswordReset = false;
      let adminValid = false, operadorValid = false;

      // Crear admin si no existe
      if (!adminUser) {
        adminUser = await Caja.Usuarios.create({
          correo: "admin@gmail.com",
          contrasena: "1234",
          nombre: "Daniel",
          apellido_p: "R",
          apellido_m: "C",
          nivel_acceso: "Administrador",
        }, { user: req.user.correo, individualHooks: true });
        adminCreated = true;
        adminValid = true; // Nuevo usuario con contraseña correcta
      } else {
        // Verificar si la contraseña funciona
        adminValid = adminUser.validPassword("1234");

        // Si la contraseña no es válida, resetearla
        if (!adminValid) {
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash("1234", salt);

          await adminUser.update({ contrasena: hashedPassword });
          adminPasswordReset = true;
          adminValid = true; // Ahora debería ser válida
        }
      }

      // Crear operador si no existe
      if (!operadorUser) {
        operadorUser = await Caja.Usuarios.create({
          correo: "operador@gmail.com",
          contrasena: "1234",
          nombre: "Fercho",
          apellido_p: "R",
          apellido_m: "F",
          nivel_acceso: "Operador",
        }, { user: adminUser.correo, individualHooks: true });
        operadorCreated = true;
        operadorValid = true; // Nuevo usuario con contraseña correcta
      } else {
        // Verificar si la contraseña funciona
        operadorValid = operadorUser.validPassword("1234");

        // Si la contraseña no es válida, resetearla
        if (!operadorValid) {
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash("1234", salt);

          await operadorUser.update({ contrasena: hashedPassword });
          operadorPasswordReset = true;
          operadorValid = true; // Ahora debería ser válida
        }
      }

      // Opción para todos los métodos de pago - IMPORTANTE: Pasar el correo del admin
      const options = { user: adminUser.correo, individualHooks: true };

      // Verificar si existen métodos de pago para evitar duplicados
      const existingPaymentMethods = await Caja.MetodosPago.findOne();

      // El resto del código para crear métodos de pago solo si no existen
      if (!existingPaymentMethods) {
        // Crear métodos de pago (código original)
        await Caja.MetodosPago.create({
          id_metodo: "TMDEB",
          porcentaje_real: .0135,
          porcentaje_fijo: .0215,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "TMCRE",
          porcentaje_real: .021,
          porcentaje_fijo: .0215,
          habilitado: "si"
        }, options);

        // ... resto de los métodos de pago
        await Caja.MetodosPago.create({
          id_metodo: "TBDEB",
          porcentaje_real: .0164,
          porcentaje_fijo: .0215,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "TBCRE",
          porcentaje_real: .0202,
          porcentaje_fijo: .0215,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "TMFEI",
          porcentaje_real: .028,
          porcentaje_fijo: .0285,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "TBNTEI",
          porcentaje_real: .032,
          porcentaje_fijo: .0325,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "AMEX",
          porcentaje_real: .0265,
          porcentaje_fijo: .027,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "EFECTIVO",
          porcentaje_real: 0,
          porcentaje_fijo: 0,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "TRANSFERENCIA",
          porcentaje_real: 0,
          porcentaje_fijo: 0,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "CHEQUE PERSONAL",
          porcentaje_real: 0,
          porcentaje_fijo: 0,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "MIXTO",
          porcentaje_real: 0,
          porcentaje_fijo: 0,
          habilitado: "si"
        }, options);

        await Caja.MetodosPago.create({
          id_metodo: "ASEGURADORA",
          porcentaje_real: 0,
          porcentaje_fijo: 0,
          habilitado: "si"
        }, options);
      }

      // Verificar si existen aseguradoras para evitar duplicados
      const existingInsurers = await Caja.Aseguradoras.findOne();

      // Crear aseguradoras solo si no existen
      if (!existingInsurers) {
        await Caja.Aseguradoras.bulkCreate([
          { id_seguro: "HOSPITALES C A", dias_plazo: 30, habilitado: "si" },
          { id_seguro: "PREVEM", dias_plazo: 30 },
          { id_seguro: "GLOBAL REACH RX MEXICO", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "BBVA", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "BUPA MEXICO", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "INBURSA", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "ATLAS", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "PLAN SEGURO", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "SURA", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "ALLIANZ", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "BANORTE", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "MAPFRE", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "BUPA GLOBAL", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "LOGIMEDEX", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "PANAMERICAN", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "VE POR MAS", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "CHOICENET", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "ZURICH", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "SOS MEXICO", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "MSH INTERNATIONAL", dias_plazo: 30, habilitado: "si"  },
          { id_seguro: "EURO CENTER", dias_plazo: 30, habilitado: "si"  },
        ], { individualHooks: true, user: adminUser.correo });
      }

      // Respuesta detallada con información de los usuarios
      res.status(200).json({
        ok: true,
        message: "Proceso completado exitosamente",
        usuarios: {
          admin: {
            correo: adminUser.correo,
            nombre: adminUser.nombre,
            nivel_acceso: adminUser.nivel_acceso,
            creado: adminCreated,
            passwordReseteada: adminPasswordReset,
            autenticacionValida: adminValid
          },
          operador: {
            correo: operadorUser.correo,
            nombre: operadorUser.nombre,
            nivel_acceso: operadorUser.nivel_acceso,
            creado: operadorCreated,
            passwordReseteada: operadorPasswordReset,
            autenticacionValida: operadorValid
          }
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        ok: false,
        message: "Error en el proceso",
        error: err.message
      });
    }
  });

  // Eliminamos las rutas redundantes ya que su funcionalidad 
  // ahora está integrada en /crearUsuario

  router.get("/", (req, res) => {
    res.render("index");
  });

  router.get("/IniciarSesion", (req, res) => {
    res.render("IniciarSesion", { message: req.flash("loginMessage") });
  });

  router.post("/IniciarSesion", (req, res, next) => {
    passport.authenticate("local-login", (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.redirect("/IniciarSesion");
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }

        if (req.body.remember) {
          req.session.cookie.maxAge = 10000 * 60 * 3;
        } else {
          req.session.cookie.expires = false;
        }

        if (user.nivel_acceso == "Operador") {
          return res.redirect("/AdministracionFolios");
        } else if (user.nivel_acceso == "Administrador") {
          return res.redirect("/PaginaPrincipal");
        } else {
          return res.redirect("/IniciarSesion");
        }
      });
    })(req, res, next);
  });


  router.get("/AdministracionFolios", isLoggedIn, async function (req, res) {
    res.render("AdministracionFolios", {
      acceso: req.user.nivel_acceso,
      nombre: req.user.nombre,
      correo: req.user.correo,
    });
  });

  router.get("/PaginaPrincipal", isLoggedIn, async function (req, res) {
    if (req.isAuthenticated()) {
      console.log(
        "correo:" +
        req.user.correo +
        " tiene el nivel de acceso: " +
        req.user.nivel_acceso +
        " y tiene los siguientes datos: " +
        req.user.nombre
      );

      // const folios = await Hospital.Datos_Generales.findAll();
      res.render("PaginaPrincipal", {
        correo: req.user.correo,
        nombre: req.user.nombre,
        // datos: folios,
        acceso: req.user.nivel_acceso,
      });
    } else {
      res.redirect("/IniciarSesion");
    }
  });

  router.get("/cerrarSesion", function (req, res) {

    req.logout(function (err) {
      if (err) return next(err);
    });

    res.redirect("/");
  });

  return router;
};

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
}
