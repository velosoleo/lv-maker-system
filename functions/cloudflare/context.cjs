'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const scope = new AsyncLocalStorage();
const environment = () => { const env = scope.getStore(); if (!env) throw new Error('Contexto da integração indisponível.'); return env; };
module.exports = { scope, environment };
