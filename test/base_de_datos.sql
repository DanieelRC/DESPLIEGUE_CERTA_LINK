DROP DATABASE IF EXISTS caja;

-- Crear la base de datos
CREATE DATABASE caja;

-- Usar la base de datos recién creada
USE caja;

-- Eliminar tablas en el orden correcto (de las dependientes a las independientes)
DROP TABLE IF EXISTS entrada_salida;
DROP TABLE IF EXISTS gestor;
DROP TABLE IF EXISTS archivos;
DROP TABLE IF EXISTS seguros;
DROP TABLE IF EXISTS comisiones;
DROP TABLE IF EXISTS pagos;
DROP TABLE IF EXISTS folio;
DROP TABLE IF EXISTS nivel_acceso;
DROP TABLE IF EXISTS medico;
DROP TABLE IF EXISTS metodos_pago;
DROP TABLE IF EXISTS aseguradoras;
DROP TABLE IF EXISTS historial;

-- Crear las tablas independientes primero
CREATE TABLE metodos_pago (
    id_metodo VARCHAR(20) NOT NULL,
    porcentaje_real DECIMAL(10,4) NOT NULL,
    porcentaje_fijo DECIMAL(10,4) NOT NULL,
    habilitado VARCHAR(30) NOT NULL,
    CONSTRAINT PK_MP PRIMARY KEY (id_metodo)
);

CREATE TABLE aseguradoras (
    id_seguro VARCHAR(255) NOT NULL,
    dias_plazo INTEGER NOT NULL,
    habilitado VARCHAR(30) NOT NULL,
    CONSTRAINT PK_ASEG PRIMARY KEY (id_seguro)
);

CREATE TABLE medico (
    correo VARCHAR(255) NOT NULL,
    nombre VARCHAR(36) NOT NULL,
    apellido_p VARCHAR(36) NOT NULL,
    apellido_m VARCHAR(36),
    estado VARCHAR(20),
    CONSTRAINT PK_MEDICO PRIMARY KEY (correo)
);

CREATE TABLE nivel_acceso (
    id_nivel VARCHAR(15) NOT NULL,
    descripcion VARCHAR(30),
    CONSTRAINT PK_NA PRIMARY KEY (id_nivel)
);

CREATE TABLE usuarios (
    correo VARCHAR(25) NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    nombre VARCHAR(36) NOT NULL,
    apellido_p VARCHAR(36) NOT NULL,
    apellido_m VARCHAR(36),
    nivel_acceso VARCHAR(15) NOT NULL,
    CONSTRAINT PK_USUARIOS PRIMARY KEY (correo),
    CONSTRAINT FK_URS_NA FOREIGN KEY (nivel_acceso) REFERENCES nivel_acceso (id_nivel)
);

-- Crear tabla historial para rastreo de cambios
CREATE TABLE historial (
    id_modificacion VARCHAR(255) NOT NULL,
    tabla_afectada VARCHAR(255) NOT NULL,
    id_registro VARCHAR(255) NOT NULL,
    campo_modificado VARCHAR(50) NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    fecha_modificacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    modificado_por VARCHAR(25),
    tipo_modificacion VARCHAR(50) NOT NULL,
    CONSTRAINT PK_HISTORIAL PRIMARY KEY (id_modificacion),
    CONSTRAINT FK_HS_USR FOREIGN KEY (modificado_por) REFERENCES usuarios (correo) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE folio (
    folio VARCHAR(20) NOT NULL,
    tipo_folio VARCHAR(20) NOT NULL,
    paciente VARCHAR(50) NOT NULL,
    medico VARCHAR(25) NOT NULL,
    habitacion VARCHAR(15) NOT NULL,
    fecha DATE NOT NULL,
    monto_total DECIMAL(10,2),
    estado_folio VARCHAR(25),
    CONSTRAINT PK_FOLIO PRIMARY KEY (folio),
    CONSTRAINT FK_FO_ME FOREIGN KEY (medico) REFERENCES medico (correo) ON UPDATE CASCADE
);

CREATE TABLE pagos (
    id_pago VARCHAR(255) NOT NULL,
    folio VARCHAR(20) NOT NULL,
    fecha DATE NOT NULL,
    abono DECIMAL(10,2) NOT NULL,
    x_paga VARCHAR(20) NOT NULL,
    y_recibe VARCHAR(20) NOT NULL,
    id_tipo_pago VARCHAR(20) NOT NULL,
    CONSTRAINT PK_PAGOS PRIMARY KEY (id_pago),
    CONSTRAINT FK_PGS_FOL FOREIGN KEY (folio) REFERENCES folio (folio),
    CONSTRAINT FK_PGS_TP FOREIGN KEY (id_tipo_pago) REFERENCES metodos_pago (id_metodo)
);

CREATE TABLE comisiones (
    id_comision VARCHAR(255) NOT NULL,
    id_pago VARCHAR(255) NOT NULL,
    pagado_fijo DECIMAL(10,2) NOT NULL,
    pagado_real DECIMAL(10,2) NOT NULL,
    ganancia DECIMAL(10,2) NOT NULL,
    concepto VARCHAR(50) NOT NULL,
    cobrada VARCHAR(10) NOT NULL,
    abonado DECIMAL(10,2) NOT NULL,
    CONSTRAINT PK_COMISIONES PRIMARY KEY (id_comision),
    CONSTRAINT FK_CMS_PGS FOREIGN KEY (id_pago) REFERENCES pagos (id_pago)
);

CREATE TABLE seguros (
    id VARCHAR(255) NOT NULL,
    id_datos VARCHAR(20) NOT NULL,
    aseguradora VARCHAR(30) NOT NULL,
    informe_medico VARCHAR(9) NOT NULL,
    solicitud_carta VARCHAR(10),
    recepcion_carta VARCHAR(10),
    tabulacion DECIMAL(10,2),
    solicitud_factura VARCHAR(10),
    cfdi VARCHAR(9),
    ingreso_factura VARCHAR(10),
    fecha_prob_pago VARCHAR(10),
    fecha_pago VARCHAR(10),
    cfdi_complemento VARCHAR(9),
    seguimiento VARCHAR(200),
    total_comision_cobrada DECIMAL(10,2),
    folio_de_ingreso VARCHAR(50),
    estado_folio VARCHAR(20),
    CONSTRAINT PK_TS PRIMARY KEY (id),
    CONSTRAINT FK_DATOS_SE FOREIGN KEY (id_datos) REFERENCES folio (folio),
    CONSTRAINT FK_ASEG_SE FOREIGN KEY (aseguradora) REFERENCES aseguradoras (id_seguro)
);

CREATE TABLE archivos (
    id VARCHAR(255) NOT NULL,
    folio VARCHAR(20) NOT NULL,
    nombre VARCHAR(35) NOT NULL,
    archivo MEDIUMBLOB,
    CONSTRAINT PK_ARCHIVOS PRIMARY KEY (id),
    CONSTRAINT FK_ARS_FOL FOREIGN KEY (folio) REFERENCES folio (folio)
);

CREATE TABLE gestor (
    id_gestor VARCHAR(255) NOT NULL,
    folio VARCHAR(20) NOT NULL,
    estado_pago_medico_caja VARCHAR(30) NOT NULL,
    estado_pago_caja_medico VARCHAR(30) NOT NULL,
    estado_pago_paciente_caja VARCHAR(30) NOT NULL,
    abono_total_mc DECIMAL(10,2) NOT NULL,
    abono_total_cm DECIMAL(10,2) NOT NULL,
    abono_total_pc DECIMAL(10,2) NOT NULL,
    cobro_comision_paciente BOOLEAN,
    CONSTRAINT PK_GESTOR PRIMARY KEY (id_gestor),
    CONSTRAINT FK_GST_FOL FOREIGN KEY (folio) REFERENCES folio (folio)
);

CREATE TABLE entrada_salida (
    id VARCHAR(255) NOT NULL,
    id_gestor VARCHAR(255) NOT NULL,
    id_pago VARCHAR(255) NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    CONSTRAINT PK_ENT_SAL PRIMARY KEY (id),
    CONSTRAINT FK_ES_GST FOREIGN KEY (id_gestor) REFERENCES gestor (id_gestor),
    CONSTRAINT FK_ES_PGS FOREIGN KEY (id_pago) REFERENCES pagos (id_pago)
);

INSERT INTO
    nivel_acceso (id_nivel, descripcion)
VALUES 
    ('Administrador', 'Es administrador'),
    ('Operador', 'Es operador');

    INSERT INTO
    usuarios (
        correo,
        contrasena,
        nombre,
        apellido_p,
        apellido_m,
        nivel_acceso
    )
VALUES 
    ('admin@gmail.com', '$2a$10$6Q9Cqg5vP0LjNPIHGpxFpeTUJlAHnKL5n.Me/QgMSU7tVxGxNWyKu', 'Admin', 'Sistema', 'Principal', 'Administrador'),
    ('operador@gmail.com', '$2a$10$6Q9Cqg5vP0LjNPIHGpxFpeTUJlAHnKL5n.Me/QgMSU7tVxGxNWyKu', 'Operador', 'Sistema', 'General', 'Operador');

INSERT INTO
    medico (
        correo,
        nombre,
        apellido_p,
        apellido_m,
        estado
    )
VALUES 
    ('medico1@gmail.com', 'Carlos', 'García', 'López', 'habilitado'),
    ('medico2@gmail.com', 'Ana', 'Pérez', 'Martínez', 'habilitado'),
    ('medico3@gmail.com', 'Javier', 'Hernández', 'Perez', 'habilitado');

-- El hash para la contraseña "1234" usando bcrypt con salt 10
-- Este hash debe ser reemplazado por uno generado en tiempo real para mayor seguridad
