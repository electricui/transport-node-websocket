import sinon from 'sinon'
import chai from 'chai'
import chaiSubset from 'chai-subset'
import chaiAsPromised from 'chai-as-promised'
chai.use(chaiSubset)
chai.use(chaiAsPromised)

const assert = chai.assert

import WebSocket from 'isomorphic-ws'

import WebSocketTransport from '../src/transport'
import WebSocketDiscovery from '../src/discovery'

import {
  BinaryProtocolDecoder,
  BinaryProtocolEncoder
} from '@electricui/protocol-binary'

import {
  TypeTransform,
  defaultDecoderList,
  defaultEncoderList
} from '@electricui/protocol-type-transforms'

// setup for the test

const typeCache = {}

const wsFactory = options => {
  // setup the ws transport, binary encoder and decoder

  const wsTransport = new WebSocketTransport(options)
  const wsDecoder = new BinaryProtocolDecoder({ typeCache })
  const wsEncoder = new BinaryProtocolEncoder()

  // pipe the typeCache from the decoder above into the type encoder below
  const wsTypeDecoder = new TypeTransform()
  const wsTypeEncoder = new TypeTransform({ typeCache })

  // setup the type transforms to use the default type ID <-> binary formats
  wsTypeDecoder.use(defaultDecoderList)
  wsTypeEncoder.use(defaultEncoderList)

  // the interfaces we use to read and write to ws
  const wsReadInterface = wsTransport.interface
    .pipe(wsDecoder)
    .pipe(wsTypeDecoder)

  //
  const wsWriteInterface = wsTypeEncoder
  wsTypeEncoder.pipe(wsEncoder).pipe(wsTransport.interface)

  return {
    // the transport handles connecting and disconnecting to individual devices
    transport: wsTransport,

    // these read and write interfaces allow for communication with the device
    readInterface: wsReadInterface,
    writeInterface: wsWriteInterface
  }
}

const wsConfiguration = {
  WebSocket
}

// the tests

describe('Websocket Discovery', () => {
  it('throws when provided with no options', () => {
    assert.throws(() => {
      new WebSocketTransport()
    })
  })

  it('throws when provided with empty options', () => {
    assert.throws(() => {
      new WebSocketTransport({})
    })
  })

  it('finds a wifi device', done => {
    const transport = new WebSocketDiscovery({
      factory: wsFactory,
      configuration: wsConfiguration,
      WebSocket
    })

    const spy = sinon.spy()

    let doneness = false

    const callback = object => {
      spy(object)

      console.log(object)

      // this is a bit dumb
      assert.isTrue(spy.called)

      // just because we might get more than one callback
      if (!doneness) {
        done()
        doneness = true
      }
    }

    const isConnected = (transportKey, connectionOptions) => {
      return false
    }

    const setConnected = (transportKey, connectionOptions) => {}

    transport.discover(callback, isConnected, setConnected)
  }).timeout(5000)
})
