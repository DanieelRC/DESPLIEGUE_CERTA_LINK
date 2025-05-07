require("dotenv").config();
const bcrypt = require("bcryptjs");
const { Sequelize, DataTypes } = require("sequelize");

const config = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  dialect: process.env.DB_DIALECT || 'mysql',
  dialectOptions: {}
};

if (process.env.INSTANCE_CONNECTION_NAME) {
  // Producción en App Engine: usar socket
  config.dialectOptions.socketPath = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
} else {
  // Desarrollo local: usar IP pública
  config.host = process.env.DB_HOST;
  config.port = process.env.DB_PORT || 3306;
}

const sequelize = new Sequelize(config.database, config.username, config.password, config);


function areDatesEquivalent(date1, date2) {
  if (!date1 && !date2) return true;
  if (!date1 || !date2) return false;

  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getTime() === d2.getTime();
}

// Función mejorada para garantizar un usuario válido para el historial
async function getValidHistoryUser(userProvided) {
  try {
    // Si hay un usuario proporcionado, verificar si existe en la base de datos
    if (userProvided && userProvided !== "desconocido") {
      const userExists = await Usuarios.findOne({ where: { correo: userProvided } });
      if (userExists) {
        return userProvided;
      }
    }

    // Si no hay usuario válido proporcionado o no existe, buscar un usuario administrador
    const adminUser = await Usuarios.findOne({
      where: { nivel_acceso: 'Administrador' }
    });

    // Si hay un administrador, usar ese
    if (adminUser) {
      return adminUser.correo;
    }

    // Si no hay administrador, usar cualquier usuario
    const anyUser = await Usuarios.findOne();
    if (anyUser) {
      return anyUser.correo;
    }

    // Si no hay ningún usuario en la base de datos (caso extremo)
    // Devolver null - el sistema debería manejar este caso sin intentar crear un registro de historial
    return null;
  } catch (error) {
    console.error("Error al obtener usuario válido para historial:", error);
    return null;
  }
}

// Modelo NivelAcceso
const NivelAcceso = sequelize.define(
  "NivelAcceso",
  {
    id_nivel: { type: DataTypes.TEXT, primaryKey: true },
    descripcion: { type: DataTypes.TEXT },
  },
  {
    tableName: "nivel_acceso",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return; // omitir historial si se indica
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        if (instance._previousDataValues.descripcion !== instance.descripcion) {
          changes.push({
            tabla_afectada: "nivel_acceso",
            id_registro: instance.id_nivel,
            campo_modificado: "descripcion",
            valor_anterior: instance._previousDataValues.descripcion,
            valor_nuevo: instance.descripcion,
            modificado_por: validUser,
            tipo_modificacion: "UPDATE",
          });
        }

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Modelo Usuarios
const Usuarios = sequelize.define(
  "Usuarios",
  {
    correo: { type: DataTypes.TEXT, primaryKey: true },
    contrasena: { type: DataTypes.TEXT, allowNull: false },
    nombre: { type: DataTypes.TEXT, allowNull: false },
    apellido_p: { type: DataTypes.TEXT, allowNull: false },
    apellido_m: { type: DataTypes.TEXT },
    nivel_acceso: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: "usuarios",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        const fields = ['nombre', 'apellido_p', 'apellido_m', 'nivel_acceso'];

        fields.forEach(field => {
          if (instance._previousDataValues[field] !== instance[field]) {
            changes.push({
              tabla_afectada: "usuarios",
              id_registro: instance.correo,
              campo_modificado: field,
              valor_anterior: instance._previousDataValues[field],
              valor_nuevo: instance[field],
              modificado_por: validUser,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Modelo Historial
const Historial = sequelize.define(
  "Historial",
  {
    id_modificacion: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    tabla_afectada: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    id_registro: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    campo_modificado: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    valor_anterior: {
      type: DataTypes.TEXT
    },
    valor_nuevo: {
      type: DataTypes.TEXT
    },
    fecha_modificacion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    modificado_por: {
      type: DataTypes.TEXT,
      references: {
        model: "usuarios",
        key: "correo"
      },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    tipo_modificacion: {
      type: DataTypes.TEXT,
      allowNull: false
    },
  },
  { tableName: "historial", timestamps: false }
);

Historial.belongsTo(Usuarios, { foreignKey: "modificado_por" });

// Modelo MetodosPago
const MetodosPago = sequelize.define(
  "MetodosPago",
  {
    id_metodo: { type: DataTypes.TEXT, primaryKey: true },
    porcentaje_real: { type: DataTypes.DECIMAL(10, 4), allowNull: false },
    porcentaje_fijo: { type: DataTypes.DECIMAL(10, 4), allowNull: false },
    habilitado: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: "metodos_pago",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        // helper para redondear a 4 decimales
        const round4 = v => (typeof v === 'number' ? parseFloat(v.toFixed(4)) : v);

        // incluimos 'habilitado' para rastrear también su cambio
        const fields = ['porcentaje_real', 'porcentaje_fijo', 'habilitado'];

        fields.forEach(field => {
          const prev = instance._previousDataValues[field];
          const curr = instance[field];
          if (prev !== curr) {
            changes.push({
              tabla_afectada: "metodos_pago",
              id_registro: instance.id_metodo,
              campo_modificado: field,
              valor_anterior: round4(prev),
              valor_nuevo: round4(curr),
              modificado_por: validUser,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

//Modelo Aseguradoras
const Aseguradoras = sequelize.define(
  "Aseguradoras",
  {
    id_seguro: { type: DataTypes.TEXT, primaryKey: true },
    dias_plazo: { type: DataTypes.INTEGER, allowNull: false },
    habilitado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'si' },
  },
  {
    tableName: "aseguradoras",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        if (instance._previousDataValues.dias_plazo !== instance.dias_plazo) {
          changes.push({
            tabla_afectada: "aseguradoras",
            id_registro: instance.id_seguro,
            campo_modificado: "dias_plazo",
            valor_anterior: instance._previousDataValues.dias_plazo,
            valor_nuevo: instance.dias_plazo,
            modificado_por: validUser,
            tipo_modificacion: "UPDATE",
          });
        }

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Modelo Medico
const Medico = sequelize.define(
  "Medico",
  {
    correo: { type: DataTypes.TEXT, primaryKey: true },
    nombre: { type: DataTypes.TEXT, allowNull: false },
    apellido_p: { type: DataTypes.TEXT, allowNull: false },
    apellido_m: { type: DataTypes.TEXT },
    estado: { type: DataTypes.TEXT },
  },
  {
    tableName: "medico",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        const fields = ['nombre', 'apellido_p', 'apellido_m', 'estado'];

        fields.forEach(field => {
          if (instance._previousDataValues[field] !== instance[field]) {
            changes.push({
              tabla_afectada: "medico",
              id_registro: instance.correo,
              campo_modificado: field,
              valor_anterior: instance._previousDataValues[field],
              valor_nuevo: instance[field],
              modificado_por: validUser,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      },
    }
  }
);

// Modelo Folio
const Folio = sequelize.define(
  "Folio",
  {
    folio: { type: DataTypes.TEXT, primaryKey: true },
    tipo_folio: { type: DataTypes.TEXT, allowNull: false },
    paciente: { type: DataTypes.TEXT, allowNull: false },
    medico: {
      type: DataTypes.TEXT, allowNull: false,
      references: {
        model: "Medico",
        key: "correo"
      },
      onUpdate: "CASCADE",
    },
    habitacion: { type: DataTypes.TEXT, allowNull: false },
    fecha: { type: DataTypes.DATE, allowNull: false },
    monto_total: { type: DataTypes.DECIMAL(10, 2) },
    estado_folio: { type: DataTypes.TEXT },
  },
  {
    tableName: "folio",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        const fields = ['tipo_folio', 'paciente', 'medico', 'habitacion', 'monto_total', 'estado_folio'];

        fields.forEach(field => {
          if (instance._previousDataValues[field] !== instance[field]) {
            changes.push({
              tabla_afectada: "folio",
              id_registro: instance.folio,
              campo_modificado: field,
              valor_anterior: instance._previousDataValues[field],
              valor_nuevo: instance[field],
              modificado_por: validUser,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        // Manejar fecha separadamente para usar areDatesEquivalent
        if (!areDatesEquivalent(instance._previousDataValues.fecha, instance.fecha)) {
          changes.push({
            tabla_afectada: "folio",
            id_registro: instance.folio,
            campo_modificado: "fecha",
            valor_anterior: instance._previousDataValues.fecha,
            valor_nuevo: instance.fecha,
            modificado_por: validUser,
            tipo_modificacion: "UPDATE",
          });
        }

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Modelo Pagos
const Pagos = sequelize.define(
  "Pagos",
  {
    id_pago: { type: DataTypes.TEXT, primaryKey: true },
    folio: { type: DataTypes.TEXT, allowNull: false },
    fecha: { type: DataTypes.DATE, allowNull: false },
    abono: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    x_paga: { type: DataTypes.TEXT, allowNull: false },
    y_recibe: { type: DataTypes.TEXT, allowNull: false },
    id_tipo_pago: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: "pagos",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const user = options.user || "desconocido";
        const fields = ['folio', 'abono', 'x_paga', 'y_recibe', 'id_tipo_pago'];

        fields.forEach(field => {
          if (instance._previousDataValues[field] !== instance[field]) {
            changes.push({
              tabla_afectada: "pagos",
              id_registro: instance.id_pago,
              campo_modificado: field,
              valor_anterior: instance._previousDataValues[field],
              valor_nuevo: instance[field],
              modificado_por: user,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        // Manejar fecha separadamente para usar areDatesEquivalent
        if (!areDatesEquivalent(instance._previousDataValues.fecha, instance.fecha)) {
          changes.push({
            tabla_afectada: "pagos",
            id_registro: instance.id_pago,
            campo_modificado: "fecha",
            valor_anterior: instance._previousDataValues.fecha,
            valor_nuevo: instance.fecha,
            modificado_por: user,
            tipo_modificacion: "UPDATE",
          });
        }

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Modelo Comisiones
const Comisiones = sequelize.define(
  "Comisiones",
  {
    id_comision: { type: DataTypes.TEXT, primaryKey: true },
    id_pago: { type: DataTypes.TEXT, allowNull: false },
    pagado_fijo: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    pagado_real: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    ganancia: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    concepto: { type: DataTypes.TEXT, allowNull: false },
    abonado: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    cobrada: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: "comisiones",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        // Redondear el valor
        instance.pagado_fijo = Math.ceil(instance.pagado_fijo);

        // Historial de cambios
        const changes = [];
        const user = options.user || "desconocido";
        const fields = ['id_pago', 'pagado_fijo', 'pagado_real', 'ganancia', 'concepto', 'abonado', 'cobrada'];

        fields.forEach(field => {
          if (instance._previousDataValues[field] !== instance[field]) {
            changes.push({
              tabla_afectada: "comisiones",
              id_registro: instance.id_comision,
              campo_modificado: field,
              valor_anterior: instance._previousDataValues[field],
              valor_nuevo: instance[field],
              modificado_por: user,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Modelo Seguros
const Seguros = sequelize.define(
  "Seguros",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    id_datos: { type: DataTypes.TEXT, allowNull: false },
    aseguradora: { type: DataTypes.TEXT, allowNull: false },
    informe_medico: { type: DataTypes.TEXT, allowNull: false },
    solicitud_carta: { type: DataTypes.TEXT },
    recepcion_carta: { type: DataTypes.TEXT },
    tabulacion: { type: DataTypes.FLOAT },
    solicitud_factura: { type: DataTypes.TEXT },
    cfdi: { type: DataTypes.TEXT },
    ingreso_factura: { type: DataTypes.TEXT },
    fecha_prob_pago: { type: DataTypes.TEXT },
    fecha_pago: { type: DataTypes.TEXT },
    cfdi_complemento: { type: DataTypes.TEXT },
    seguimiento: { type: DataTypes.TEXT },
    total_comision_cobrada: { type: DataTypes.FLOAT },
    folio_de_ingreso: { type: DataTypes.TEXT },
    estado_folio: { type: DataTypes.TEXT },
  },
  {
    tableName: "seguros",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        const fields = [
          'id_datos', 'aseguradora', 'informe_medico', 'solicitud_carta',
          'recepcion_carta', 'tabulacion', 'solicitud_factura', 'cfdi',
          'ingreso_factura', 'fecha_prob_pago', 'fecha_pago', 'cfdi_complemento',
          'seguimiento', 'total_comision_cobrada', 'folio_de_ingreso', 'estado_folio'
        ];

        fields.forEach(field => {
          if (instance._previousDataValues[field] !== instance[field]) {
            changes.push({
              tabla_afectada: "seguros",
              id_registro: instance.id,
              campo_modificado: field,
              valor_anterior: instance._previousDataValues[field],
              valor_nuevo: instance[field],
              modificado_por: validUser,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Asumiendo que cada Folio tiene un único registro en Seguros:
Folio.hasOne(Seguros, {
  foreignKey: "id_datos",    // Campo en Seguros que hace referencia al folio
  sourceKey: "folio",        // Campo en Folio
  onDelete: "CASCADE",
  hooks: true,
  constraints: true
});
Seguros.belongsTo(Folio, {
  foreignKey: "id_datos",    // Campo en Seguros
  targetKey: "folio",        // Campo en Folio
  onDelete: "CASCADE",
  hooks: true,
  constraints: true
});

// Modelo Archivos
const Archivos = sequelize.define(
  "Archivos",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    folio: { type: DataTypes.TEXT, allowNull: false },
    nombre: { type: DataTypes.TEXT, allowNull: false },
    archivo: { type: DataTypes.BLOB("long"), allowNull: false },
  },
  {
    tableName: "archivos",
    timestamps: false,
    hooks: {
      beforeUpdate: async (instance, options) => {
        if (options.saveHistory !== true) return;
        const changes = [];
        const validUser = await getValidHistoryUser(options.user);

        if (!validUser) return; // Si no hay usuario válido, no crear historial

        const fields = ['folio', 'nombre'];

        fields.forEach(field => {
          if (instance._previousDataValues[field] !== instance[field]) {
            changes.push({
              tabla_afectada: "archivos",
              id_registro: instance.id,
              campo_modificado: field,
              valor_anterior: instance._previousDataValues[field],
              valor_nuevo: instance[field],
              modificado_por: validUser,
              tipo_modificacion: "UPDATE",
            });
          }
        });

        // No registramos cambios en el archivo mismo para evitar almacenar BLOBs grandes en el historial

        if (changes.length > 0) {
          await Historial.bulkCreate(changes);
        }
      }
    }
  }
);

// Modelo Gestor
const Gestor = sequelize.define(
  "Gestor",
  {
    id_gestor: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    folio: { type: DataTypes.TEXT, allowNull: false },
    estado_pago_medico_caja: { type: DataTypes.TEXT, allowNull: false, defaultValue: "No pagado" },
    estado_pago_caja_medico: { type: DataTypes.TEXT, allowNull: false, defaultValue: "No pagado" },
    estado_pago_paciente_caja: { type: DataTypes.TEXT, allowNull: false, defaultValue: "No pagado" },
    abono_total_mc: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    abono_total_cm: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    abono_total_pc: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    cobro_comision_paciente: { type: DataTypes.DECIMAL, allowNull: true, defaultValue: 0 }
  },
  {
    tableName: "gestor",
    timestamps: false,
  }
);

// Modelo EntradaSalida
const EntradaSalida = sequelize.define(
  "EntradaSalida",
  {
    id: { type: DataTypes.TEXT, primaryKey: true },
    id_gestor: { type: DataTypes.TEXT, allowNull: false },
    id_pago: { type: DataTypes.TEXT, allowNull: false },
    tipo: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: "entrada_salida",
    timestamps: false,
  }
);

EntradaSalida.belongsTo(Gestor, { foreignKey: "id_gestor" });
EntradaSalida.belongsTo(Pagos, { foreignKey: "id_pago" });
Folio.hasMany(Pagos, { foreignKey: "folio" });
Pagos.belongsTo(Folio, { foreignKey: "folio" });

// Asociación para un único Gestor por Folio
Folio.hasOne(Gestor, {
  foreignKey: "folio",
  sourceKey: "folio",
  onDelete: "CASCADE",
  hooks: true,
  constraints: true,
});
Gestor.belongsTo(Folio, {
  foreignKey: "folio",
  targetKey: "folio",
  onDelete: "CASCADE",
  hooks: true,
  constraints: true,
});

// Relación Pagos -> Comisiones
Pagos.hasMany(Comisiones, { foreignKey: "id_pago" });
Comisiones.belongsTo(Pagos, { foreignKey: "id_pago" });

// Asociación entre Folio y Seguros (faltante)
Folio.hasOne(Seguros, {
  foreignKey: "id_datos",
  sourceKey: "folio",
  onDelete: "CASCADE",
  hooks: true,
  constraints: true
});
Seguros.belongsTo(Folio, {
  foreignKey: "id_datos",
  targetKey: "folio",
  onDelete: "CASCADE",
  hooks: true,
  constraints: true
});

// Asociación entre Folio y Archivos (faltante)
Folio.hasMany(Archivos, {
  foreignKey: "folio",
  sourceKey: "folio",
  onDelete: "CASCADE",
  hooks: true,
  constraints: true
});
Archivos.belongsTo(Folio, {
  foreignKey: "folio",
  targetKey: "folio",
  onDelete: "CASCADE",
  hooks: true,
  constraints: true
});

// Validaciones

Usuarios.prototype.validPassword = function (password) {
  console.log("Intentando validar contraseña:", password);
  console.log("Hash almacenado:", this.contrasena);
  try {
    const result = bcrypt.compareSync(password, this.contrasena);
    console.log("Resultado de la comparación:", result);
    return result;
  } catch (error) {
    console.error("Error al validar contraseña:", error);
    return false;
  }
};

Usuarios.beforeCreate(async (user, options) => {
  // Hash password (código existente)
  if (user.contrasena) {
    const salt = await bcrypt.genSalt(10);
    user.contrasena = await bcrypt.hash(user.contrasena, salt);
  } else {
    throw new Error("La contraseña no puede ser nula o indefinida.");
  }
});

// Añadir al proceso de sincronización
async function sincronizarModelo() {
  try {
    await MetodosPago.sync();
    await Medico.sync();
    await Aseguradoras.sync();
    await NivelAcceso.sync();
    await Usuarios.sync();
    await Folio.sync();
    await Pagos.sync();
    await Comisiones.sync();
    await Seguros.sync();
    await Archivos.sync();
    await Gestor.sync();
    await EntradaSalida.sync();
    await Historial.sync();
    console.log("Los modelos fueron sincronizados correctamente.");
  } catch (error) {
    console.error("Error al sincronizar el modelo:", error);
  }
}


sincronizarModelo();
// hooks
Folio.beforeCreate(async (folioInstance, options) => {
  // Código existente para generar folio
  const prefijo = folioInstance.tipo_folio === "Particulares" ? "A" : "B";
  const ultimoFolio = await Folio.findOne({
    where: { tipo_folio: folioInstance.tipo_folio },
    order: [["folio", "DESC"]],
  });

  let nuevoFolio = `${prefijo}-0001`;
  if (ultimoFolio) {
    const ultimoFolioNumero = parseInt(ultimoFolio.folio.split("-")[1], 10);
    nuevoFolio = `${prefijo}-${String(ultimoFolioNumero + 1).padStart(4, "0")}`;
  }

  folioInstance.folio = nuevoFolio;

});


Comisiones.beforeCreate(async (comisionInstance, options) => {
  // Redondear el valor (código existente)
  comisionInstance.pagado_fijo = Math.ceil(comisionInstance.pagado_fijo);

});

Folio.belongsTo(Medico, {
  foreignKey: "medico",
  targetKey: "correo",
});

Medico.hasMany(Folio, {
  foreignKey: "medico",
  sourceKey: "correo",
});

// Añadir a las exportaciones
module.exports = {
  sequelize,
  MetodosPago,
  Medico,
  Aseguradoras,
  NivelAcceso,
  Usuarios,
  Folio,
  Pagos,
  Comisiones,
  Seguros,
  Archivos,
  Gestor,
  EntradaSalida,
  Historial,
};
