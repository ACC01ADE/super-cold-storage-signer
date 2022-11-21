import { Provider } from '@ethersproject/abstract-provider';
import { Signer } from '@ethersproject/abstract-signer';
import { getAddress as sanitizeAddress } from '@ethersproject/address';
import { BigNumber } from '@ethersproject/bignumber';
import { Bytes, hexlify, joinSignature, SignatureLike } from '@ethersproject/bytes';
import { defineReadOnly, resolveProperties } from '@ethersproject/properties';
import { TransactionRequest } from '@ethersproject/providers';
import { toUtf8Bytes } from '@ethersproject/strings';
import { serialize as serializeTransaction, UnsignedTransaction } from '@ethersproject/transactions';

import { ClientRequest } from 'node:http';
import { RequestOptions } from 'node:https';
import * as http from 'node:https';

enum HttpMethod {
  GET = 'GET',
  PUT = 'PUT',
  POST = 'POST',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export class SuperColdStorageSigner extends Signer {
  readonly endpoint!: URL;
  readonly authorization!: string;
  readonly ca?: string;

  constructor(endpoint: string, authorization: string, provider?: Provider, ca?: string) {
    super();
    defineReadOnly(this, 'endpoint', new URL(endpoint));
    defineReadOnly(this, 'authorization', authorization);
    defineReadOnly(this, 'provider', provider);
    if (ca) {
      defineReadOnly(this, 'ca', ca);
    }
  }

  connect(provider: Provider): SuperColdStorageSigner {
    return new SuperColdStorageSigner(this.endpoint.toString(), this.authorization, provider, this.ca);
  }

  async getAddress(): Promise<string> {
    return sanitizeAddress(await this._label());
  }

  async signMessage(message: Bytes | string): Promise<string> {
    if (typeof message === 'string') {
      message = toUtf8Bytes(message);
    }

    const messageHex: string = hexlify(message).slice(2);
    return joinSignature(await this._sign(messageHex, true));
  }

  async signTransaction(transaction: TransactionRequest): Promise<string> {
    const tx: TransactionRequest = await resolveProperties<TransactionRequest>(transaction);
    const baseTx: UnsignedTransaction = {
      chainId: tx.chainId || undefined,
      data: tx.data || undefined,
      gasLimit: tx.gasLimit || undefined,
      gasPrice: tx.gasPrice || undefined,
      nonce: tx.nonce ? BigNumber.from(tx.nonce).toNumber() : undefined,
      to: tx.to || undefined,
      value: tx.value || undefined,
    };
    const unsignedTx: string = serializeTransaction(baseTx).slice(2);
    return serializeTransaction(baseTx, await this._sign(unsignedTx));
  }

  private async _sign(unsignedTx: string, isMessage = false): Promise<SignatureLike> {
    const result: Record<string, unknown> = await this._request(
      isMessage ? 'signMessage' : 'signTransaction',
      HttpMethod.POST,
      unsignedTx
    );
    if ('signature' in result) {
      return result.signature as SignatureLike;
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

  private async _label(): Promise<string> {
    const result: Record<string, unknown> = await this._request('getLabel', HttpMethod.GET);
    if ('label' in result) {
      return result.laber as string;
    }

    throw new Error(`Could not get label: ${JSON.stringify(result)}`);

    /*
    return '0x0000000000000000000000000000000000000000'
*/
  }

  private async _request(path: string, method: HttpMethod, payload?: string | Record<string, unknown>): Promise<any> {
    const requestOptions: RequestOptions = {
      hostname: this.endpoint.hostname,
      method: HttpMethod[method],
      path,
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

  private async _send(options: RequestOptions, data?: string | Record<string, unknown>): Promise<any> {
    let result = '';
    const promise = new Promise((resolve, reject) => {
      const req: ClientRequest = http.request(options, (res) => {
        console.log('statusCode:', res.statusCode);
        console.log('headers:', res.headers);
        res.on('data', (chunk) => {
          result += chunk;
        });
        res.on('error', (err: any) => {
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

            console.log(res.statusCode, result);
            resolve(body);
          } catch (error: any) {
            console.log(error);
            reject(error);
          }
        });
      });
      /***
       * handles the errors on the request
       */
      req.on('error', (err: any) => {
        console.log(err);
        reject(err);
      });
      /***
       * handles the timeout error
       */
      req.on('timeout', (err: any) => {
        console.log(err);
        req.abort();
      });
      /***
       * unhandle errors on the request
       */
      req.on('uncaughtException', (err: any) => {
        console.log(err);
        req.abort();
      });
      /**
       * adds the payload/body
       */
      if (data) {
        const body: string = typeof data === 'string' ? (data as string) : JSON.stringify(data);
        req.write(body);
      }

      /**
       * end the request to prevent ECONNRESETand socket hung errors
       */
      req.end(() => {
        console.log('request ends');
      });
    });
    return promise;
  }
}
