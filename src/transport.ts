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
    super(options)

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
    this.onClose(new Error(event.reason))
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

  connect() {
    return new Promise((resolve, reject) => {
      const { WebSocket, uri } = this.options

      this.websocket = new WebSocket(uri)
      this.websocket.binaryType = 'nodebuffer'

      const onConnectionError = (event: WebSocket.ErrorEvent) => {
        reject(event.error)
      }

      dTransport('client: connecting...')

      this.websocket.on('error', onConnectionError)

      this.websocket.once('open', () => {
        dTransport('client: ... connection open')

        if (this.websocket) {
          this.websocket.removeListener('error', onConnectionError)

          this.websocket.on('error', this.error)
          this.websocket.on('message', this.receiveData)
          this.websocket.on('close', this.close)
        }

        resolve()
      })
    })
  }

  disconnect() {
    return new Promise((resolve, reject) => {
      if (this.websocket) {
        // TODO: this isn't really async?

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
