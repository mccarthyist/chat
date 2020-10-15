const server = require('http').createServer()
const PORT = 4000

const io = require('socket.io')(server)

const rooms = []

const newUser = ({ socketId, offer = null, now }) => ({
  socketId,
  offer,
  joined: now
})

const newRoom = ({ name, userOne, now }) => ({
  name,
  users: [userOne],
  started: now
})

io.on('connection', (socket) => {
  console.info('connected!!', rooms.length)

  socket.on('create-room', (data) => {
    console.info('room created', data)
    const now = Date.now()
    const user = newUser({ socketId: socket.id, offer: data.initiator, now })
    const room = newRoom({ name: data.name, userOne: user, now })

    rooms.push(room)
  })

  socket.on('join-room', (data) => {
    const user = newUser({ socketId: socket.id, now: Date.now() })

    const room = rooms.find(room => room.name === data.name)

    if (room) {
      room.users.push(user)
      io.to(socket.id).emit('offer', { offer: room.users[0].offer })
    } else {
      io.to(socket.id).emit('failed-join')
    }
  })

  socket.on('answer', (data) => {
    const room = rooms.find(room => room.name === data.name)

    if (room) {
      io.to(room.users[0].socketId).emit('answer', { answer: data.answer })
    } else {
      console.error('cant find room with that name in answer')
    }
  })
})

server.listen(PORT)

console.info(`listening on port ${PORT}`)
