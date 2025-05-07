// config/passport.js
const LocalStrategy = require('passport-local').Strategy;
const { Usuarios } = require('../models/modelo');

module.exports = function (passport) {
  // Estrategia de autenticación local
  passport.use('local-login', new LocalStrategy({
    usernameField: 'correo',
    passwordField: 'contrasena',
    passReqToCallback: true,
}, async (req, correo, contrasena, done) => {
    console.log("Intento de inicio de sesión:", correo);
    try {
        const user = await Usuarios.findByPk(correo);
        if (!user) {
            console.log("Usuario no encontrado");
            return done(null, false, req.flash('loginMessage', 'Usuario no encontrado.'));
        }
        const validPassword = await user.validPassword(contrasena);
        if (!validPassword) {
            console.log("Contraseña incorrecta");
            return done(null, false, req.flash('loginMessage', 'Contraseña incorrecta.'));
        }
        console.log("Usuario autenticado:", user);
        return done(null, user);
    } catch (err) {
        console.error("Error en autenticación:", err);
        return done(err);
    }
}));


  // Serializar el usuario
  passport.serializeUser((user, done) => {
    done(null, user.correo);
  });

  // Deserializar el usuario
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await Usuarios.findByPk(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};
