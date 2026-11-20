'use strict';
class HttpsError extends Error {
    constructor(code, message, details) { super(message); this.code = code; this.details = details; }
}
const onCall = (options, handler) => Object.assign(handler, { options, callable: true });
const onRequest = (options, handler) => Object.assign(handler, { options, callable: false });
module.exports = { HttpsError, onCall, onRequest };
