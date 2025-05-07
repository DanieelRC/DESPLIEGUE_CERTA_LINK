const Caja = require("../../models/modelo.js");
const express = require("express");
var url = require("url");
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');


module.exports = function (passport) {
    const router = express.Router();

    router.get("/Pagos/Principal", isLoggedIn, async (req, res) => {
        if (req.isAuthenticated()) {
            const foliosFiltrados = await Caja.Folio.findAll({
                include: [{
                    model: Caja.Gestor,
                    where: {
                        estado_pago_caja_medico: "No pagado",
                        estado_pago_paciente_caja: "PAGADO",
                    }
                }],
                where: { tipo_folio: "Particulares" }
            });


            res.render("Pagos/Principal", {
                folios: foliosFiltrados,
            });
        } else {
            res.redirect("/IniciarSesion");
        }
    });

    router.get("/Pagos/Pagar", isLoggedIn, async (req, res) => {
        if (req.isAuthenticated()) {
            var q = url.parse(req.originalUrl, true).query;
            var folio = q.folio;
            var monto_total = q.monto_total;
            try {
                const metodos_pago = await Caja.MetodosPago.findAll({
                    where: { habilitado: "si" }
                });
                const comision_paciente = await Caja.Gestor.findOne({ where: { folio: folio } });

                console.log("Comision paciente:", comision_paciente.cobro_comision_paciente);

                res.render("Pagos/Pagar", {
                    folio: folio,
                    monto_total: monto_total,
                    metodos_pago: metodos_pago,
                    comision_paciente: comision_paciente.cobro_comision_paciente,
                });
            } catch (err) {
                console.error(err);
                res.render("Error", { message: err.message });
            }
        } else {
            res.redirect("/IniciarSesion");
        }
    });
    //Pago por retención
    router.get("/Pagos/PagoRetencion", isLoggedIn, async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/IniciarSesion");
        }

        try {
            const q = url.parse(req.originalUrl, true).query;
            const folio = q.folio;
            var monto_total = parseFloat(q.monto);

            const PagosAsociados = await Caja.Pagos.findAll({
                where: {
                    folio: folio,
                    x_paga: 'paciente',
                    y_recibe: 'caja',
                },
            });

            if (!PagosAsociados || PagosAsociados.length === 0) {
                throw new Error(`No se encontraron pagos asociados para el folio: ${folio}`);
            }
            //console.log("Pagos:", PagosAsociados);

            var comisiones = [];
            for (const p of PagosAsociados) {
                const comisionesPago = await Caja.Comisiones.findAll({ where: { id_pago: p.id_pago, cobrada: 'no' } });
                comisiones = comisiones.concat(comisionesPago);
            }
            //console.log('las comisiones asociadas a los pagos son:', comisiones);
            //AQUI SE COBRAN LAS COMISIONES UNA POR UNA
            var totalComisiones = 0;

            // Initialize all accumulator variables to 0
            var totalComisionCaja = 0;
            var totalIVAComisionCaja = 0;
            var totalComisionMetodoFijo = 0;
            var totalComisionMetodoReal = 0;
            var totalIVAComisionMetodoFijo = 0;
            var totalIVAComisionMetodoReal = 0;


            for (const c of comisiones) {
                await Caja.Comisiones.update({ abonado: c.pagado_fijo, cobrada: 'si' }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
                totalComisiones += parseFloat(c.pagado_fijo || 0);
                // Acumular las comisiones según el concepto
                switch (c.concepto) {
                    case 'Caja':
                        totalComisionCaja += parseFloat(c.pagado_fijo || 0);
                        break;
                    case 'IVA_Caja':
                        totalIVAComisionCaja += parseFloat(c.pagado_fijo || 0);
                        break;
                    case 'MetodoPago':
                        totalComisionMetodoFijo += parseFloat(c.pagado_fijo || 0);
                        totalComisionMetodoReal += parseFloat(c.pagado_real || 0);
                        break;
                    case 'IVA_MetodoPago':
                        totalIVAComisionMetodoFijo += parseFloat(c.pagado_fijo || 0);
                        totalIVAComisionMetodoReal += parseFloat(c.pagado_real || 0);
                        break;
                }
            }
            console.log('Total comisiones:', totalComisiones);
            console.log('Comisión caja:', totalComisionCaja);
            console.log('IVA comisión caja:', totalIVAComisionCaja);
            console.log('Comisión método fijo:', totalComisionMetodoFijo);
            console.log('Comisión método real:', totalComisionMetodoReal);

            // Verificar que se actualizaron correctamente
            const comisionesActualizadas = await Caja.Comisiones.findAll({ where: { id_pago: PagosAsociados.map(p => p.id_pago), cobrada: 'no' } });
            for (const c of comisionesActualizadas) {
                if (c.abonado === c.pagado_fijo && c.cobrada !== 'si') {
                    await Caja.Comisiones.update({ cobrada: 'si' }, { where: { id_comision: c.id_comision }, user: req.user.correo, individualHooks: true });
                }
            }

            const netoMedico = monto_total - totalComisiones;
            const totalRetencion = totalComisiones;

            const pago_a_medico = await Caja.Pagos.create({
                id_pago: uuidv4(),
                folio: folio,
                fecha: new Date(),
                abono: netoMedico,
                x_paga: 'caja',
                y_recibe: 'medico',
                id_tipo_pago: 'TRANSFERENCIA',
            }, { user: req.user.correo, individualHooks: true });
            const gestorConsulta = await Caja.Gestor.findOne({ where: { folio } });
            if (gestorConsulta) {
                // Actualizamos los abonos
                await Caja.Gestor.update(
                    {
                        abono_total_cm: Number((parseFloat(gestorConsulta.abono_total_cm || 0) + parseFloat(netoMedico || 0)).toFixed(2)),
                        abono_total_mc: Number((parseFloat(gestorConsulta.abono_total_mc || 0) + parseFloat(totalRetencion || 0)).toFixed(2)),
                        estado_pago_caja_medico: 'PAGADO',
                        estado_pago_medico_caja: 'PAGADO',
                    },
                    { where: { folio: folio }, user: req.user.correo, individualHooks: true }
                );

                const consulta_Gestor = await Caja.Gestor.findOne({ where: { folio } });
                if (
                    consulta_Gestor.estado_pago_medico_caja === 'PAGADO' &&
                    consulta_Gestor.estado_pago_caja_medico === 'PAGADO' &&
                    consulta_Gestor.estado_pago_paciente_caja === 'PAGADO'
                ) {
                    await Caja.Folio.update(
                        { estado_folio: 'FINALIZADO' },
                        { where: { folio }, user: req.user.correo, individualHooks: true }
                    );
                }
            }

            res.render('Pagos/PagadoRetencion', {
                folio: folio,
                monto_total: monto_total,
                comision_caja: totalComisionCaja,
                iva_comision_caja: totalIVAComisionCaja,
                comision_metodo_fijo: totalComisionMetodoFijo,
                comision_metodo_real: totalComisionMetodoReal,
                iva_comision_metodo_fijo: totalIVAComisionMetodoFijo,
                iva_comision_metodo_real: totalIVAComisionMetodoReal,
                retencion: totalRetencion,
                abono_caja_medico: netoMedico,
                cantidad_transferir: monto_total - totalRetencion,
            });
        } catch (err) {
            console.error(err);
            res.render("Error", { message: err.message });
        }
    });

    //Pago completo
    router.get("/Pagos/PagoCompleto", isLoggedIn, async (req, res) => {
        if (req.isAuthenticated()) {
            try {
                var q = url.parse(req.originalUrl, true).query;
                var folio = q.folio;
                var monto_total = parseFloat(q.monto);

                if (isNaN(monto_total)) {
                    throw new Error('Monto total no es un número válido');
                }

                const pago_a_medico = await Caja.Pagos.create({
                    id_pago: uuidv4(),
                    folio: folio,
                    fecha: new Date(),
                    abono: monto_total, // Monto total 
                    x_paga: 'caja',
                    y_recibe: 'medico',
                    id_tipo_pago: 'TRANSFERENCIA'
                }, { user: req.user.correo, individualHooks: true });

                const gestorConsulta = await Caja.Gestor.findOne(
                    { where: { folio: folio } }
                );
                const gestorUpdate = await Caja.Gestor.update(
                    { estado_pago_caja_medico: 'PAGADO', abono_total_cm: (gestorConsulta.abono_total_cm + monto_total) },
                    { where: { folio: folio }, user: req.user.correo, individualHooks: true }
                );

                const consulta_Gestor = await Caja.Gestor.findOne({
                    where: {
                        folio: folio,
                    }
                });
                if (consulta_Gestor.estado_pago_medico_caja == 'PAGADO' && consulta_Gestor.estado_pago_caja_medico == 'PAGADO' && consulta_Gestor.estado_pago_paciente_caja == 'PAGADO') {
                    await Caja.Folio.update(
                        { estado_folio: 'FINALIZADO' },
                        { where: { folio: folio }, user: req.user.correo, individualHooks: true }
                    );
                }

                res.render("Pagos/PagadoCompleto", {
                    folio: folio,
                    monto_total: monto_total,
                });
            } catch (err) {
                console.error(err);
                res.render("Error", { message: err.message });
            }
        } else {
            res.redirect("/IniciarSesion");
        }
    });

    //Pago por comision
    router.get("/Pagos/PagoComision", isLoggedIn, async (req, res) => {
        if (!req.isAuthenticated()) {
            return res.redirect("/IniciarSesion");
        }

        try {
            var q = url.parse(req.originalUrl, true).query;
            var folio = q.folio;
            var monto_total = parseFloat(q.monto);
            const gestorConsulta = await Caja.Gestor.findOne({ where: { folio: folio } });
            if (!gestorConsulta.cobro_comision_paciente) {
                console.log("No deberias cobrar por comision si el paciente no paga la comision");
                return res.redirect("/Pagos/Pagar?folio=" + folio + "&monto_total=" + monto_total);
            }
            if (isNaN(monto_total)) {
                throw new Error('Monto total no es un número válido');
            }

            const pagosPacienteCaja = await Caja.Pagos.findAll({
                where: {
                    folio: folio,
                    x_paga: 'paciente',
                    y_recibe: 'caja',
                },
            });

            let totalRetencionReal = 0;

            for (const pago of pagosPacienteCaja) {
                const comisionesParciales = await calcularComisiones(
                    pago.folio,
                    pago.abono,
                    pago.id_tipo_pago
                );
                totalRetencionReal += comisionesParciales.retencion;
            }

            const pCaja = (monto_total / 1.07) * 0.07;

            const porcentajeCaja = Math.trunc(pCaja);

            console.log('Porcentaje caja:', porcentajeCaja);

            const pago_a_medico = await Caja.Pagos.create({
                id_pago: uuidv4(),
                folio: folio,
                fecha: new Date(),
                abono: (monto_total / 1.07), // Se paga completo al médico
                x_paga: 'caja',
                y_recibe: 'medico',
                id_tipo_pago: 'TRANSFERENCIA',
            }, { user: req.user.correo, individualHooks: true });

            await Caja.Comisiones.create({
                id_comision: uuidv4(),
                id_pago: pago_a_medico.id_pago,         // La comisión la asociamos al pago del médico -> caja
                pagado_fijo: porcentajeCaja,         // Monto fijo que estás cobrando (7%)
                pagado_real: totalRetencionReal,     // Lo que habrías “cobrado” si siguieras la comisión real
                ganancia: porcentajeCaja - totalRetencionReal,
                concepto: 'Caja_7%',
                cobrada: 'si',
                abonado: porcentajeCaja,
            }, { user: req.user.correo, individualHooks: true });

            const consultaFolio = await Caja.Folio.findOne({ where: { folio: folio } });

            await Caja.Gestor.update(
                {
                    estado_pago_caja_medico: 'PAGADO',
                    estado_pago_medico_caja: 'PAGADO',
                    abono_total_mc: parseFloat(gestorConsulta.abono_total_mc || 0) + porcentajeCaja,
                    abono_total_cm: parseFloat(gestorConsulta.abono_total_cm || 0) + (monto_total / 1.07),
                },
                { where: { folio: folio }, user: req.user.correo, individualHooks: true }
            );

            const consulta_Gestor = await Caja.Gestor.findOne({
                where: {
                    folio: folio,
                },
            });
            if (consulta_Gestor.abono_total_pc == consultaFolio.monto_total) {
                const gestorUpd = await Caja.Gestor.update(
                    {
                        estado_pago_paciente_caja: 'PAGADO',
                    },
                    { where: { folio: folio }, user: req.user.correo, individualHooks: true }
                );
            }
            if (
                consulta_Gestor.estado_pago_medico_caja === 'PAGADO' &&
                consulta_Gestor.estado_pago_caja_medico === 'PAGADO' &&
                consulta_Gestor.estado_pago_paciente_caja === 'PAGADO'
            ) {
                await Caja.Folio.update(
                    { estado_folio: 'FINALIZADO' },
                    { where: { folio }, user: req.user.correo, individualHooks: true }
                );
            }

            const a_depositar = monto_total - porcentajeCaja;

            res.render("Pagos/PagadoComision", {
                folio: folio,
                monto_total: monto_total,
                porcentajeCaja: porcentajeCaja,
                retencion: totalRetencionReal,
                ganancia: porcentajeCaja - totalRetencionReal,
                cobra_paciente: gestorConsulta.cobro_comision_paciente,
                a_depositar: a_depositar,
            });

        } catch (err) {
            console.error(err);
            res.render("Error", { message: err.message });
        }
    });

    return router;
};
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
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect("/");
}