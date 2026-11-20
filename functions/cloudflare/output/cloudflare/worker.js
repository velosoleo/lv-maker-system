var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// shims/https.cjs
var require_https = __commonJS({
  "shims/https.cjs"(exports, module) {
    "use strict";
    var HttpsError = class extends Error {
      static {
        __name(this, "HttpsError");
      }
      constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
      }
    };
    var onCall = /* @__PURE__ */ __name((options, handler) => Object.assign(handler, { options, callable: true }), "onCall");
    var onRequest = /* @__PURE__ */ __name((options, handler) => Object.assign(handler, { options, callable: false }), "onRequest");
    module.exports = { HttpsError, onCall, onRequest };
  }
});

// node-built-in-modules:node:async_hooks
import libDefault from "node:async_hooks";
var require_node_async_hooks = __commonJS({
  "node-built-in-modules:node:async_hooks"(exports, module) {
    module.exports = libDefault;
  }
});

// context.cjs
var require_context = __commonJS({
  "context.cjs"(exports, module) {
    "use strict";
    var { AsyncLocalStorage } = require_node_async_hooks();
    var scope = new AsyncLocalStorage();
    var environment = /* @__PURE__ */ __name(() => {
      const env = scope.getStore();
      if (!env) throw new Error("Contexto da integra\xE7\xE3o indispon\xEDvel.");
      return env;
    }, "environment");
    module.exports = { scope, environment };
  }
});

// shims/params.cjs
var require_params = __commonJS({
  "shims/params.cjs"(exports, module) {
    "use strict";
    var { environment } = require_context();
    function parameter(name, options = {}, boolean = false) {
      return { value() {
        const value = environment()[name] ?? options.default;
        if (value === void 0) throw new Error("Configura\xE7\xE3o da integra\xE7\xE3o incompleta.");
        if (boolean) {
          if (value === true || value === "true") return true;
          if (value === false || value === "false") return false;
          throw new Error("Par\xE2metro booleano inv\xE1lido.");
        }
        return value;
      } };
    }
    __name(parameter, "parameter");
    module.exports = { defineString: parameter, defineSecret: parameter, defineBoolean: /* @__PURE__ */ __name((name, options) => parameter(name, options, true), "defineBoolean") };
  }
});

// shims/app.cjs
var require_app = __commonJS({
  "shims/app.cjs"(exports, module) {
    "use strict";
    module.exports = { initializeApp: /* @__PURE__ */ __name(() => {
    }, "initializeApp") };
  }
});

// firestore.cjs
var require_firestore = __commonJS({
  "firestore.cjs"(exports, module) {
    "use strict";
    var { environment } = require_context();
    var Timestamp = class _Timestamp {
      static {
        __name(this, "Timestamp");
      }
      constructor(seconds, nanoseconds = 0) {
        this.seconds = seconds;
        this.nanoseconds = nanoseconds;
      }
      static fromMillis(ms) {
        return new _Timestamp(Math.floor(ms / 1e3), Math.round(ms % 1e3 * 1e6));
      }
      static now() {
        return _Timestamp.fromMillis(Date.now());
      }
      toMillis() {
        return this.seconds * 1e3 + this.nanoseconds / 1e6;
      }
    };
    function encode(value) {
      if (value === null) return { nullValue: null };
      if (value instanceof Timestamp) return { timestampValue: new Date(value.toMillis()).toISOString() };
      if (typeof value === "boolean") return { booleanValue: value };
      if (typeof value === "string") return { stringValue: value };
      if (typeof value === "number" && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
      if (value && Object.getPrototypeOf(value) === Object.prototype) return { mapValue: { fields: fields(value) } };
      throw new Error("Valor n\xE3o suportado pelo Firestore.");
    }
    __name(encode, "encode");
    var fields = /* @__PURE__ */ __name((data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])), "fields");
    function decode(value) {
      if ("nullValue" in value) return null;
      if ("timestampValue" in value) return Timestamp.fromMillis(Date.parse(value.timestampValue));
      for (const key of ["stringValue", "booleanValue", "doubleValue"]) if (key in value) return value[key];
      if ("integerValue" in value) {
        const n = Number(value.integerValue);
        if (!Number.isSafeInteger(n)) throw new Error("N\xFAmero fora do limite seguro.");
        return n;
      }
      if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
      if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
      throw new Error("Tipo do Firestore n\xE3o suportado.");
    }
    __name(decode, "decode");
    var decodeFields = /* @__PURE__ */ __name((data) => Object.fromEntries(Object.keys(data).sort().map((key) => [key, decode(data[key])])), "decodeFields");
    var b64 = /* @__PURE__ */ __name((bytes) => Buffer.from(bytes).toString("base64url"), "b64");
    var credentialCache;
    var accessCache;
    var pendingToken;
    async function accessToken(env) {
      if (accessCache?.source === env.FIREBASE_SERVICE_ACCOUNT && accessCache.expira > Date.now() + 6e4) return accessCache.token;
      if (pendingToken?.source === env.FIREBASE_SERVICE_ACCOUNT) return pendingToken.promise;
      const promise = (async () => {
        let account;
        try {
          account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
        } catch (_) {
          throw new Error("Identidade do servidor n\xE3o configurada.");
        }
        if (account.project_id !== env.FIREBASE_PROJECT_ID || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(account.client_email || "") || typeof account.private_key !== "string") throw new Error("Identidade de outro projeto ou inv\xE1lida.");
        if (credentialCache?.source !== env.FIREBASE_SERVICE_ACCOUNT) {
          const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
          const key = await crypto.subtle.importKey("pkcs8", Buffer.from(pem, "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
          credentialCache = { source: env.FIREBASE_SERVICE_ACCOUNT, key };
        }
        const now = Math.floor(Date.now() / 1e3);
        const body = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
        const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", credentialCache.key, new TextEncoder().encode(body));
        const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: body + "." + b64(signature) }), signal: AbortSignal.timeout(15e3) });
        if (!r.ok) throw new Error("N\xE3o foi poss\xEDvel autenticar o servidor.");
        const data = await r.json();
        if (typeof data.access_token !== "string" || !Number.isFinite(data.expires_in)) throw new Error("Resposta de autentica\xE7\xE3o inv\xE1lida.");
        accessCache = { source: env.FIREBASE_SERVICE_ACCOUNT, token: data.access_token, expira: Date.now() + data.expires_in * 1e3 };
        return data.access_token;
      })();
      const marker = { source: env.FIREBASE_SERVICE_ACCOUNT, promise };
      pendingToken = marker;
      try {
        return await promise;
      } finally {
        if (pendingToken === marker) pendingToken = null;
      }
    }
    __name(accessToken, "accessToken");
    var Database = class {
      static {
        __name(this, "Database");
      }
      constructor(env, request = fetch) {
        if (!/^[a-z][a-z0-9-]{4,60}$/.test(env.FIREBASE_PROJECT_ID || "")) throw new Error("Projeto inv\xE1lido.");
        this.env = env;
        this.request = request;
        this.base = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
      }
      async api(path, method = "GET", data, optional = false) {
        const token = this.env.testAccessToken || await accessToken(this.env);
        const r = await this.request("https://firestore.googleapis.com/v1/" + path, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, ...data === void 0 ? {} : { body: JSON.stringify(data) }, signal: AbortSignal.timeout(2e4) });
        if (optional && r.status === 404) return null;
        if (!r.ok) {
          const error = new Error("Opera\xE7\xE3o no banco n\xE3o confirmada.");
          error.status = r.status;
          throw error;
        }
        return await r.json();
      }
      doc(path) {
        if (typeof path !== "string" || path.split("/").length % 2 || path.split("/").some((s) => !/^[a-zA-Z0-9_-]{1,150}$/.test(s))) throw new Error("Caminho de documento inv\xE1lido.");
        const ref = { path, id: path.split("/").pop() };
        ref.get = () => this.read(ref);
        ref.set = (data) => this.commit([this.write(ref, data, "set")]);
        ref.update = (data) => this.commit([this.write(ref, data, "update")]);
        return ref;
      }
      snapshot(ref, document) {
        return { ref, id: ref.id, exists: !!document, data: /* @__PURE__ */ __name(() => document ? decodeFields(document.fields || {}) : void 0, "data") };
      }
      async read(ref, transaction) {
        const document = await this.api(this.base + "/" + ref.path + (transaction ? "?transaction=" + encodeURIComponent(transaction) : ""), "GET", void 0, true);
        return this.snapshot(ref, document);
      }
      async batch(refs, transaction) {
        if (!refs.length) return [];
        const result = await this.api(this.base + ":batchGet", "POST", { documents: refs.map((r) => this.base + "/" + r.path), ...transaction ? { transaction } : {} });
        if (!Array.isArray(result)) throw new Error("Leitura incompleta do banco.");
        return refs.map((ref) => {
          const record = result.find((r) => (r.found?.name || r.missing) === this.base + "/" + ref.path);
          if (!record) throw new Error("Leitura incompleta do banco.");
          return this.snapshot(ref, record.found || null);
        });
      }
      getAll(...refs) {
        return this.batch(refs);
      }
      collection(name) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(name)) throw new Error("Cole\xE7\xE3o inv\xE1lida.");
        return { doc: /* @__PURE__ */ __name((id = crypto.randomUUID()) => this.doc(name + "/" + id), "doc"), where: /* @__PURE__ */ __name((field, op, value) => {
          if (op !== "==" || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field)) throw new Error("Consulta inv\xE1lida.");
          return { get: /* @__PURE__ */ __name(async () => {
            const result = await this.api(this.base + ":runQuery", "POST", { structuredQuery: { from: [{ collectionId: name }], where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: encode(value) } } } });
            if (!Array.isArray(result)) throw new Error("Consulta incompleta.");
            const docs = result.filter((r) => r.document).map((r) => this.snapshot(this.doc(name + "/" + r.document.name.split("/").pop()), r.document));
            return { docs, forEach: /* @__PURE__ */ __name((callback) => docs.forEach(callback), "forEach") };
          }, "get") };
        }, "where") };
      }
      write(ref, data, type) {
        const w = { update: { name: this.base + "/" + ref.path, fields: fields(data) } };
        if (type === "create") w.currentDocument = { exists: false };
        if (type === "update") {
          w.currentDocument = { exists: true };
          w.updateMask = { fieldPaths: Object.keys(data) };
        }
        return w;
      }
      commit(writes, transaction) {
        return this.api(this.base + ":commit", "POST", { writes, ...transaction ? { transaction } : {} });
      }
      async runTransaction(callback) {
        for (let attempt = 0; attempt < 4; attempt++) {
          const { transaction } = await this.api(this.base + ":beginTransaction", "POST", { options: { readWrite: {} } });
          if (typeof transaction !== "string" || !transaction) throw new Error("Transa\xE7\xE3o n\xE3o iniciada.");
          const writes = [];
          let wrote = false;
          const read = /* @__PURE__ */ __name(async (ref) => {
            if (wrote) throw new Error("Leitura ap\xF3s escrita na transa\xE7\xE3o.");
            return this.read(ref, transaction);
          }, "read");
          const queue = /* @__PURE__ */ __name((type) => (ref, data) => {
            wrote = true;
            writes.push(this.write(ref, data, type));
          }, "queue");
          try {
            const result = await callback({ get: read, getAll: /* @__PURE__ */ __name(async (...refs) => {
              if (wrote) throw new Error("Leitura ap\xF3s escrita na transa\xE7\xE3o.");
              return this.batch(refs, transaction);
            }, "getAll"), create: queue("create"), set: queue("set"), update: queue("update") });
            await this.commit(writes, transaction);
            return result;
          } catch (e) {
            try {
              await this.api(this.base + ":rollback", "POST", { transaction });
            } catch (_) {
            }
            if (e.status !== 409 || attempt === 3) throw e;
          }
        }
      }
    };
    var getFirestore = /* @__PURE__ */ __name(() => new Proxy({}, { get(_, name) {
      const db = new Database(environment());
      const fn = db[name];
      return typeof fn === "function" ? fn.bind(db) : fn;
    } }), "getFirestore");
    module.exports = { Timestamp, getFirestore, Database, encode, decode, fields, decodeFields };
  }
});

// shims/firestore.cjs
var require_firestore2 = __commonJS({
  "shims/firestore.cjs"(exports, module) {
    "use strict";
    module.exports = require_firestore();
  }
});

// ../frete.js
var require_frete = __commonJS({
  "../frete.js"(exports, module) {
    "use strict";
    var normalizar = /* @__PURE__ */ __name((valor) => String(valor || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), "normalizar");
    function itensSolicitados(itens) {
      if (!Array.isArray(itens) || itens.length < 1 || itens.length > 20) throw new Error("Selecione entre 1 e 20 produtos.");
      const resultado = /* @__PURE__ */ new Map();
      for (const item of itens) {
        if (!item || typeof item.produtoId !== "string" || !/^[^/\s]{1,150}$/.test(item.produtoId) || !Number.isInteger(item.qtd) || item.qtd < 1 || item.qtd > 100) throw new Error("Produto ou quantidade inv\xE1lida.");
        const qtd = (resultado.get(item.produtoId) || 0) + item.qtd;
        if (qtd > 100) throw new Error("Quantidade m\xE1xima de 100 unidades por produto.");
        resultado.set(item.produtoId, qtd);
      }
      return [...resultado].map(([produtoId, qtd]) => ({ produtoId, qtd }));
    }
    __name(itensSolicitados, "itensSolicitados");
    function produtosConferidos(itens, registros) {
      return itens.map((item, i) => {
        const p = registros[i];
        const precoCentavos = Math.round(Number(p?.preco) * 100);
        if (!p?.ativo || !Number.isSafeInteger(precoCentavos) || precoCentavos < 1) throw new Error("Um produto n\xE3o est\xE1 dispon\xEDvel. Atualize o carrinho.");
        if (p.disponibilidade === "pronta_entrega" && (!Number.isFinite(Number(p.estoquePronto)) || Number(p.estoquePronto) < item.qtd)) {
          throw new Error("Quantidade indispon\xEDvel em estoque. Atualize o carrinho.");
        }
        return { ...item, nome: String(p.nome || "Produto").slice(0, 200), precoCentavos, embalagem: p.embalagem || null, disponibilidade: p.disponibilidade || "sob_demanda" };
      });
    }
    __name(produtosConferidos, "produtosConferidos");
    function produtosParaFrete(produtos) {
      return produtos.map((p) => {
        const e = p.embalagem;
        if (!e || ["pesoKg", "larguraCm", "alturaCm", "comprimentoCm"].some((campo) => !Number.isFinite(e[campo]) || e[campo] <= 0 || e[campo] > 1e3)) {
          throw new Error(`As medidas de envio de ${p.nome} ainda precisam ser cadastradas.`);
        }
        return {
          id: p.produtoId,
          quantity: p.qtd,
          width: e.larguraCm,
          height: e.alturaCm,
          length: e.comprimentoCm,
          weight: e.pesoKg,
          insurance_value: p.precoCentavos / 100
        };
      });
    }
    __name(produtosParaFrete, "produtosParaFrete");
    function opcoesProprias(config, destino) {
      const opcoes = [];
      if (config.retiradaHabilitada === true) opcoes.push({ id: "retirada", tipo: "retirada", nome: "Retirada no local", precoCentavos: 0, prazoDias: 0 });
      const local = config.entregaLocal;
      if (local?.habilitada === true && normalizar(destino.localidade) === "guaramirim" && destino.uf === "SC" && Number.isSafeInteger(local.taxaCentavos) && local.taxaCentavos >= 0 && Number.isInteger(local.prazoDias) && local.prazoDias >= 0 && local.prazoDias <= 30) {
        const bairros = local.bairros || [];
        if (!bairros.length || bairros.some((b) => normalizar(b) === normalizar(destino.bairro))) {
          opcoes.push({ id: "local", tipo: "local", nome: "Entrega pela LV Maker em Guaramirim", precoCentavos: local.taxaCentavos, prazoDias: local.prazoDias });
        }
      }
      return opcoes;
    }
    __name(opcoesProprias, "opcoesProprias");
    function opcoesTransportadoras(resposta) {
      if (!Array.isArray(resposta)) throw new Error("N\xE3o foi poss\xEDvel obter as op\xE7\xF5es de frete.");
      return resposta.filter((s) => !s.error).flatMap((s) => {
        const valor = s.custom_price ?? s.price;
        const dias = s.custom_delivery_time ?? s.delivery_time;
        if (valor == null || dias == null || s.id == null || String(valor).trim() === "") return [];
        const preco = Number(valor);
        const prazo = Number(dias);
        if (!Number.isFinite(preco) || preco < 0 || preco > 1e5 || !Number.isInteger(prazo) || prazo < 0 || prazo > 365 || !Number.isInteger(Number(s.id))) return [];
        return [{ id: "me_" + s.id, tipo: "transportadora", servicoId: Number(s.id), nome: `${s.company?.name || ""} ${s.name || ""}`.trim().slice(0, 150), precoCentavos: Math.round(preco * 100), prazoDias: prazo }];
      });
    }
    __name(opcoesTransportadoras, "opcoesTransportadoras");
    module.exports = { itensSolicitados, produtosConferidos, produtosParaFrete, opcoesProprias, opcoesTransportadoras };
  }
});

// node-built-in-modules:node:crypto
import libDefault2 from "node:crypto";
var require_node_crypto = __commonJS({
  "node-built-in-modules:node:crypto"(exports, module) {
    module.exports = libDefault2;
  }
});

// ../documento.js
var require_documento = __commonJS({
  "../documento.js"(exports, module) {
    "use strict";
    function documentoValido(value) {
      const s = String(value || "").replace(/[.\/-]/g, "").toUpperCase();
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
        const soma = [...s.slice(0, n)].reduce((total, v) => {
          const resultado = total + (v.charCodeAt(0) - 48) * peso;
          peso = peso === 2 ? 9 : peso - 1;
          return resultado;
        }, 0);
        const resto = soma % 11;
        if ((resto < 2 ? 0 : 11 - resto) !== Number(s[n])) return false;
      }
      return true;
    }
    __name(documentoValido, "documentoValido");
    module.exports = { documentoValido };
  }
});

// ../pagamento.js
var require_pagamento = __commonJS({
  "../pagamento.js"(exports, module) {
    "use strict";
    var crypto2 = require_node_crypto();
    var { documentoValido } = require_documento();
    var hash = /* @__PURE__ */ __name((value) => crypto2.createHash("sha256").update(value).digest("hex"), "hash");
    function texto(value, min, max, label) {
      if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new Error(`Confira ${label}.`);
      return value.trim();
    }
    __name(texto, "texto");
    function comprador(data, entrega) {
      const nome = texto(data?.nome, 2, 100, "seu nome");
      const telefone = String(data?.telefone || "").replace(/\D/g, "");
      if (!/^(?:55)?[0-9]{10,11}$/.test(telefone)) throw new Error("Informe seu WhatsApp com DDD.");
      const observacao = texto(data?.observacao || "", 0, 500, "a observa\xE7\xE3o");
      let endereco = null;
      if (entrega.tipo !== "retirada") {
        const e = data?.endereco;
        endereco = {
          cep: texto(e?.cep, 8, 8, "o CEP"),
          rua: texto(e?.rua, 2, 150, "a rua"),
          bairro: texto(e?.bairro, 2, 100, "o bairro"),
          numero: texto(e?.numero, 1, 20, "o n\xFAmero"),
          complemento: texto(e?.complemento || "", 0, 100, "o complemento")
        };
        if (!/^[0-9]{8}$/.test(endereco.cep)) throw new Error("CEP inv\xE1lido.");
      }
      const documento = String(data?.documento || "").replace(/[.\s\/-]/g, "").toUpperCase();
      if ((entrega.tipo === "transportadora" || documento) && !documentoValido(documento)) throw new Error("Informe um CPF ou CNPJ v\xE1lido para o envio.");
      return { nome, telefone, observacao, endereco, ...documento ? { documento } : {} };
    }
    __name(comprador, "comprador");
    function confirmado(resposta, esperado) {
      return resposta?.success === true && resposta.paid === true && Number.isSafeInteger(resposta.amount) && resposta.amount === esperado && Number.isSafeInteger(resposta.paid_amount) && resposta.paid_amount >= esperado && ["pix", "credit_card"].includes(resposta.capture_method) && Number.isInteger(resposta.installments) && resposta.installments >= 1 && resposta.installments <= 12;
    }
    __name(confirmado, "confirmado");
    function linkValido(url) {
      try {
        const u = new URL(url);
        return u.protocol === "https:" && u.hostname === "checkout.infinitepay.com.br" && !u.username && !u.password;
      } catch (_) {
        return false;
      }
    }
    __name(linkValido, "linkValido");
    function distribuirFrete(itens, freteCentavos) {
      const subtotal = itens.reduce((s, i) => s + i.precoCentavos * i.qtd, 0);
      let distribuido = 0;
      return itens.map((i, n) => {
        const parte = n === itens.length - 1 ? freteCentavos - distribuido : Math.floor(freteCentavos * i.precoCentavos * i.qtd / subtotal);
        distribuido += parte;
        return { ...i, freteCentavos: parte, totalCentavos: i.precoCentavos * i.qtd + parte };
      });
    }
    __name(distribuirFrete, "distribuirFrete");
    module.exports = { hash, texto, comprador, confirmado, linkValido, distribuirFrete };
  }
});

// ../etiqueta.js
var require_etiqueta = __commonJS({
  "../etiqueta.js"(exports, module) {
    "use strict";
    var { texto } = require_pagamento();
    var { documentoValido } = require_documento();
    function pessoa(d, destinatario = false) {
      const documento = texto(d?.documento, 11, 18, "o CPF ou CNPJ").replace(/[.\/-]/g, "").toUpperCase();
      if (!documentoValido(documento)) throw new Error("CPF ou CNPJ inv\xE1lido.");
      const postal_code = texto(d?.cep, 8, 8, "o CEP");
      if (!/^\d{8}$/.test(postal_code)) throw new Error("CEP inv\xE1lido.");
      const telefone = String(d?.telefone || "").replace(/\D/g, "");
      if (!/^(?:55)?\d{10,11}$/.test(telefone)) throw new Error("Confira o telefone com DDD.");
      const email = texto(d?.email || "", destinatario ? 0 : 3, 150, "o e-mail");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail inv\xE1lido.");
      const state_abbr = texto(d?.uf, 2, 2, "o estado").toUpperCase();
      if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(state_abbr)) throw new Error("Estado inv\xE1lido.");
      const result = {
        name: texto(d?.nome, 2, 100, "o nome"),
        phone: telefone,
        email,
        address: texto(d?.rua, 2, 150, "a rua"),
        number: texto(d?.numero, 1, 20, "o n\xFAmero"),
        district: texto(d?.bairro, 2, 100, "o bairro"),
        city: texto(d?.cidade, 2, 100, "a cidade"),
        complement: texto(d?.complemento || "", 0, 100, "o complemento"),
        postal_code,
        state_abbr,
        country_id: "BR",
        state_register: texto(d?.inscricaoEstadual || "ISENTO", 1, 30, "a inscri\xE7\xE3o estadual")
      };
      result[documento.length === 11 ? "document" : "company_document"] = documento;
      return result;
    }
    __name(pessoa, "pessoa");
    function volume(d) {
      const result = {};
      for (const key of ["width", "height", "length", "weight"]) {
        const v = d?.[key];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 1e3) throw new Error("Informe peso e medidas da embalagem pronta, maiores que zero.");
        result[key] = v;
      }
      return result;
    }
    __name(volume, "volume");
    function centavos(value) {
      if (value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("Pre\xE7o de envio inv\xE1lido.");
      const n = Math.round(Number(value) * 100);
      if (!Number.isSafeInteger(n) || n > 1e7) throw new Error("Pre\xE7o de envio inv\xE1lido.");
      return n;
    }
    __name(centavos, "centavos");
    function imprimirURL(value) {
      try {
        const u = new URL(value);
        return u.protocol === "https:" && ["melhorenvio.com.br", "sandbox.melhorenvio.com.br"].includes(u.hostname) && !u.username && !u.password;
      } catch (_) {
        return false;
      }
    }
    __name(imprimirURL, "imprimirURL");
    function payload(compra, cfg, dados) {
      if (compra.status !== "pago" || compra.entrega?.tipo !== "transportadora") throw new Error("Este pedido n\xE3o tem um pagamento confirmado com transportadora.");
      const from = pessoa(cfg.remetente);
      if (from.postal_code !== cfg.cepOrigem) throw new Error("O CEP do remetente deve ser o CEP de origem cadastrado.");
      const e = compra.cliente.endereco;
      const to = pessoa({
        ...e,
        nome: compra.cliente.nome,
        telefone: compra.cliente.telefone,
        documento: dados.documentoDestinatario || compra.cliente.documento,
        email: compra.cliente.email || "",
        cidade: dados.cidadeDestino,
        uf: dados.ufDestino
      }, true);
      const chaveNota = String(dados.chaveNota || "").replace(/\s/g, "");
      const declaracao = dados.documentoFiscal === "declaracao";
      if (dados.documentoFiscal && !["nota", "declaracao"].includes(dados.documentoFiscal)) throw new Error("Documento fiscal inv\xE1lido.");
      if (declaracao) {
        if (dados.dispensaNotaConfirmada !== true) throw new Error("Confirme que este envio est\xE1 dispensado de nota fiscal antes de usar a declara\xE7\xE3o.");
        if (from.state_register.toUpperCase() !== "ISENTO") throw new Error("Confira a condi\xE7\xE3o do remetente: declara\xE7\xE3o exige aus\xEAncia de inscri\xE7\xE3o estadual ou ISENTO.");
        if (chaveNota) throw new Error("N\xE3o combine nota fiscal e declara\xE7\xE3o no mesmo envio.");
      } else if (!/^\d{44}$/.test(chaveNota) || /^(\d)\1+$/.test(chaveNota)) throw new Error("Informe a chave de acesso de 44 d\xEDgitos da nota fiscal para este envio comercial.");
      const service = compra.entrega.servicoId;
      if (!Number.isInteger(service) || !cfg.servicosEnvio?.some((s) => s.id === service && s.ponto?.trim())) throw new Error("Configure o ponto de postagem deste servi\xE7o em Entregas.");
      const seguro = compra.itens.reduce((s, i) => s + i.precoCentavos * i.qtd, 0);
      const v = volume(dados.volume);
      return {
        service,
        from,
        to,
        products: compra.itens.map((i) => ({ name: i.nome, quantity: i.qtd, unitary_value: i.precoCentavos / 100 })),
        volumes: [v],
        options: {
          platform: "LV Maker",
          reminder: "LV Maker " + dados.checkoutId,
          insurance_value: seguro / 100,
          receipt: false,
          own_hand: false,
          reverse: false,
          ...declaracao ? {} : { invoice: { key: chaveNota } },
          tags: [{ tag: dados.checkoutId, url: null }]
        }
      };
    }
    __name(payload, "payload");
    function declaracaoURL(value) {
      if (imprimirURL(value)) return true;
      try {
        const u = new URL(value);
        return u.protocol === "https:" && u.hostname === "me-0047-prod.s3.amazonaws.com" && !u.username && !u.password;
      } catch (_) {
        return false;
      }
    }
    __name(declaracaoURL, "declaracaoURL");
    module.exports = { documentoValido, pessoa, volume, centavos, imprimirURL, declaracaoURL, payload };
  }
});

// ../checkout.js
var require_checkout = __commonJS({
  "../checkout.js"(exports, module) {
    "use strict";
    var { onCall, onRequest, HttpsError } = require_https();
    var { defineString } = require_params();
    var { Timestamp } = require_firestore2();
    var crypto2 = require_node_crypto();
    var p = require_pagamento();
    var frete = require_frete();
    var site = defineString("CHECKOUT_SITE_URL", { default: "https://lv-maker.web.app" });
    var webhookBase = defineString("CHECKOUT_WEBHOOK_BASE_URL", { default: "" });
    var options = { region: "southamerica-east1", enforceAppCheck: true, maxInstances: 3, concurrency: 10, timeoutSeconds: 60 };
    async function api(path, data) {
      const r = await fetch("https://api.checkout.infinitepay.io/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(15e3)
      });
      if (!r.ok) throw new Error("InfinitePay indispon\xEDvel agora. Tente novamente.");
      return r.json();
    }
    __name(api, "api");
    var id = /* @__PURE__ */ __name((value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value), "id");
    module.exports = (db) => {
      async function config() {
        const doc = await db.doc("configuracoes/checkout").get();
        const c = doc.data();
        if (!c || !c.usuario || !(await db.doc("admins/" + c.usuario).get()).exists) throw new HttpsError("failed-precondition", "Loja ainda preparando os pagamentos.");
        return c;
      }
      __name(config, "config");
      const opcoesCheckout = onCall(options, async () => {
        const c = await config();
        return {
          ativo: c.pagamentoAtivo === true && c.repasseConfirmado === true && /^[a-zA-Z0-9_.-]{1,100}$/.test(c.infiniteTag || ""),
          retirada: c.retiradaHabilitada === true,
          transportadoras: c.transportadoraHabilitada === true
        };
      });
      const criarPagamento = onCall(options, async (request) => {
        const d = request.data || {};
        if (!id(d.chave) || typeof d.token !== "string" || !/^[a-f0-9]{64}$/.test(d.token)) throw new HttpsError("invalid-argument", "Identifica\xE7\xE3o de compra inv\xE1lida.");
        const c = await config();
        if (!c.pagamentoAtivo || !c.repasseConfirmado || !/^[a-zA-Z0-9_.-]{1,100}$/.test(c.infiniteTag || "")) throw new HttpsError("failed-precondition", "Pagamento online ainda n\xE3o ativado.");
        const ref = db.doc("checkouts/" + d.chave);
        const anterior = await ref.get();
        if (anterior.exists) {
          const a = anterior.data();
          if (a.tokenHash !== p.hash(d.token)) throw new HttpsError("permission-denied", "Compra indispon\xEDvel.");
          if (a.url) return { url: a.url, pedidoId: ref.id };
          throw new HttpsError("failed-precondition", "Esta tentativa est\xE1 sendo processada ou precisa de confer\xEAncia. N\xE3o fa\xE7a um novo pagamento; contate a loja.", { compraIniciada: true });
        }
        let itens, entrega, cliente, cotacao = null;
        try {
          itens = frete.itensSolicitados(d.itens);
          if (d.entregaId === "retirada" && c.retiradaHabilitada) entrega = { id: "retirada", tipo: "retirada", nome: "Retirada no local", precoCentavos: 0, prazoDias: 0 };
          else {
            if (!id(d.cotacaoId)) throw new Error("Calcule o frete antes de pagar.");
            cotacao = (await db.doc("cotacoesFrete/" + d.cotacaoId).get()).data();
            if (!cotacao || cotacao.usuario !== c.usuario || cotacao.expiraEm.toMillis() < Date.now() || cotacao.consumidaPor) throw new Error("O frete expirou. Calcule novamente.");
            entrega = cotacao.opcoes.find((o) => o.id === d.entregaId);
            if (!entrega || entrega.tipo === "transportadora" && cotacao.ambiente !== "producao") throw new Error("Este frete de teste ainda n\xE3o pode ser comprado.");
          }
          cliente = p.comprador(d.cliente, entrega);
          if (cotacao && cliente.endereco?.cep !== cotacao.cep) throw new Error("O CEP mudou. Calcule o frete novamente.");
          if (entrega.tipo === "transportadora" && !c.transportadoraHabilitada) throw new Error("Envio por transportadora desativado.");
          if (entrega.tipo === "transportadora" && !c.servicosEnvio?.some((s) => s.id === entrega.servicoId && s.ponto?.trim())) throw new Error("Este servi\xE7o de entrega mudou. Calcule novamente.");
          if (entrega.tipo === "transportadora") {
            const remetente = require_etiqueta().pessoa(c.remetente);
            if (remetente.postal_code !== c.cepOrigem) throw new Error("A loja precisa conferir o CEP do remetente.");
          }
          if (entrega.tipo === "local") {
            const atual = frete.opcoesProprias(c, cotacao.destino || {}).find((o) => o.id === "local");
            const normalizar = /* @__PURE__ */ __name((s) => s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(), "normalizar");
            if (!atual || atual.precoCentavos !== entrega.precoCentavos || atual.prazoDias !== entrega.prazoDias || (c.entregaLocal.bairros || []).length && normalizar(cliente.endereco.bairro) !== normalizar(cotacao.destino.bairro)) throw new Error("A entrega mudou. Confira o bairro e calcule novamente.");
          }
        } catch (e) {
          throw new HttpsError("invalid-argument", e.message);
        }
        const webhookToken = crypto2.randomBytes(32).toString("hex");
        const base = site.value().replace(/\/$/, "");
        if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(base)) throw new HttpsError("failed-precondition", "Endere\xE7o da loja n\xE3o configurado.");
        let compra;
        await db.runTransaction(async (tx) => {
          const existente = await tx.get(ref);
          if (existente.exists) throw new HttpsError("already-exists", "Compra j\xE1 iniciada. Tente novamente com a mesma identifica\xE7\xE3o.");
          const configAtual = (await tx.get(db.doc("configuracoes/checkout"))).data();
          if (JSON.stringify(configAtual) !== JSON.stringify(c)) throw new HttpsError("failed-precondition", "As op\xE7\xF5es da loja mudaram. Recarregue o cat\xE1logo.");
          const rateRef = db.doc("limitesCheckout/" + p.hash(request.rawRequest.ip || "desconhecido"));
          const rateDoc = await tx.get(rateRef);
          const rate = rateDoc.data();
          const recente = rate?.inicio?.toMillis() > Date.now() - 6e5;
          if (recente && rate.total >= 5) throw new HttpsError("resource-exhausted", "Muitas tentativas. Aguarde alguns minutos.");
          let quoteRef, quote;
          if (cotacao) {
            quoteRef = db.doc("cotacoesFrete/" + d.cotacaoId);
            quote = (await tx.get(quoteRef)).data();
            if (!quote || quote.consumidaPor || quote.expiraEm.toMillis() < Date.now()) throw new HttpsError("failed-precondition", "Calcule o frete novamente.");
          }
          const docs = await tx.getAll(...itens.map((i) => db.doc("produtos/" + i.produtoId)));
          let produtos;
          try {
            produtos = frete.produtosConferidos(itens, docs.map((doc) => doc.data()));
          } catch (e) {
            throw new HttpsError("failed-precondition", e.message);
          }
          if (quote) {
            const assinatura = /* @__PURE__ */ __name((lista) => JSON.stringify(lista.map((i) => [i.produtoId, i.qtd, i.precoCentavos, i.embalagem]).sort((a, b) => a[0].localeCompare(b[0]))), "assinatura");
            if (assinatura(produtos) !== assinatura(quote.itens)) throw new HttpsError("failed-precondition", "O carrinho ou as medidas mudaram. Calcule o frete novamente.");
          }
          const subtotal = produtos.reduce((s, i) => s + i.qtd * i.precoCentavos, 0);
          const total = subtotal + entrega.precoCentavos;
          if (!Number.isSafeInteger(total) || total <= 0 || total > 1e7) throw new HttpsError("invalid-argument", "Total inv\xE1lido.");
          compra = {
            usuario: c.usuario,
            handle: c.infiniteTag,
            cliente,
            itens: produtos,
            entrega,
            totalCentavos: total,
            tokenHash: p.hash(d.token),
            webhookHash: p.hash(webhookToken),
            status: "criando",
            criadoEm: Timestamp.now()
          };
          tx.create(ref, compra);
          tx.set(rateRef, { inicio: recente ? rate.inicio : Timestamp.now(), total: recente ? rate.total + 1 : 1 });
          if (quoteRef) tx.update(quoteRef, { consumidaPor: ref.id });
        });
        const payload = {
          handle: compra.handle,
          order_nsu: ref.id,
          items: compra.itens.map((i) => ({ quantity: i.qtd, price: i.precoCentavos, description: i.nome })),
          customer: { name: cliente.nome, phone_number: "+" + (cliente.telefone.length <= 11 ? "55" : "") + cliente.telefone },
          redirect_url: `${base}/pagamento.html?pedido=${ref.id}&token=${d.token}`,
          webhook_url: `${webhookBase.value() || base}/api/infinitepay?token=${webhookToken}`
        };
        if (entrega.precoCentavos > 0) payload.items.push({ quantity: 1, price: entrega.precoCentavos, description: entrega.nome });
        if (cliente.endereco) payload.address = {
          cep: cliente.endereco.cep,
          street: cliente.endereco.rua,
          neighborhood: cliente.endereco.bairro,
          number: cliente.endereco.numero,
          complement: cliente.endereco.complemento
        };
        try {
          const resposta = await api("links", payload);
          if (!p.linkValido(resposta.url)) throw new Error("Link de pagamento inv\xE1lido.");
          await db.runTransaction(async (tx) => {
            const atual = (await tx.get(ref)).data();
            tx.update(ref, { url: resposta.url, ...atual.status === "pago" ? {} : { status: "pendente" } });
          });
          return { url: resposta.url, pedidoId: ref.id };
        } catch (_) {
          await ref.update({ erroCriacao: true });
          throw new HttpsError("unavailable", "N\xE3o foi poss\xEDvel obter o link. N\xE3o fa\xE7a outra compra; contate a loja para conferir esta tentativa: " + ref.id);
        }
      });
      async function confirmar(ref, slug, transaction) {
        const doc = await ref.get();
        if (!doc.exists) throw new Error("Pedido inexistente.");
        const compra = doc.data();
        if (compra.status === "pago") return true;
        const r = await api("payment_check", { handle: compra.handle, order_nsu: ref.id, transaction_nsu: transaction, slug });
        if (!p.confirmado(r, compra.totalCentavos)) return false;
        const nomeBusca = /* @__PURE__ */ __name((s) => String(s || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""), "nomeBusca");
        const clientes = await db.collection("clientes").where("usuario", "==", compra.usuario).get();
        const encontrados = clientes.docs.filter((doc2) => nomeBusca(doc2.data().nome) === nomeBusca(compra.cliente.nome) && String(doc2.data().telefone || "").replace(/\D/g, "") === compra.cliente.telefone);
        const clienteId = encontrados.length === 1 ? encontrados[0].id : "online_" + p.hash(compra.usuario + ":" + compra.cliente.telefone + ":" + nomeBusca(compra.cliente.nome));
        await db.runTransaction(async (tx) => {
          const atual = (await tx.get(ref)).data();
          if (atual.status === "pago") return;
          const transRef = db.doc("transacoesInfinitepay/" + p.hash(transaction));
          const trans = await tx.get(transRef);
          if (trans.exists && trans.data().checkoutId !== ref.id) throw new Error("Transa\xE7\xE3o j\xE1 vinculada.");
          const produtoDocs = await tx.getAll(...atual.itens.map((i) => db.doc("produtos/" + i.produtoId)));
          const clienteRef = db.doc("clientes/" + clienteId);
          const clienteDoc = await tx.get(clienteRef);
          if (clienteDoc.exists && clienteDoc.data().usuario !== atual.usuario) throw new Error("Cliente indispon\xEDvel.");
          const agora = Timestamp.now();
          const data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
          const forma = r.capture_method === "pix" ? "Pix" : "Cart\xE3o de cr\xE9dito";
          let estoquePendente = false;
          p.distribuirFrete(atual.itens, atual.entrega.precoCentavos).forEach((item, n) => {
            const produto = produtoDocs[n].data();
            const estoque = Number(produto?.estoquePronto);
            const pendente = item.disponibilidade === "pronta_entrega" && (!Number.isFinite(estoque) || estoque < item.qtd);
            estoquePendente ||= pendente;
            if (item.disponibilidade === "pronta_entrega" && !pendente) tx.update(produtoDocs[n].ref, { estoquePronto: estoque - item.qtd, atualizadoEm: agora });
            const pedidoRef = db.doc(`pedidos/ip_${ref.id}_${n}`);
            tx.create(pedidoRef, {
              usuario: atual.usuario,
              pedidoId: `ip_${ref.id}_${n}`,
              data,
              dataPagamento: data,
              dataEntrega: "",
              cliente: atual.cliente.nome,
              clienteId,
              telefone: atual.cliente.telefone,
              observacao: atual.cliente.observacao,
              produto: item.nome,
              produtoId: item.produtoId,
              qtd: item.qtd,
              valor: item.precoCentavos / 100,
              total: item.totalCentavos / 100,
              frete: item.freteCentavos / 100,
              custo: null,
              lucro: null,
              custoConfirmado: false,
              pagamento: forma,
              status: "Aguardando",
              pago: "Sim",
              valorRecebido: item.totalCentavos / 100,
              origem: "catalogo",
              checkoutId: ref.id,
              entrega: atual.entrega,
              enderecoEntrega: atual.cliente.endereco,
              estoquePendente: pendente,
              criadoEm: agora
            });
            tx.create(db.doc(`pagamentos/ip_${ref.id}_${n}`), {
              usuario: atual.usuario,
              pedidoId: pedidoRef.id,
              valor: item.totalCentavos / 100,
              data,
              forma,
              observacao: "Pagamento confirmado pela InfinitePay; frete inclu\xEDdo.",
              criadoEm: agora
            });
          });
          if (!clienteDoc.exists) tx.create(clienteRef, {
            usuario: atual.usuario,
            nome: atual.cliente.nome,
            telefone: atual.cliente.telefone,
            nomeBusca: nomeBusca(atual.cliente.nome),
            observacoes: "",
            criadoEm: agora,
            atualizadoEm: agora
          });
          tx.set(transRef, { checkoutId: ref.id, usuario: atual.usuario, criadoEm: agora });
          tx.update(ref, {
            status: "pago",
            pagoEm: agora,
            transactionNsu: transaction,
            slug,
            parcelas: r.installments,
            valorPagoCentavos: r.paid_amount,
            estoquePendente
          });
        });
        return true;
      }
      __name(confirmar, "confirmar");
      const consultarPagamento = onCall(options, async (request) => {
        const d = request.data || {};
        if (!id(d.pedido) || typeof d.token !== "string" || !/^[a-f0-9]{64}$/.test(d.token)) throw new HttpsError("invalid-argument", "Identifica\xE7\xE3o inv\xE1lida.");
        const ref = db.doc("checkouts/" + d.pedido);
        const doc = await ref.get();
        if (!doc.exists || doc.data().tokenHash !== p.hash(d.token)) throw new HttpsError("permission-denied", "Pedido indispon\xEDvel.");
        if (doc.data().status === "pago") return { pago: true };
        if (id(d.slug) && id(d.transaction)) {
          try {
            return { pago: await confirmar(ref, d.slug, d.transaction) };
          } catch (_) {
            throw new HttpsError("unavailable", "N\xE3o foi poss\xEDvel confirmar agora. Tente novamente.");
          }
        }
        return { pago: false };
      });
      const webhookInfinitepay = onRequest({ region: "southamerica-east1", maxInstances: 3, concurrency: 10, timeoutSeconds: 60 }, async (req, res) => {
        res.set("Cache-Control", "no-store");
        if (req.method !== "POST") return res.status(405).send("M\xE9todo inv\xE1lido.");
        const d = req.body || {};
        if (!id(d.order_nsu) || !id(d.invoice_slug) || !id(d.transaction_nsu) || typeof req.query.token !== "string") return res.status(400).send("Aviso inv\xE1lido.");
        try {
          const ref = db.doc("checkouts/" + d.order_nsu);
          const doc = await ref.get();
          if (!doc.exists || doc.data().webhookHash !== p.hash(req.query.token)) return res.status(400).send("Aviso inv\xE1lido.");
          return res.status(await confirmar(ref, d.invoice_slug, d.transaction_nsu) ? 200 : 400).send("Recebido.");
        } catch (_) {
          return res.status(400).send("Tente novamente.");
        }
      });
      return { opcoesCheckout, criarPagamento, consultarPagamento, webhookInfinitepay };
    };
  }
});

// ../envios.js
var require_envios = __commonJS({
  "../envios.js"(exports, module) {
    "use strict";
    var { onCall, HttpsError } = require_https();
    var { Timestamp } = require_firestore2();
    var crypto2 = require_node_crypto();
    var etiqueta = require_etiqueta();
    var uuid = /* @__PURE__ */ __name((id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id), "uuid");
    var empresasSuportadas = /^(Correios|Jadlog|Loggi|J&T(?: Express)?)$/i;
    module.exports = (db, integracao) => {
      const options = { region: "southamerica-east1", enforceAppCheck: true, secrets: [integracao.token], maxInstances: 3, concurrency: 10, timeoutSeconds: 120 };
      const ambiente = /* @__PURE__ */ __name(() => integracao.sandbox.value() ? "sandbox" : "producao", "ambiente");
      async function api(path, method = "GET", data) {
        const email = integracao.contato.value();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) throw new HttpsError("failed-precondition", "Contato da integra\xE7\xE3o n\xE3o configurado.");
        const base = ambiente() === "sandbox" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
        try {
          const r = await fetch(base + "/api/v2/me/" + path, {
            method,
            headers: { Authorization: "Bearer " + integracao.token.value(), Accept: "application/json", "Content-Type": "application/json", "User-Agent": `LV Maker (${email})` },
            ...data ? { body: JSON.stringify(data) } : {},
            signal: AbortSignal.timeout(2e4)
          });
          if (!r.ok) throw new Error("provider");
          return await r.json();
        } catch (_) {
          throw new HttpsError("unavailable", "Melhor Envio n\xE3o confirmou a opera\xE7\xE3o. Confira a conex\xE3o, as permiss\xF5es, os documentos e o saldo da sua carteira.");
        }
      }
      __name(api, "api");
      async function loja(request) {
        const uid = request.auth?.uid;
        if (!uid || !(await db.doc("admins/" + uid).get()).exists) throw new HttpsError("permission-denied", "Acesso de administrador necess\xE1rio.");
        const cfg = (await db.doc("configuracoes/checkout").get()).data();
        if (!cfg || cfg.usuario !== uid) throw new HttpsError("permission-denied", "Configura\xE7\xE3o de outra loja.");
        return cfg;
      }
      __name(loja, "loja");
      async function compra(request) {
        const cfg = await loja(request);
        const checkoutId = request.data?.checkoutId;
        if (!uuid(checkoutId)) throw new HttpsError("invalid-argument", "Pedido inv\xE1lido.");
        const c = (await db.doc("checkouts/" + checkoutId).get()).data();
        if (!c || c.usuario !== request.auth.uid || c.status !== "pago" || c.entrega?.tipo !== "transportadora") throw new HttpsError("failed-precondition", "Pedido pago com transportadora n\xE3o encontrado.");
        if (c.estoquePendente) throw new HttpsError("failed-precondition", "Confira o estoque deste pedido antes de despachar.");
        return { cfg, c, checkoutId, ref: db.doc("envios/" + checkoutId) };
      }
      __name(compra, "compra");
      const consultarConexaoEnvio = onCall(options, async (request) => {
        await loja(request);
        const resposta = await api("shipment/services");
        if (!Array.isArray(resposta)) throw new HttpsError("unavailable", "Lista de servi\xE7os indispon\xEDvel.");
        return { ambiente: ambiente(), servicos: resposta.filter((s) => empresasSuportadas.test(s.company?.name || "")).map((s) => ({ id: Number(s.id), nome: `${s.company.name} ${s.name}`, empresaId: Number(s.company.id) })) };
      });
      const listarPontosEnvio = onCall(options, async (request) => {
        await loja(request);
        const empresa = Number(request.data?.empresaId);
        const cidade = String(request.data?.cidade || "Guaramirim").trim();
        if (!Number.isInteger(empresa) || empresa < 1 || cidade.length < 2 || cidade.length > 100) throw new HttpsError("invalid-argument", "Transportadora ou cidade inv\xE1lida.");
        const dados = await api("shipment/agencies?" + new URLSearchParams({ company: String(empresa), country: "BR", state: "SC", city: cidade }));
        const agencias = Array.isArray(dados) ? dados : dados?.data;
        if (!Array.isArray(agencias)) throw new HttpsError("unavailable", "Lista de pontos indispon\xEDvel.");
        return { pontos: agencias.filter((a) => a.status === "available").map((a) => ({
          id: Number(a.id),
          empresaId: Number(a.company_id),
          nome: String(a.name || "").slice(0, 150),
          endereco: [a.address?.address, a.address?.number, a.address?.district, a.address?.city?.city].filter(Boolean).join(", ").slice(0, 400)
        })) };
      });
      const prepararEnvio = onCall(options, async (request) => {
        const { cfg, c, checkoutId, ref } = await compra(request);
        let payload;
        let destino;
        try {
          const via = await fetch(`https://viacep.com.br/ws/${c.cliente.endereco.cep}/json/`, { signal: AbortSignal.timeout(1e4) });
          destino = await via.json();
          if (!via.ok || destino.erro || !destino.localidade || !destino.uf) throw new Error("cep");
        } catch (_) {
          throw new HttpsError("unavailable", "N\xE3o foi poss\xEDvel confirmar o CEP de destino.");
        }
        try {
          payload = etiqueta.payload(c, cfg, { ...request.data, checkoutId, cidadeDestino: destino.localidade, ufDestino: destino.uf });
        } catch (e) {
          throw new HttpsError("invalid-argument", e.message);
        }
        const services = await api("shipment/services");
        const service = Array.isArray(services) && services.find((s) => Number(s.id) === payload.service);
        if (!service || !empresasSuportadas.test(service.company?.name || "")) throw new HttpsError("failed-precondition", "Transportadora ainda n\xE3o suportada para etiquetas nesta integra\xE7\xE3o.");
        if (!payload.options.invoice && service.company.name !== "Correios") {
          const limiteSeguro = service.company.name === "Jadlog" ? 1500 : 1e3;
          if (payload.options.insurance_value > limiteSeguro) throw new HttpsError("failed-precondition", "O valor declarado supera o limite de declara\xE7\xE3o deste servi\xE7o. Confira outra transportadora ou o documento fiscal.");
        }
        const ponto = cfg.servicosEnvio.find((s) => s.id === payload.service);
        if (ponto.agenciaId) {
          const agencia = await api("shipment/agencies/" + ponto.agenciaId);
          if (Number(agencia.company_id) !== Number(service.company.id) || agencia.status !== "available") throw new HttpsError("failed-precondition", "Ponto de postagem indispon\xEDvel para esta transportadora.");
          payload.agency = Number(ponto.agenciaId);
        }
        const seguro = payload.options.insurance_value;
        const cotacoes = await api("shipment/calculate", "POST", {
          from: { postal_code: payload.from.postal_code },
          to: { postal_code: payload.to.postal_code },
          volumes: payload.volumes.map((v) => ({ ...v, insurance: seguro })),
          services: String(payload.service),
          options: { receipt: false, own_hand: false }
        });
        const cotacao = Array.isArray(cotacoes) ? cotacoes.find((s) => Number(s.id) === payload.service && !s.error) : null;
        if (!cotacao) throw new HttpsError("failed-precondition", "Esta embalagem n\xE3o tem frete dispon\xEDvel no servi\xE7o comprado pelo cliente.");
        const custoCentavos = etiqueta.centavos(cotacao.custom_price ?? cotacao.price);
        const revisao = crypto2.randomUUID();
        await db.runTransaction(async (tx) => {
          const existente = (await tx.get(ref)).data();
          const atual = (await tx.get(db.doc("configuracoes/checkout"))).data();
          if (JSON.stringify(atual) !== JSON.stringify(cfg)) throw new HttpsError("failed-precondition", "O remetente ou as op\xE7\xF5es mudaram. Prepare o envio novamente.");
          if (existente && existente.status !== "preparado") throw new HttpsError("failed-precondition", "Envio j\xE1 iniciado. Use a consulta para continuar o mesmo envio.");
          tx.set(ref, {
            usuario: request.auth.uid,
            checkoutId,
            payload,
            ponto: String(ponto.ponto).slice(0, 500),
            custoCentavos,
            documentoFiscal: payload.options.invoice ? "nota" : "declaracao",
            dispensaNotaConfirmada: !payload.options.invoice,
            conferidoPor: request.auth.uid,
            ambiente: ambiente(),
            status: "preparado",
            revisao,
            expiraEm: Timestamp.fromMillis(Date.now() + 10 * 6e4),
            atualizadoEm: Timestamp.now()
          });
        });
        return { revisao, custoCentavos, freteRecebidoCentavos: c.entrega.precoCentavos, ponto: ponto.ponto, ambiente: ambiente() };
      });
      async function sincronizar(ref, envio) {
        if (!envio.orderId) return envio;
        if (envio.ambiente !== ambiente()) throw new HttpsError("failed-precondition", "O ambiente mudou. Confira este envio na conta onde ele foi criado.");
        const dados = await api("orders/" + envio.orderId);
        if (dados.id !== envio.orderId || dados.reminder !== "LV Maker " + envio.checkoutId || Number(dados.service_id) !== envio.payload.service || String(dados.to?.postal_code || "").replace(/\D/g, "") !== envio.payload.to.postal_code) throw new HttpsError("failed-precondition", "Etiqueta n\xE3o corresponde ao pedido.");
        const changes = {
          statusTransportadora: String(dados.status || "").slice(0, 50),
          custoAtualCentavos: etiqueta.centavos(dados.price),
          rastreio: String(dados.tracking || dados.self_tracking || "").slice(0, 100),
          pagoNoMelhorEnvio: !!dados.paid_at,
          gerado: !!dados.generated_at,
          atualizadoEm: Timestamp.now()
        };
        await ref.update(changes);
        return { ...envio, ...changes };
      }
      __name(sincronizar, "sincronizar");
      const consultarEnvio = onCall(options, async (request) => {
        const { ref } = await compra(request);
        const existente = (await ref.get()).data();
        if (!existente) return { existe: false };
        if (existente.operacao && existente.operacaoEm?.toMillis() < Date.now() - 18e4) {
          await db.runTransaction(async (tx) => {
            const atual = (await tx.get(ref)).data();
            if (atual.operacao === existente.operacao) tx.update(ref, { operacao: null, status: atual.orderId ? "conferir" : "incerto" });
          });
          existente.operacao = null;
          existente.status = existente.orderId ? "conferir" : "incerto";
        }
        const envio = await sincronizar(ref, existente);
        return {
          existe: true,
          status: envio.status,
          statusTransportadora: envio.statusTransportadora || "",
          custoCentavos: envio.custoAtualCentavos ?? envio.custoCentavos,
          ponto: envio.ponto,
          rastreio: envio.rastreio || "",
          documentoFiscal: envio.documentoFiscal || "nota",
          revisao: envio.revisao,
          ambiente: envio.ambiente,
          orderId: envio.orderId || null,
          pago: envio.pagoNoMelhorEnvio === true,
          gerado: envio.gerado === true
        };
      });
      const contratarEnvio = onCall(options, async (request) => {
        const { ref, c } = await compra(request);
        const limite = request.data?.limiteCentavos;
        if (!Number.isSafeInteger(limite) || limite < 0 || limite > 1e7 || request.data?.confirmarCompra !== true) throw new HttpsError("invalid-argument", "Confirme o custo da etiqueta antes de contratar.");
        let envio;
        const operacao = crypto2.randomUUID();
        await db.runTransaction(async (tx) => {
          envio = (await tx.get(ref)).data();
          if (!envio || envio.ambiente !== ambiente() || envio.revisao !== request.data.revisao) throw new HttpsError("failed-precondition", "Prepare e confira o envio novamente.");
          if (envio.operacao) throw new HttpsError("aborted", "Opera\xE7\xE3o j\xE1 iniciada. Consulte antes de tentar novamente.");
          if (!envio.orderId && envio.status !== "preparado") throw new HttpsError("failed-precondition", "Resposta anterior incerta. Confira a etiqueta no Melhor Envio antes de continuar.");
          if (!envio.orderId && envio.expiraEm.toMillis() < Date.now()) throw new HttpsError("failed-precondition", "A cota\xE7\xE3o expirou. Prepare novamente.");
          if ((envio.custoAtualCentavos ?? envio.custoCentavos) > limite) throw new HttpsError("failed-precondition", "O custo supera o valor que voc\xEA confirmou.");
          if (c.estoquePendente) throw new HttpsError("failed-precondition", "Estoque pendente de confer\xEAncia.");
          tx.update(ref, { operacao, operacaoEm: Timestamp.now(), status: envio.orderId ? "continuando" : "iniciando", atualizadoEm: Timestamp.now() });
        });
        try {
          if (!envio.orderId) {
            const r = await api("cart", "POST", envio.payload);
            if (!uuid(r.id)) throw new HttpsError("unavailable", "Identificador da etiqueta n\xE3o confirmado.");
            envio.orderId = r.id;
            await ref.update({ orderId: r.id, status: "carrinho" });
          }
          envio = await sincronizar(ref, envio);
          if (["canceled", "expired"].includes(envio.statusTransportadora)) throw new HttpsError("failed-precondition", "Esta etiqueta foi cancelada ou expirou. Confira no Melhor Envio.");
          if (!envio.pagoNoMelhorEnvio) {
            if (envio.custoAtualCentavos > limite) throw new HttpsError("failed-precondition", "O pre\xE7o mudou. Consulte o envio e confirme o novo custo antes de comprar.");
            await api("shipment/checkout", "POST", { orders: [envio.orderId] });
            envio = await sincronizar(ref, envio);
            if (!envio.pagoNoMelhorEnvio) throw new HttpsError("unavailable", "Pagamento da etiqueta aguardando confirma\xE7\xE3o. Consulte o envio; n\xE3o crie outro.");
          }
          if (!envio.gerado) {
            const r = await api("shipment/generate", "POST", { orders: [envio.orderId] });
            if (r[envio.orderId]?.status !== true) throw new HttpsError("unavailable", "A etiqueta ainda n\xE3o foi liberada para impress\xE3o. Consulte e continue este mesmo envio.");
          }
          await ref.update({ status: "gerado", operacao: null, gerado: true, atualizadoEm: Timestamp.now() });
          return { gerado: true, orderId: envio.orderId };
        } catch (e) {
          await ref.update({ ...envio.orderId ? { orderId: envio.orderId } : {}, status: envio.orderId ? "conferir" : "incerto", operacao: null, atualizadoEm: Timestamp.now() });
          throw e;
        }
      });
      const imprimirEnvio = onCall(options, async (request) => {
        const { ref } = await compra(request);
        const e = (await ref.get()).data();
        if (!e?.orderId) throw new HttpsError("failed-precondition", "Envio ainda n\xE3o criado.");
        const envio = await sincronizar(ref, e);
        if (!envio.gerado || ["canceled", "expired"].includes(envio.statusTransportadora)) throw new HttpsError("failed-precondition", "Etiqueta ainda n\xE3o liberada ou indispon\xEDvel.");
        const r = await api("shipment/print", "POST", { orders: [e.orderId], mode: "private" });
        if (!etiqueta.imprimirURL(r.url)) throw new HttpsError("unavailable", "Link de impress\xE3o inv\xE1lido.");
        return { url: r.url, ponto: e.ponto };
      });
      const vincularEnvio = onCall(options, async (request) => {
        const { ref } = await compra(request);
        const orderId = request.data?.orderId;
        if (!uuid(orderId)) throw new HttpsError("invalid-argument", "Identificador inv\xE1lido.");
        const e = (await ref.get()).data();
        if (!e || e.operacao || e.orderId || e.status !== "incerto") throw new HttpsError("failed-precondition", "Este envio n\xE3o precisa de recupera\xE7\xE3o ou ainda est\xE1 em andamento.");
        const confirmado = await sincronizar(ref, { ...e, orderId });
        await db.runTransaction(async (tx) => {
          const atual = (await tx.get(ref)).data();
          if (atual.operacao || atual.orderId || atual.revisao !== e.revisao) throw new HttpsError("aborted", "O envio mudou. Consulte novamente.");
          tx.update(ref, { orderId, status: confirmado.gerado ? "gerado" : "conferir", atualizadoEm: Timestamp.now() });
        });
        return { vinculado: true };
      });
      const imprimirDeclaracao = onCall(options, async (request) => {
        const { ref } = await compra(request);
        const e = (await ref.get()).data();
        if (!e?.orderId || e.documentoFiscal !== "declaracao") throw new HttpsError("failed-precondition", "Este envio n\xE3o usa declara\xE7\xE3o eletr\xF4nica.");
        const envio = await sincronizar(ref, e);
        if (!envio.gerado || ["canceled", "expired"].includes(envio.statusTransportadora)) throw new HttpsError("failed-precondition", "Envio ainda n\xE3o liberado ou indispon\xEDvel.");
        const r = await api("imprimir/dace/pdf/" + envio.orderId);
        if (!etiqueta.declaracaoURL(r.pdf)) throw new HttpsError("unavailable", "PDF da declara\xE7\xE3o ainda n\xE3o dispon\xEDvel. Confira a emiss\xE3o no Melhor Envio; n\xE3o despache somente com a etiqueta.");
        return { url: r.pdf };
      });
      return { consultarConexaoEnvio, listarPontosEnvio, prepararEnvio, consultarEnvio, contratarEnvio, imprimirEnvio, vincularEnvio, imprimirDeclaracao };
    };
  }
});

// ../index.js
var require_index = __commonJS({
  "../index.js"(exports) {
    "use strict";
    var { onCall, HttpsError } = require_https();
    var { defineSecret, defineString, defineBoolean } = require_params();
    var { initializeApp } = require_app();
    var { getFirestore, Timestamp } = require_firestore2();
    var frete = require_frete();
    initializeApp();
    var db = getFirestore();
    Object.assign(exports, require_checkout()(db));
    var tokenMelhorEnvio = defineSecret("MELHOR_ENVIO_TOKEN");
    var sandbox = defineBoolean("MELHOR_ENVIO_SANDBOX", { default: true });
    var contato = defineString("MELHOR_ENVIO_CONTATO", { default: "velosoleo@live.com" });
    Object.assign(exports, require_envios()(db, { token: tokenMelhorEnvio, sandbox, contato }));
    async function jsonSeguro(url, options = {}) {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12e3) });
      if (!response.ok) throw new Error("Servi\xE7o de entrega temporariamente indispon\xEDvel.");
      return response.json();
    }
    __name(jsonSeguro, "jsonSeguro");
    async function cotarFrete(request, consultarTransportadoras = true) {
      let itens;
      const cep = String(request.data?.cep || "").replace(/\D/g, "");
      try {
        if (!/^[0-9]{8}$/.test(cep)) throw new Error("Informe um CEP de destino com 8 d\xEDgitos.");
        itens = frete.itensSolicitados(request.data?.itens);
      } catch (erro) {
        throw new HttpsError("invalid-argument", erro.message);
      }
      const cfgDoc = await db.collection("configuracoes").doc("checkout").get();
      if (!cfgDoc.exists) throw new HttpsError("failed-precondition", "A loja ainda est\xE1 preparando as op\xE7\xF5es de entrega.");
      const config = cfgDoc.data();
      if (!/^[0-9]{8}$/.test(config.cepOrigem || "") || !config.usuario) throw new HttpsError("failed-precondition", "Configura\xE7\xE3o de envio incompleta.");
      const admin = await db.collection("admins").doc(config.usuario).get();
      if (!admin.exists) throw new HttpsError("failed-precondition", "Respons\xE1vel pela loja indispon\xEDvel.");
      const refs = itens.map((item) => db.collection("produtos").doc(item.produtoId));
      const docs = await db.getAll(...refs);
      let produtos;
      try {
        produtos = frete.produtosConferidos(itens, docs.map((doc) => doc.exists ? doc.data() : null));
      } catch (erro) {
        throw new HttpsError("failed-precondition", erro.message);
      }
      let destino;
      try {
        destino = await jsonSeguro(`https://viacep.com.br/ws/${cep}/json/`);
        if (destino.erro || !destino.localidade || !destino.uf) throw new Error("CEP n\xE3o encontrado.");
      } catch (_) {
        throw new HttpsError("unavailable", "N\xE3o foi poss\xEDvel confirmar o CEP. Confira e tente novamente.");
      }
      const opcoes = frete.opcoesProprias(config, destino);
      let aviso = "";
      if (config.transportadoraHabilitada === true && consultarTransportadoras) {
        try {
          const remetente = require_etiqueta().pessoa(config.remetente);
          if (remetente.postal_code !== config.cepOrigem) throw new Error("CEP de origem diferente do remetente.");
          const payload = {
            from: { postal_code: config.cepOrigem },
            to: { postal_code: cep },
            products: frete.produtosParaFrete(produtos),
            options: { receipt: false, own_hand: false }
          };
          const email = contato.value();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) throw new Error("Contato da integra\xE7\xE3o n\xE3o configurado.");
          const base = sandbox.value() ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
          const resposta = await jsonSeguro(base + "/api/v2/me/shipment/calculate", {
            method: "POST",
            headers: { Authorization: `Bearer ${tokenMelhorEnvio.value()}`, "Content-Type": "application/json", Accept: "application/json", "User-Agent": `LV Maker (${email})` },
            body: JSON.stringify(payload)
          });
          const habilitados = new Set((config.servicosEnvio || []).filter((s) => s.ponto?.trim()).map((s) => s.id));
          opcoes.push(...frete.opcoesTransportadoras(resposta).filter((o) => habilitados.has(o.servicoId)));
        } catch (_) {
          aviso = "Envio por transportadora indispon\xEDvel agora. A loja precisa conferir as medidas ou a conex\xE3o de frete.";
        }
      }
      if (!opcoes.length) throw new HttpsError("failed-precondition", aviso || "Ainda n\xE3o h\xE1 uma op\xE7\xE3o de entrega configurada para este CEP.");
      const subtotalCentavos = produtos.reduce((total, p) => total + p.precoCentavos * p.qtd, 0);
      if (!Number.isSafeInteger(subtotalCentavos) || subtotalCentavos <= 0 || subtotalCentavos > 1e7) throw new HttpsError("failed-precondition", "Valor do carrinho inv\xE1lido.");
      const ref = db.collection("cotacoesFrete").doc();
      const ambiente = consultarTransportadoras && config.transportadoraHabilitada && sandbox.value() ? "sandbox" : "producao";
      const expiraEm = Timestamp.fromMillis(Date.now() + 15 * 60 * 1e3);
      await ref.set({
        usuario: config.usuario,
        cep,
        itens: produtos,
        opcoes,
        subtotalCentavos,
        destino: { bairro: destino.bairro || "", localidade: destino.localidade, uf: destino.uf },
        criadoEm: Timestamp.now(),
        expiraEm,
        ambiente
      });
      return {
        cotacaoId: ref.id,
        expiraEm: expiraEm.toMillis(),
        subtotalCentavos,
        opcoes,
        aviso,
        cidade: destino.localidade,
        uf: destino.uf,
        rua: destino.logradouro || "",
        bairro: destino.bairro || "",
        prazoProducaoDias: config.prazoProducaoDias ?? null,
        ambiente
      };
    }
    __name(cotarFrete, "cotarFrete");
    var opcoesCotacao = { region: "southamerica-east1", enforceAppCheck: true, maxInstances: 3, concurrency: 10, timeoutSeconds: 40 };
    exports.cotarFrete = onCall({ ...opcoesCotacao, secrets: [tokenMelhorEnvio] }, (request) => cotarFrete(request));
    exports.cotarEntregaLocal = onCall(opcoesCotacao, (request) => cotarFrete(request, false));
  }
});

// auth.cjs
var require_auth = __commonJS({
  "auth.cjs"(exports, module) {
    "use strict";
    var jwksCache = /* @__PURE__ */ new Map();
    var keyCache = /* @__PURE__ */ new Map();
    async function verifyJWT(token, config, request = fetch) {
      if (typeof token !== "string" || token.length > 12e3) throw new Error("Token inv\xE1lido.");
      const parts = token.split(".");
      if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw new Error("Token inv\xE1lido.");
      let header, claims;
      try {
        header = JSON.parse(Buffer.from(parts[0], "base64url"));
        claims = JSON.parse(Buffer.from(parts[1], "base64url"));
      } catch (_) {
        throw new Error("Token inv\xE1lido.");
      }
      const now = Math.floor(Date.now() / 1e3);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (header.alg !== "RS256" || header.typ !== "JWT" || typeof header.kid !== "string" || header.kid.length > 150 || claims.iss !== config.issuer || !audiences.includes(config.audience) || !Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.iat) || claims.iat > now + 30 || claims.nbf !== void 0 && (!Number.isInteger(claims.nbf) || claims.nbf > now + 30) || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 || config.subject && claims.sub !== config.subject) throw new Error("Token inv\xE1lido.");
      let cache = jwksCache.get(config.jwksURL);
      if (!cache || cache.expires <= Date.now()) {
        const r = await request(config.jwksURL, { signal: AbortSignal.timeout(1e4) });
        if (!r.ok) throw new Error("Verifica\xE7\xE3o temporariamente indispon\xEDvel.");
        const data = await r.json();
        if (!Array.isArray(data.keys)) throw new Error("Verifica\xE7\xE3o temporariamente indispon\xEDvel.");
        const age = Math.min(21600, Number((r.headers.get("cache-control") || "").match(/max-age=(\d+)/)?.[1] || 300));
        cache = { keys: data.keys, expires: Date.now() + age * 1e3 };
        jwksCache.set(config.jwksURL, cache);
        keyCache.clear();
      }
      const jwk = cache.keys.find((k) => k.kid === header.kid && k.kty === "RSA");
      if (!jwk) throw new Error("Token inv\xE1lido.");
      const keyId = config.jwksURL + ":" + header.kid;
      let key = keyCache.get(keyId);
      if (!key) {
        key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
        keyCache.set(keyId, key);
      }
      const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(parts[2], "base64url"), new TextEncoder().encode(parts[0] + "." + parts[1]));
      if (!verified) throw new Error("Token inv\xE1lido.");
      return claims;
    }
    __name(verifyJWT, "verifyJWT");
    async function verifyRequest(request, env) {
      const app = await verifyJWT(request.headers.get("x-firebase-appcheck"), {
        issuer: "https://firebaseappcheck.googleapis.com/" + env.FIREBASE_PROJECT_NUMBER,
        audience: "projects/" + env.FIREBASE_PROJECT_NUMBER,
        subject: env.FIREBASE_APP_ID,
        jwksURL: "https://firebaseappcheck.googleapis.com/v1/jwks"
      });
      const header = request.headers.get("authorization");
      let auth;
      if (header) {
        if (!header.startsWith("Bearer ")) throw new Error("Token inv\xE1lido.");
        const token = await verifyJWT(header.slice(7), {
          issuer: "https://securetoken.google.com/" + env.FIREBASE_PROJECT_ID,
          audience: env.FIREBASE_PROJECT_ID,
          jwksURL: "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
        });
        if (!Number.isInteger(token.auth_time) || token.auth_time > Math.floor(Date.now() / 1e3) + 30) throw new Error("Token inv\xE1lido.");
        auth = { uid: token.sub, token };
      }
      return { app: { appId: app.sub }, ...auth ? { auth } : {} };
    }
    __name(verifyRequest, "verifyRequest");
    module.exports = { verifyJWT, verifyRequest };
  }
});

// worker.mjs
var import__ = __toESM(require_index(), 1);
var import_context = __toESM(require_context(), 1);
var import_auth = __toESM(require_auth(), 1);
var codes = { "invalid-argument": 400, "failed-precondition": 400, "already-exists": 409, "not-found": 404, "permission-denied": 403, "unauthenticated": 401, "resource-exhausted": 429, aborted: 409, unavailable: 503, internal: 500 };
var json = /* @__PURE__ */ __name((data, status, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } }), "json");
async function bodyJSON(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.byteLength;
      if (size > 65536) throw new Error("too-large");
      chunks.push(r.value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {
    });
    throw e;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
__name(bodyJSON, "bodyJSON");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, provider: "cloudflare", ready: !!env.FIREBASE_SERVICE_ACCOUNT, shippingReady: !!env.MELHOR_ENVIO_TOKEN }, 200);
    const webhook = url.pathname === "/api/infinitepay";
    const name = url.pathname.match(/^\/rpc\/([a-zA-Z][a-zA-Z0-9]{0,70})$/)?.[1];
    if (!webhook && (!name || !import__.default[name]?.callable)) return json({ error: { status: "NOT_FOUND", message: "Recurso n\xE3o encontrado." } }, 404);
    const origin = request.headers.get("origin");
    const allowed = [env.CHECKOUT_SITE_URL, "https://lv-maker.firebaseapp.com"];
    if (origin && !allowed.includes(origin)) return json({ error: { status: "PERMISSION_DENIED", message: "Origem n\xE3o autorizada." } }, 403);
    const cors = origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
    if (request.method === "OPTIONS" && !webhook) return new Response(null, { status: 204, headers: {
      ...cors,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Firebase-AppCheck,Firebase-Instance-ID-Token",
      "Access-Control-Max-Age": "600"
    } });
    if (request.method !== "POST") return json({ error: { status: "INVALID_ARGUMENT", message: "M\xE9todo inv\xE1lido." } }, 405, cors);
    if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) return json({ error: { status: "INVALID_ARGUMENT", message: "Formato inv\xE1lido." } }, 400, cors);
    return import_context.default.scope.run(env, async () => {
      try {
        const body = await bodyJSON(request);
        if (webhook) {
          let status = 200, result = "", headers = { ...cors, "Cache-Control": "no-store" };
          const res = { set(key, value) {
            headers[key] = value;
            return this;
          }, status(code) {
            status = code;
            return this;
          }, send(value) {
            result = value;
            return this;
          } };
          await import__.default.webhookInfinitepay({ method: request.method, body, query: Object.fromEntries(url.searchParams) }, res);
          return new Response(result, { status, headers });
        }
        let identity;
        try {
          identity = await import_auth.default.verifyRequest(request, env);
        } catch (_) {
          return json({ error: { status: "UNAUTHENTICATED", message: "N\xE3o foi poss\xEDvel validar seu acesso. Recarregue a p\xE1gina." } }, 401, cors);
        }
        if (!body || typeof body !== "object" || Array.isArray(body) || !Object.hasOwn(body, "data") || Object.keys(body).some((k) => k !== "data")) return json({ error: { status: "INVALID_ARGUMENT", message: "Solicita\xE7\xE3o inv\xE1lida." } }, 400, cors);
        const rawRequest = { ip: request.headers.get("cf-connecting-ip") || "desconhecido" };
        const data = await import__.default[name]({ ...identity, data: body.data, rawRequest });
        return json({ result: data }, 200, cors);
      } catch (e) {
        const code = Object.hasOwn(codes, e.code) ? e.code : "internal";
        return json({ error: {
          status: code.toUpperCase().replace(/-/g, "_"),
          message: code === "internal" ? "A integra\xE7\xE3o n\xE3o confirmou a opera\xE7\xE3o. Consulte antes de repetir." : e.message,
          ...code !== "internal" && e.details ? { details: e.details } : {}
        } }, codes[code], cors);
      }
    });
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
