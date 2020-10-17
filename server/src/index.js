const { v4: uuid } = require('uuid')

const server = require('http').createServer()
const io = require('socket.io')(server)

const PORT = 4000
const rooms = []
const roomDict = {}

const newUser = ({ userId, socketId, now }) => ({
  id: userId,
  socketId,
  joined: now
})

const newRoom = ({ roomId, name, userOne, now }) => ({
  id: roomId,
  name,
  users: [userOne],
  started: now
})

const debug = ({ message }) => console.info('DEBUG: ', message)

io.on('connection', socket => {
  console.info('connected!!', rooms.length)

  socket.on('debug', data => debug(data))

  socket.on('create-room', data => {
    console.info('room created', data)
    const now = Date.now()
    const roomId = uuid()

    // TODO: can the user come from the db in the future?
    const user = newUser({ userId: uuid(), socketId: socket.id, now })
    const room = newRoom({ roomId, name: data.name, userOne: user, now })

    roomDict[roomId] = room
    rooms.push(room)

    io.to(socket.id).emit('room-created', { roomId: room.id, userId: user.id })
  })

  socket.on('join-room', data => {
    // TODO: qualifying for the room with a password/limit or whatever
    const room = roomDict[data.roomId]

    if (!room) {
      io.to(socket.id).emit('failed-join')
      return
    }

    const userId = uuid()

    const list = []
    for (let i = 0; i < room.users.length; i++) {
      const presentUser = room.users[i]

      list.push({ id: presentUser.id })

      // tell all present users I need to get in.
      io.to(presentUser.socketId).emit('user-joining', { guestId: userId })
    }

    const now = Date.now()
    const user = newUser({ userId, socketId: socket.id, now })
    room.users.push(user)

    io.to(socket.id).emit('present-list', { list, userId })
    // get back all users
  })

  socket.on('offer', data => {
    // relay this to whoever we want to go to
    // TODO: add a check to make sure the offer is ALLOWED to go to someone
    const { offerFrom, offerTo, roomId, initiator } = data

    const room = roomDict[data.roomId]
    const destinedMember = room.users.find(user => user.id === offerTo)

    io.to(destinedMember.socketId).emit('offer', { initiator, offerFrom })
  })

  socket.on('answer', data => {
    // TODO: add a check to make sure the answer is ALLOWED to go to someone
    const { answerFrom, answerTo, roomId, answer } = data

    const room = roomDict[data.roomId]
    const destinedMember = room.users.find(user => user.id === answerTo)

    io.to(destinedMember.socketId).emit('answer', { answer, answerFrom })
  })
})

server.listen(PORT)

console.info(`listening on port ${PORT}`)
