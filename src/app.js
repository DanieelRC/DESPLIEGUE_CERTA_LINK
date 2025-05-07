require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const { join, dirname } = require("path");
const { fileURLToPath } = require("url");
const { engine } = require("express-handlebars");
const rutaMain = require("./routes/rutaMain.js");
const rutaAdministracionSistema = require("./routes/rutaAdministracionSistema/route.js");
const rutaFolio = require("./routes/rutaFolio/route.js");
const rutaCobro = require("./routes/rutaCobros/route.js");
const rutaPagos = require("./routes/rutaPagos/route.js");
const rutaGestionSeguros = require("./routes/rutaGestionSeguros/route.js");
const rutaAdministracionFolios = require("./routes/rutaAdministrarFolios/route.js");
const Handlebars = require("handlebars");
var session = require("express-session");
var cookieParser = require("cookie-parser");
var passport = require("passport");
require("./config/passport")(passport);
var flash = require("connect-flash");
const handlebars = require("handlebars");
const { hasUtf16BOM } = require("pdf-lib");
//---Inicio del servidor
const app = express();
//const __dirname = dirname(fileURLToPath(import.meta.url));

//---Configuracion del servidor
app.set("port", process.env.Port || 8080);
app.set("views", join(__dirname, "views"));
app.use(express.static(join(__dirname, 'public')));
app.engine(
  ".hbs",
  engine({
    defaultLayout: "main",
    layoutsDir: join(app.get("views"), "layouts"),
    partialsDir: join(app.get("views"), "partials"),
    extname: ".hbs",
    handlebars: handlebars,
  })
);
app.set("view engine", ".hbs");
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
  })
);


Handlebars.registerHelper("and", function (...args) {
  // Elimina el objeto "options" que Handlebars agrega como último argumento
  args.pop();
  // Retorna true solo si todos los argumentos son verdaderos
  return args.every(Boolean);
});

Handlebars.registerHelper("or", function (...args) {
  // Elimina el objeto "options" que Handlebars agrega como último argumento
  args.pop();
  // Retorna true si al menos uno de los argumentos es verdadero
  return args.some(Boolean);
});


Handlebars.registerHelper("eq", function (arg1, arg2) {
  return String(arg1) === String(arg2);
});

// Update MasGrandeQue helper to work in both block and non-block contexts
Handlebars.registerHelper("MasGrandeQue", function (a, b, options) {
  // When used as {{MasGrandeQue a b}}, options will be the last argument
  if (!options || typeof options !== 'object' || typeof options.fn !== 'function') {
    // Non-block usage - return the boolean result directly
    return a > b;
  }
  // Block usage - {{#MasGrandeQue a b}}...{{/MasGrandeQue}}
  return a > b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper("formatearMoneda", function (valor) {
  if (typeof valor !== "number") {
    valor = parseFloat(valor);
    if (isNaN(valor)) return "N/A";
  }
  return `$${valor.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, "$&,")}`;
});

// Register the "not" helper
Handlebars.registerHelper('not', function (value) {
  return !value;
});

// Register date formatting helper
Handlebars.registerHelper('formatDate', function (dateValue) {
  if (!dateValue) return '';

  const date = new Date(dateValue);

  // Check if date is valid
  if (isNaN(date.getTime())) return dateValue;

  // Format: MM-DD-YYYY HH:MM:SS
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${month}-${day}-${year} ${hours}:${minutes}:${seconds}`;
});

// Add helper for addition (used in pagination)
Handlebars.registerHelper('add', function (a, b) {
  return parseInt(a) + parseInt(b);
});
// Register Handlebars helper for date formatting
Handlebars.registerHelper('formatDate', function (date) {
  if (!date) return 'Fecha no disponible';

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return date; // If invalid date, return original string

  // Format to: DD/MM/YYYY HH:MM:SS
  return dateObj.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
});

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//---Middleware
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//---Rutas
app.use("/", rutaMain(passport));
app.use("/", rutaAdministracionSistema(passport));
app.use("/", rutaFolio(passport));
app.use("/", rutaCobro(passport));
app.use("/", rutaPagos(passport));
app.use("/", rutaGestionSeguros(passport));
app.use("/", rutaAdministracionFolios(passport));
//---Archivos Publicos
app.use(express.static(join(__dirname, "public")));
//---Servidor
app.listen(app.get("port"), () =>
  console.log("El servidor escucha en ", app.get("port"))
);
