import * as Stream from 'stream'

import { Sink, Transport } from '@electricui/core'

const dTransport = require('debug')(
  'electricui-transport-node-websocket:transport',
)

/*
export interface IWebSocket {
  new (uri: string, options: WebSocket.OpenOptions): WebSocket
}
*/

export interface WebSocketTransportOptions {
  uri: string
  WebSocket: any
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
  websocket: any | null
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

  error(err: Error) {
    this.onError(err)
  }

  close(err: Error) {
    this.onClose(err)
  }

  receiveData(chunk: any) {
    dTransport('received raw websocket data', chunk)

    return this.readPipeline.push(chunk)
  }

  connect() {
    return new Promise((resolve, reject) => {
      const { WebSocket, uri } = this.options

      this.websocket = new WebSocket(uri)
      this.websocket.binaryType = 'nodebuffer'

      const onConnectionError = (err: Error) => {
        reject(err)
      }

      dTransport('client: connecting...')

      this.websocket.on('error', onConnectionError)

      this.websocket.once('open', () => {
        dTransport('client: ... connection open')

        this.websocket.removeEventListener('error', onConnectionError)

        this.websocket.on('error', this.error)
        this.websocket.on('message', this.receiveData)
        this.websocket.on('close', this.close)

        resolve()
      })
    })
  }

  disconnect() {
    if (this.websocket) {
      return new Promise((resolve, reject) => {
        // TODO: this isn't really async?

        this.websocket.removeEventListener('error', this.error)
        this.websocket.removeEventListener('message', this.receiveData)
        this.websocket.removeEventListener('close', this.close)
        this.websocket.close()
        this.websocket = null
        resolve()
      })
    }
    return Promise.resolve()
  }

  writeToDevice(chunk: any) {
    dTransport('writing raw websocket data', chunk)

    return new Promise((resolve, reject) => {
      if (!this.websocket) {
        console.log(this.websocket)
        reject(new Error('not connected'))
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
