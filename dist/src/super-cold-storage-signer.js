'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.SuperColdStorageSigner = void 0;
const abstract_signer_1 = require('@ethersproject/abstract-signer');
const address_1 = require('@ethersproject/address');
const bignumber_1 = require('@ethersproject/bignumber');
const bytes_1 = require('@ethersproject/bytes');
const properties_1 = require('@ethersproject/properties');
const strings_1 = require('@ethersproject/strings');
const transactions_1 = require('@ethersproject/transactions');
const http = __importStar(require('node:https'));
var HttpMethod;
(function (HttpMethod) {
  HttpMethod['GET'] = 'GET';
  HttpMethod['PUT'] = 'PUT';
  HttpMethod['POST'] = 'POST';
  HttpMethod['PATCH'] = 'PATCH';
  HttpMethod['DELETE'] = 'DELETE';
})(HttpMethod || (HttpMethod = {}));
class SuperColdStorageSigner extends abstract_signer_1.Signer {
  constructor(address, endpoint, authorization, provider, ca) {
    super();
    (0, properties_1.defineReadOnly)(this, 'address', address);
    (0, properties_1.defineReadOnly)(this, 'endpoint', new URL(endpoint));
    (0, properties_1.defineReadOnly)(this, 'authorization', authorization);
    (0, properties_1.defineReadOnly)(this, 'provider', provider);
    if (ca) {
      (0, properties_1.defineReadOnly)(this, 'ca', ca);
    }
  }
  connect(provider) {
    return new SuperColdStorageSigner(this.address, this.endpoint.toString(), this.authorization, provider, this.ca);
  }
  async getAddress() {
    return (0, address_1.getAddress)(await this._label());
  }
  async signMessage(message) {
    if (typeof message === 'string') {
      message = (0, strings_1.toUtf8Bytes)(message);
    }
    const messageHex = (0, bytes_1.hexlify)(message, { allowMissingPrefix: true, hexPad: 'left' }).slice(2);
    return (0, bytes_1.joinSignature)(await this._sign(messageHex, true));
  }
  async signTransaction(transaction) {
    const tx = await (0, properties_1.resolveProperties)(transaction);
    const baseTx = {
      chainId: tx.chainId || undefined,
      data: tx.data || undefined,
      gasLimit: tx.gasLimit || undefined,
      gasPrice: tx.gasPrice || undefined,
      nonce: tx.nonce ? bignumber_1.BigNumber.from(tx.nonce).toNumber() : undefined,
      to: tx.to || undefined,
      value: tx.value || undefined,
    };
    const unsignedTx = (0, transactions_1.serialize)(baseTx).slice(2);
    return (0, transactions_1.serialize)(baseTx, await this._sign(unsignedTx));
  }
  async _sign(unsignedTx, isMessage = false) {
    const result = await this._request(isMessage ? 'signMessage' : 'signTransaction', HttpMethod.POST, {
      message: unsignedTx,
    });
    if (Object.keys(result).includes('signature')) {
      return result.signature;
    }
    throw new Error(`Could not get signature: ${JSON.stringify(result)}`);
    /*
        return {
          r: '0x0000000000000000000000000000000000000000000000000000000000000000',
          s: '0x0000000000000000000000000000000000000000000000000000000000000000',
          v: 0,
        } as SignatureLike
    */
  }
  async _label() {
    const result = await this._request('getLabel', HttpMethod.GET);
    if (Object.keys(result).includes('label')) {
      return result.label;
    }
    throw new Error(`Could not get label: ${JSON.stringify(result)}`);
    /*
        return '0x0000000000000000000000000000000000000000'
    */
  }
  async _request(path, method, payload) {
    const requestOptions = {
      hostname: this.endpoint.hostname,
      method: HttpMethod[method],
      path: '/' + this.address + '/' + path,
      port: this.endpoint.port === '' ? 443 : Number.parseInt(this.endpoint.port, 10),
      headers: {
        Accept: 'application/json;odata=verbose',
        Authorization: this.authorization,
        'Content-Type': 'application/json;odata=verbose',
      },
      ca: this.ca,
      timeout: 5 * 1000, // n seconds
      // TLS options below
      // secureProtocol: 'TLSv1_method',
    };
    return this._send(requestOptions, payload);
  }
  async _send(options, data) {
    let result = '';
    const promise = new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        res.on('data', (chunk) => {
          result += chunk;
        });
        res.on('error', (err) => {
          console.log(err);
          reject(err);
        });
        res.on('end', () => {
          try {
            let body = result;
            // there are empty responses
            if (res.statusCode === 200) {
              body = JSON.parse(result);
            }
            resolve(body);
          } catch (error) {
            console.log(error);
            reject(error);
          }
        });
      });
      /***
       * handles the errors on the request
       */
      req.on('error', (err) => {
        console.log(err);
        reject(err);
      });
      /***
       * handles the timeout error
       */
      req.on('timeout', (err) => {
        console.log(err);
        req.abort();
      });
      /***
       * unhandle errors on the request
       */
      req.on('uncaughtException', (err) => {
        console.log(err);
        req.abort();
      });
      /**
       * adds the payload/body
       */
      if (data) {
        const body = typeof data === 'string' ? data : JSON.stringify(data);
        req.write(body);
      }
      /**
       * end the request to prevent ECONNRESETand socket hung errors
       */
      req.end(() => {});
    });
    return promise;
  }
}
exports.SuperColdStorageSigner = SuperColdStorageSigner;
//# sourceMappingURL=super-cold-storage-signer.js.map
