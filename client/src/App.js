import React, { useState, Component } from 'react'
import styled from 'styled-components'
import Peer from 'simple-peer'
import * as openpgp from 'openpgp'
import SocketContext from './SocketContext'

const defaultUser = { name: 'Jon Smith', email: 'jon@example.com' }
const defaultECCCurve = 'ed25519'
const defaultPassphrase = 'ThisNeedsToBeChanged'

const Background = styled.div`
  position: fixed;
  overflow: auto;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #ccdfff;
`

const Container = styled.div`
  padding: 20px;
`

const Topbar = styled.div`
  text-align: center;
`

const Title = styled.div`
  font-size: 3rem;
`

const FormContainer = styled.div`
  display: flex;
`

const keygen = async () => {
  const result = await openpgp.generateKey({
    userIds: [defaultUser],
    curve: defaultECCCurve,
    passphrase: defaultPassphrase
  })

  return result
}

const decodeIncomingData = (data) => {
  if (typeof data === 'string') {
    return data
  } else {
    return new TextDecoder('utf-8').decode(data)
  }
}

const JoiningRoom = () => {
  return <div>Joining room</div>
}

const RoomForm = ({ handleCreateRoom, handleJoinRoom }) => {
  const [createRoomName, setCreateRoomName] = useState('')
  const [joinRoomName, setJoinRoomName] = useState('')
  const [userName, setUserName] = useState('')

  const handleSubmitCreateRoom = (event) => {
    event.preventDefault()
    handleCreateRoom(createRoomName, userName)
  }

  const handleSubmitJoinRoom = (event) => {
    event.preventDefault()
    handleJoinRoom(joinRoomName, userName)
  }

  return (
    <FormContainer>
      <div>
        <div>
          USER NAME
        </div>
        <input onChange={(e) => setUserName(e.target.value)} />
      </div>
      <div>
        <div>
          CREATE ROOM
        </div>
        <form onSubmit={(e) => handleSubmitCreateRoom(e)}>
          <input onChange={(e) => setCreateRoomName(e.target.value)} />
        </form>
      </div>
      <div>
        <div>
          JOIN ROOM
        </div>
        <form onSubmit={(e) => handleSubmitJoinRoom(e)}>
          <input onChange={(e) => setJoinRoomName(e.target.value)} />
        </form>
      </div>
    </FormContainer>
  )
}

const ChatBox = ({ chats, handleSendChat }) => {
  const [chatText, setChatText] = useState('')

  const handleSubmitChat = (event) => {
    event.preventDefault()
    handleSendChat(chatText)
    setChatText('')
  }

  return (
    <div>
      {chats.map((chat, i) => (
        <div key={i}>
          <hr />
          <div style={{ display: 'inline-block' }}>
            <ChatText chat={chat}/>
          </div>
        </div>
      ))}
      <form onSubmit={(e) => handleSubmitChat(e)}>
        <input value={chatText} onChange={(e) => setChatText(e.target.value)} />
      </form>
    </div>
  )
}

const ChatText = ({ chat }) => {
  const { type, from: chatFrom, text, name } = chat

  switch (type) {
    case 'introduction':
      return <div>{name} joined!</div>
    case 'chat':
      return <div>{chatFrom}: {text}</div>
    default: return <div />
  }
}

  // creator -> socket 'create-room'
  // server -> creator -> socket 'room-created' or 'failed-create'

  // joiner -> socket 'join-room'
  // server -> joiner -> socket 'present-list'
  // server -> present(s) -> socket 'user-joining'

  // everyone in room -> socket 'offer'
  // 'offer' -> joiner
  // joiner 'offer' into 'answer' -> present

  // connected

  // everyone creates and send new public keys per person
  // everyone sets them for the incoming person

class App extends Component {
  state = {
    state: 'start',
    peers: [],
    chats: [],
    roomId: '',
    userId: '',
    userName: ''
  }

  // given a peer id, do something to a peer
  setPeerState = (peerId, callback, completeCallback = () => {}) => {
    const newPeers = this.state.peers.map(p => {
      if (p.id === peerId) {
        return callback(p)
      }

      return p
    })

    this.setState({ peers: newPeers }, completeCallback)
  }

  onSendChat = async ({ text, type = 'chat' }) => {
    const message = { type }
    if (type === 'chat') {
      message.text = text
    } else if (type === 'introduction') {
      message.name = this.state.userName
    }

    this.setState({ chats: [...this.state.chats, { ...message, from: this.state.userName }] })

    this.state.peers.map(async p => {
      if (!p.peerPublicKey) {
        throw new Error('Should not be sending message to someone we have no public key for.')
      }

      const { data: encrypted } = await openpgp.encrypt({
        message: openpgp.message.fromText(JSON.stringify(message)),
        publicKeys: (await openpgp.key.readArmored(p.peerPublicKey)).keys
      })

      p.peerObj.send(encrypted)
    })
  }

  onIncomingData = async (data, peerId) => {
    const result = decodeIncomingData(data)

    const peer = this.state.peers.find(p => p.id === peerId)

    // if there is no peer public key, we hope this first request is the public key
    if (!peer.peerPublicKey) {
      // TODO: check and make sure this is actually a public key
      this.setPeerState(peer.id, (p) => {
        return { ...p, peerPublicKey: result }
      },/* () => this.onSendChat({ type: 'introduction', name: this.state.userName })*/)

      // why doesn't this work after setting state:
      // this.onSendChat({ type: 'introduction', name: this.state.userName })
      // something to do with timing?
    } else {
      const { keys: [privKey] } = await openpgp.key.readArmored(peer.privateKeyArmored)
      await privKey.decrypt(defaultPassphrase)

      const { data: decrypted } = await openpgp.decrypt({
        message: await openpgp.message.readArmored(result),
        privateKeys: [privKey]
      })

      const parsed = JSON.parse(decrypted)

      // figure out what to do with the parsed message
      if (parsed.type === 'chat') {
        const message = { type: 'chat', from: peer.name, text: parsed.text }

        this.setState({ chats: [...this.state.chats, message] })
      } else if (parsed.type === 'introduction') {
        this.setPeerState(peer.id, (p) => {
          p.name = parsed.name
          return peer
        })
      }
    }
  }

  onConnected = async (peer, peerId) => {
    const { privateKeyArmored, publicKeyArmored, revocationCertificate } = await keygen()

    this.setPeerState(peerId, (p) => {
      p.peerObj.send(publicKeyArmored)
      return { ...p, privateKeyArmored, publicKeyArmored, revocationCertificate }
    })
  }

  onCreateRoom = (roomName, userName) => {
    this.setState({ userName })

    this.props.socket.on('failed-create', data => {
      alert(`failed to create room ${roomName}`)
    })

    // TODO: allow userId to come from app,
    // or gen a new one each time?
    this.props.socket.on('room-created', socketData => {
      console.log(socketData.roomId)
      this.setState(
        { state: 'room', userId: socketData.userId, roomId: socketData.roomId },
        () => this.onJoinRoom(socketData.roomId, userName, true)
      )
    })

    this.props.socket.emit('create-room', { name: roomName })
  }

  onJoinRoom = (roomId, userName, first = false) => {
    this.props.socket.on('present-list', socketData => {
      // set up the initial peers here
      const peers = socketData.list.map(item => {
        const peer = new Peer({
          initiator: false,
          trickle: false
        })

        peer.on('signal', data => {
          // emit answer
          this.props.socket.emit('answer', {
            roomId,
            answer: data,
            answerFrom: this.state.userId,
            answerTo: item.id
          })

          this.setState({ state: 'room' })
        })

        peer.on('connect', () => this.onConnected(peer, item.id))
        peer.on('data', data => this.onIncomingData(data, item.id))
        peer.on('error', err => console.error('peer-init-error', err))

        return { peerObj: peer, id: item.id }
      })

      this.setState({
        roomId,
        peers,
        state: 'joining',
        userId: socketData.userId
      })
    })

    this.props.socket.on('offer', socketData => {
      const { offerFrom, initiator } = socketData

      // the peer that the offer is from
      const offerFromPeer = this.state.peers.find(p => p.id === offerFrom)

      offerFromPeer.peerObj.signal(initiator)
    })

    this.props.socket.on('user-joining', socketData => {
      const peer = new Peer({
        initiator: true,
        trickle: false
      })

      // WARN: this.state.userId needs to be referenced directly
      peer.on('signal', data => {
        this.props.socket.emit('offer', {
          roomId,
          initiator: data,
          offerFrom: this.state.userId,
          offerTo: socketData.guestId
        })
      })

      peer.on('connect', data => this.onConnected(peer, socketData.guestId))
      peer.on('data', data => this.onIncomingData(data, socketData.guestId))
      peer.on('error', err => console.error('peer-join-error', err))

      this.setState({ peers: [...this.state.peers, { id: socketData.guestId, peerObj: peer }] })
    })

    this.props.socket.on('answer', socketData => {
      const { answerFrom, answer } = socketData

      const answerFromPeer = this.state.peers.find(p => p.id === answerFrom)

      answerFromPeer.peerObj.signal(answer)
    })

    if (!first) {
      this.props.socket.emit('join-room', { roomId })
      this.props.socket.on('failed-join', () => alert('failed to join room!'))
      this.setState({ userName })
    }
  }

  handleState = (s) => {
    switch (s) {
      case 'start':
        return <RoomForm
          handleCreateRoom={this.onCreateRoom}
          handleJoinRoom={this.onJoinRoom}
        />
      case 'joining':
        return <JoiningRoom />
      case 'room':
        return <ChatBox
          userName={this.state.userName}
          chats={this.state.chats}
          handleSendChat={(chatText) => this.onSendChat({ text: chatText })}
        />
      default: return <div />
    }
  }

  render () {
    return (
      <Background>
        <Container>
          <Topbar>
            <Title>TylerChat</Title>
          </Topbar>
          {this.handleState(this.state.state)}
        </Container>
      </Background>
    )
  }
}

export const AppWithContext = () =>
  <SocketContext.Consumer>
    {socket => <App socket={socket} />}
  </SocketContext.Consumer>

export default AppWithContext