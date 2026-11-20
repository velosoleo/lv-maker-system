'use strict';
function documentoValido(value) {
    const s = String(value || '').replace(/[.\/-]/g, '').toUpperCase();
    if (/^\d{11}$/.test(s)) {
        if (/^(\d)\1+$/.test(s)) return false;
        for (let n = 9; n <= 10; n++) {
            const resto = [...s.slice(0, n)].reduce((soma, v, i) => soma + Number(v) * (n + 1 - i), 0) * 10 % 11;
            if ((resto === 10 ? 0 : resto) !== Number(s[n])) return false;
        }
        return true;
    }
    if (!/^[A-Z0-9]{12}\d{2}$/.test(s) || /^(\d)\1+$/.test(s)) return false;
    for (let n = 12; n <= 13; n++) {
        let peso = n === 12 ? 5 : 6;
        const soma = [...s.slice(0, n)].reduce((total, v) => { const resultado = total + (v.charCodeAt(0) - 48) * peso; peso = peso === 2 ? 9 : peso - 1; return resultado; }, 0);
        const resto = soma % 11;
        if ((resto < 2 ? 0 : 11 - resto) !== Number(s[n])) return false;
    }
    return true;
}
module.exports = { documentoValido };
