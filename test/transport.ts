import 'mocha'

import * as chai from 'chai'
import * as portfinder from 'portfinder'
import * as sinon from 'sinon'

import {
  Connection,
  ConnectionInterface,
  DeliverabilityManagerDumb,
  QueryManagerNone,
  Sink,
  Source,
} from '@electricui/core'

import WebSocketTransport from '../src/transport'

const dTest = require('debug')('electricui-transport-node-websocket:tests')

const WebSocket = require('ws')

const assert = chai.assert

const portPath = 'http://127.0.0.1'

const options = {
  baudRate: 115200,
  WebSocket: WebSocket,
}

const factory = (options: any) => {
  const connectionInterface = new ConnectionInterface()

  // we need to create a connection and it'll auto-attach to the interface above
  new Connection({ connectionInterface })

  const transport = new WebSocketTransport(
    Object.assign({}, options, {
      // assign the URI based on the current ephemeral port
      uri: `${portPath}:${currentPort}/`,
    }),
  )

  connectionInterface.setTransport(transport)

  const writePipeline = <Sink>transport.writePipeline

  const source = new Source()
  source.pipe(writePipeline)

  const queryManager = new QueryManagerNone(connectionInterface)
  const deliverabilityManager = new DeliverabilityManagerDumb(
    connectionInterface,
  )

  connectionInterface.setQueryManager(queryManager)
  connectionInterface.setDeliverabilityManager(deliverabilityManager)

  connectionInterface.finalise()

  // create our spy
  const spy = sinon.spy()

  // observe any incoming
  const observable = connectionInterface.connection!.createObservable(
    () => true,
  )

  observable.subscribe(chunk => {
    spy(chunk)
  })

  return {
    source,
    transport,
    spy,
  }
}

let currentPort: number
let mockServer: any
let lastMessageReceived: any

describe('Node WebSocket Transport', () => {
  beforeEach(async () => {
    currentPort = await portfinder.getPortPromise()

    mockServer = new WebSocket.Server({ port: currentPort })

    mockServer.on('connection', (client: any) => {
      dTest('server: client connected')

      client.on('message', (message: any) => {
        dTest('server: received: %s', message)

        lastMessageReceived = message

        client.send(message)
      })
    })

    mockServer.on('error', (err: Error) => {
      dTest('server: error', err)
    })

    return new Promise((resolve, reject) => {
      mockServer.on('listening', () => {
        // ready to accept connections
        dTest('server: listening...')
        resolve()
      })

      mockServer.on('error', (err: Error) => {
        // ready to accept connections
        dTest('server: error', err)
        reject(err)
      })
    })
  })

  afterEach(function(done) {
    // tear down the WS server
    mockServer.close(done)
  })

  it('Can connect and write', async () => {
    const { source, transport, spy } = factory(options)

    const chunk = Buffer.from('test')

    await transport.connect()
    await source.push(chunk)

    await new Promise((resolve, re) => setTimeout(resolve, 10))

    await transport.disconnect()

    assert.deepEqual(chunk, lastMessageReceived)
  })

  it('Can connect and write and receive', async () => {
    const { source, transport, spy } = factory(options)

    const chunk = Buffer.from('test')

    await transport.connect()
    await new Promise((resolve, re) => setTimeout(resolve, 10))

    await source.push(chunk)

    await new Promise((resolve, re) => setTimeout(resolve, 10))

    await transport.disconnect()

    assert.isTrue(spy.called)
  })
})
