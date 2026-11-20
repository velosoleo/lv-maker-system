'use strict';
const { environment } = require('../context.cjs');
function parameter(name, options = {}, boolean = false) {
    return { value() {
        const value = environment()[name] ?? options.default;
        if (value === undefined) throw new Error('Configuração da integração incompleta.');
        if (boolean) { if (value === true || value === 'true') return true; if (value === false || value === 'false') return false; throw new Error('Parâmetro booleano inválido.'); }
        return value;
    } };
}
module.exports = { defineString: parameter, defineSecret: parameter, defineBoolean: (name, options) => parameter(name, options, true) };
