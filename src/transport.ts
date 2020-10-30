import {} from '@electricui/build-rollup-config'

import { CancellationToken, Sink, Transport } from '@electricui/core'

import WebSocket from 'ws'
import debug from 'debug'

const dTransport = debug('electricui-transport-node-websocket:transport')

export const WEBSOCKETS_TRANSPORT_KEY = 'websockets'

export interface WebSocketTransportOptions {
  uri: string
  WebSocket: typeof WebSocket
  writeOptions?: {
    compress: boolean
  }
}

class WebSocketWriteSink extends Sink {
  callback: (chunk: any) => Promise<any>

  constructor(callback: (chunk: any) => Promise<any>) {
    super()
    this.callback = callback
  }

  receive(chunk: any) {
    return this.callback(chunk)
  }
}

export default class WebSocketTransport extends Transport {
  websocket: WebSocket | null
  options: WebSocketTransportOptions

  constructor(options: WebSocketTransportOptions) {
    super()

    this.options = options

    // this has to be bound before passed to the websocketwrite sink otherwise the reference will refer to the class function
    this.writeToDevice = this.writeToDevice.bind(this)

    this.writePipeline = new WebSocketWriteSink(this.writeToDevice)

    this.receiveData = this.receiveData.bind(this)
    this.error = this.error.bind(this)
    this.close = this.close.bind(this)
    this.websocket = null
  }

  error(event: WebSocket.ErrorEvent) {
    this.onError(event.error)
  }

  close(event: WebSocket.CloseEvent) {
    if (event.reason) {
      this.onClose(new Error(event.reason))
    } else {
      this.onClose(null)
    }
  }

  receiveData(chunk: string | Buffer) {
    dTransport('received raw websocket data', chunk)
    // Convert any string packets to buffers

    if (__DEV__) {
      if (typeof chunk === 'string') {
        console.info(
          'Received string message over websockets transport:',
          chunk,
        )
      }
    }

    // This is a bit meaningless since nothing should fail now.
    const cancellationToken = new CancellationToken()

    this.readPipeline
      .push(Buffer.from(chunk), cancellationToken)
      .catch(reason => {
        console.warn("Websocket transport couldn't receive a message", reason)
      })
  }

  connect(cancellationToken: CancellationToken) {
    return new Promise((resolve, reject) => {
      dTransport('client: connecting...')

      const { WebSocket, uri } = this.options

      this.websocket = new WebSocket(uri)
      this.websocket.binaryType = 'nodebuffer'

      // If we error during connection, reject
      const onConnectionError = (event: WebSocket.ErrorEvent) => {
        reject(event.error)
      }
      this.websocket.once('error', onConnectionError)

      cancellationToken.subscribe(token => {
        // If it cancels, reject with a cancellation immediately
        reject(token)

        // Terminate the connection

        // This will send an error to the onConnectionError handler, but
        // we will have already cancelled the attempt with the token above.
        this.websocket?.terminate()
      })

      // Once opened, resolve the promise and cleanup the cancellationToken handlers
      this.websocket.once('open', () => {
        dTransport('client: ... connection open')

        if (!this.websocket) {
          reject(new Error('WS Connection opened but reference was null'))
          return
        }

        this.websocket.removeListener('error', onConnectionError)

        this.websocket.on('error', this.error)
        this.websocket.on('message', this.receiveData)
        this.websocket.on('close', this.close)

        cancellationToken.cleanup()
        resolve()
      })
    })
  }

  disconnect(cancellationToken: CancellationToken) {
    return new Promise((resolve, reject) => {
      if (this.websocket) {
        this.websocket.removeListener('error', this.error)
        this.websocket.removeListener('message', this.receiveData)
        this.websocket.removeListener('close', this.close)
        this.websocket.close()
        this.websocket = null
      }
      resolve()
    })
  }

  writeToDevice(chunk: Buffer) {
    dTransport('writing raw websocket data', chunk)

    return new Promise((resolve, reject) => {
      if (!this.websocket) {
        reject(new Error('not connected'))
        return
      }

      this.websocket.send(chunk, (err: Error) => {
        if (err) {
          reject(err)
          return
        } else {
          resolve()
        }
      })
    })
  }
}
